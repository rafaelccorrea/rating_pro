import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@rating-pro/shared';
import type { AuthenticatedUser } from '../common/types';
import type { AsaasService } from '../integrations/asaas/asaas.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DocumentStorageService } from '../storage/document-storage.service';
import { RatingRequestsService } from './rating-requests.service';

const reseller: AuthenticatedUser = {
  id: 'reseller-1',
  email: 'rev@test',
  fullName: 'Revendedor',
  role: 'reseller',
  status: 'active',
  commissionRate: 0.3,
};

const master: AuthenticatedUser = { ...reseller, id: 'master-1', role: 'master' };

const config = {
  get: (key: string) =>
    ({
      CREDENTIALS_KEY: randomBytes(32).toString('base64'),
      RATING_PRICE_PF: 0,
      RATING_PRICE_PJ: 0,
      PIX_KEY: '',
    })[key],
} as unknown as ConfigService<never, true>;

/** Cobranca pendente do fluxo manual (sem gateway). */
const manualPayment = {
  id: 'pay-local-1',
  orderId: 'order-1',
  method: 'pix' as const,
  status: 'pending',
  amount: new Prisma.Decimal(1200),
  reference: null,
  asaasPaymentId: null,
  invoiceUrl: null,
  bankSlipUrl: null,
  pixPayload: null,
  dueDate: null,
  paidAt: null,
  note: null,
  createdAt: new Date('2026-07-31T12:00:00Z'),
  updatedAt: new Date('2026-07-31T12:00:00Z'),
};

/** A mesma cobranca depois de criada no Asaas. */
const asaasPayment = {
  ...manualPayment,
  asaasPaymentId: 'pay_asaas_1',
  reference: 'pay_asaas_1',
  invoiceUrl: 'https://asaas/i/1',
  bankSlipUrl: 'https://asaas/b/1',
  pixPayload: 'pix-copia-e-cola',
  dueDate: new Date('2026-08-03T00:00:00Z'),
};

function makeService(overrides: {
  order?: { resellerId: string; status: OrderStatus; personType: 'pf' | 'pj' } | null;
  documents?: Array<{ slot: string | null }>;
  application?: { orderId: string } | null;
  profile?: { id: string; role: string; status: string } | null;
  payment?: Record<string, unknown> | null;
  /** O que o gateway devolve; null = integração desligada ou falha. */
  charged?: Record<string, unknown> | null;
  pixKey?: string;
}) {
  const {
    order = null,
    documents = [],
    application = { orderId: 'order-1' },
    profile = null,
    payment = null,
    charged = null,
    pixKey = '',
  } = overrides;

  const update = jest.fn().mockResolvedValue({
    id: 'order-1',
    code: 'RP-2026-000001',
    status: 'submitted',
    trackingToken: 'token',
  });

  const paymentCreate = jest.fn().mockResolvedValue(manualPayment);

  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        client: {
          upsert: jest
            .fn()
            .mockResolvedValue({ id: 'client-1', personType: 'pf' }),
        },
        ratingOrder: {
          create: jest.fn().mockResolvedValue({ id: 'order-1', code: 'RP-2026-000001' }),
        },
        orderApplication: { create: jest.fn().mockResolvedValue({}) },
        orderPayment: { create: paymentCreate },
      }),
    ),
    ratingOrder: {
      findUnique: jest.fn().mockResolvedValue(
        order
          ? {
              id: 'order-1',
              status: order.status,
              resellerId: order.resellerId,
              client: { personType: order.personType },
            }
          : null,
      ),
      update,
    },
    orderDocument: { findMany: jest.fn().mockResolvedValue(documents) },
    orderApplication: { findUnique: jest.fn().mockResolvedValue(application) },
    orderPayment: { findFirst: jest.fn().mockResolvedValue(payment) },
    profile: { findUnique: jest.fn().mockResolvedValue(profile) },
  } as unknown as PrismaService;

  const storage = {} as DocumentStorageService;

  const tryCreateCharge = jest.fn().mockResolvedValue(charged);
  const tryCancelRemoteCharge = jest.fn().mockResolvedValue(undefined);
  const asaas = { tryCreateCharge, tryCancelRemoteCharge } as unknown as AsaasService;

  const serviceConfig = {
    get: (key: string) => (key === 'PIX_KEY' ? pixKey : (config.get as (k: string) => unknown)(key)),
  } as unknown as ConfigService<never, true>;

  return {
    service: new RatingRequestsService(prisma, storage, serviceConfig, asaas),
    update,
    paymentCreate,
    tryCreateCharge,
    tryCancelRemoteCharge,
    prisma,
  };
}

describe('RatingRequestsService.submit', () => {
  it('barra o envio quando falta documento obrigatório', async () => {
    const { service } = makeService({
      order: { resellerId: reseller.id, status: 'draft', personType: 'pj' },
      documents: [{ slot: 'dre' }],
    });

    // PJ exige DRE e Balanço; só o DRE subiu.
    await expect(service.submit(reseller, 'order-1')).rejects.toThrow(/Balanço Patrimonial/);
  });

  it('envia para análise com o checklist obrigatório completo', async () => {
    const { service, update } = makeService({
      order: { resellerId: reseller.id, status: 'draft', personType: 'pj' },
      documents: [{ slot: 'dre' }, { slot: 'balanceSheet' }],
    });

    const result = await service.submit(reseller, 'order-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'submitted' }) }),
    );
    expect(result.order.status).toBe('submitted');
  });

  it('recusa pedido de outro revendedor', async () => {
    const { service } = makeService({
      order: { resellerId: 'outro', status: 'draft', personType: 'pf' },
    });

    await expect(service.submit(reseller, 'order-1')).rejects.toThrow(ForbiddenException);
  });

  it('recusa pedido que já saiu do rascunho', async () => {
    const { service } = makeService({
      order: { resellerId: reseller.id, status: 'in_analysis', personType: 'pf' },
    });

    await expect(service.submit(reseller, 'order-1')).rejects.toThrow(BadRequestException);
  });

  it('recusa pedido que não veio deste fluxo', async () => {
    const { service } = makeService({
      order: { resellerId: reseller.id, status: 'draft', personType: 'pf' },
      documents: [{ slot: 'docFront' }, { slot: 'docBack' }, { slot: 'selfie' }],
      application: null,
    });

    await expect(service.submit(reseller, 'order-1')).rejects.toThrow(/fluxo de contratação/);
  });
});

const baseInput = {
  personType: 'pf',
  name: 'Fulano',
  document: '11144477735',
  birthDate: '1990-01-01',
  email: 'a@b.com',
  phone: '11999999999',
  applicant: {
    maritalStatus: 'solteiro',
    education: 'superior',
    occupation: 'Analista',
    serasaPassword: 'segredo',
  },
  paymentMethod: 'pix',
} as const;

describe('RatingRequestsService.create', () => {
  it('exige que o master diga em nome de qual revendedor', async () => {
    const { service } = makeService({});

    await expect(service.create(master, { ...baseInput })).rejects.toThrow(
      /em nome de qual revendedor/,
    );
  });

  it('recusa revendedor inexistente ou que não é revendedor', async () => {
    const { service } = makeService({ profile: { id: 'x', role: 'master', status: 'active' } });

    await expect(
      service.create(master, { ...baseInput, resellerId: 'a3d0e0f1-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/Revendedor não encontrado/);
  });

  it('recusa revendedor inativo', async () => {
    const { service } = makeService({
      profile: { id: 'x', role: 'reseller', status: 'suspended' },
    });

    await expect(
      service.create(master, { ...baseInput, resellerId: 'a3d0e0f1-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/inativo/);
  });

  it('cobra no gateway depois de fechar a transação, não dentro dela', async () => {
    const { service, tryCreateCharge, prisma, paymentCreate } = makeService({
      charged: asaasPayment,
    });

    const result = await service.create(reseller, baseInput);

    // Chamada HTTP dentro da transação seguraria lock de banco; a ordem aqui é
    // decisão de projeto, não acaso.
    expect(paymentCreate).toHaveBeenCalled();
    expect(tryCreateCharge).toHaveBeenCalledWith(manualPayment.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.payment.instructions.invoiceUrl).toBe('https://asaas/i/1');
  });

  it('gateway indisponível ainda devolve o pedido com a cobrança pendente', async () => {
    const { service } = makeService({ charged: null, pixKey: 'chave@pix' });

    const result = await service.create(reseller, baseInput);

    expect(result.code).toBe('RP-2026-000001');
    expect(result.payment.status).toBe('pending');
    expect(result.payment.instructions).toMatchObject({ pixKey: 'chave@pix', invoiceUrl: null });
  });
});

describe('RatingRequestsService.findPayment', () => {
  it('com cobrança no Asaas, a instrução é a do gateway', async () => {
    const { service, tryCreateCharge } = makeService({
      order: { resellerId: reseller.id, status: 'submitted', personType: 'pf' },
      payment: asaasPayment,
      pixKey: 'chave@pix',
    });

    const result = await service.findPayment(reseller, 'order-1');

    // Já tem cobrança: não retenta no gateway.
    expect(tryCreateCharge).not.toHaveBeenCalled();
    expect(result?.instructions).toEqual({
      type: 'pix',
      // A chave estática do .env não aparece quando o gateway é quem cobra.
      pixKey: null,
      invoiceUrl: 'https://asaas/i/1',
      pixPayload: 'pix-copia-e-cola',
      bankSlipUrl: 'https://asaas/b/1',
      dueDate: '2026-08-03',
    });
  });

  it('sem gateway, segue o fluxo manual com a chave PIX do ambiente', async () => {
    const { service } = makeService({
      order: { resellerId: reseller.id, status: 'submitted', personType: 'pf' },
      payment: manualPayment,
      charged: null,
      pixKey: 'chave@pix',
    });

    const result = await service.findPayment(reseller, 'order-1');

    expect(result?.instructions).toEqual({
      type: 'pix',
      pixKey: 'chave@pix',
      invoiceUrl: null,
      pixPayload: null,
      bankSlipUrl: null,
      dueDate: null,
    });
  });

  it('cobrança pendente sem gateway é retentada na consulta', async () => {
    const { service, tryCreateCharge } = makeService({
      order: { resellerId: reseller.id, status: 'submitted', personType: 'pf' },
      payment: manualPayment,
      charged: asaasPayment,
    });

    const result = await service.findPayment(reseller, 'order-1');

    expect(tryCreateCharge).toHaveBeenCalledWith(manualPayment.id);
    expect(result?.instructions.invoiceUrl).toBe('https://asaas/i/1');
  });

  it('cobrança já paga não vira retentativa de cobrança', async () => {
    const { service, tryCreateCharge } = makeService({
      order: { resellerId: reseller.id, status: 'delivered', personType: 'pf' },
      payment: { ...manualPayment, status: 'paid', paidAt: new Date('2026-07-31T13:00:00Z') },
    });

    await service.findPayment(reseller, 'order-1');

    expect(tryCreateCharge).not.toHaveBeenCalled();
  });
});

describe('RatingRequestsService.confirmPayment', () => {
  it('baixa manual encerra a fatura ainda aberta no Asaas', async () => {
    const { service, tryCancelRemoteCharge, prisma } = makeService({});
    (prisma.orderPayment as unknown as { findUnique: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue(asaasPayment);
    (prisma.orderPayment as unknown as { update: jest.Mock }).update = jest
      .fn()
      .mockResolvedValue({ ...asaasPayment, status: 'paid' });

    await service.confirmPayment(master, asaasPayment.id, {
      status: 'paid',
      reference: '',
      note: '',
    });

    expect(tryCancelRemoteCharge).toHaveBeenCalledWith(asaasPayment.id);
  });

  it('estorno não tenta remover a cobrança (lá ela já está paga)', async () => {
    const { service, tryCancelRemoteCharge, prisma } = makeService({});
    (prisma.orderPayment as unknown as { findUnique: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue({ ...asaasPayment, status: 'paid' });
    (prisma.orderPayment as unknown as { update: jest.Mock }).update = jest
      .fn()
      .mockResolvedValue({ ...asaasPayment, status: 'refunded' });

    await service.confirmPayment(master, asaasPayment.id, {
      status: 'refunded',
      reference: '',
      note: '',
    });

    expect(tryCancelRemoteCharge).not.toHaveBeenCalled();
  });
});
