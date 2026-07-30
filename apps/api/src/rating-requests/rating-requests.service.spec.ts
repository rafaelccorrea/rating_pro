import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { OrderStatus } from '@rating-pro/shared';
import type { AuthenticatedUser } from '../common/types';
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

function makeService(overrides: {
  order?: { resellerId: string; status: OrderStatus; personType: 'pf' | 'pj' } | null;
  documents?: Array<{ slot: string | null }>;
  application?: { orderId: string } | null;
  profile?: { id: string; role: string; status: string } | null;
}) {
  const {
    order = null,
    documents = [],
    application = { orderId: 'order-1' },
    profile = null,
  } = overrides;

  const update = jest.fn().mockResolvedValue({
    id: 'order-1',
    code: 'RP-2026-000001',
    status: 'submitted',
    trackingToken: 'token',
  });

  const prisma = {
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
    orderPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    profile: { findUnique: jest.fn().mockResolvedValue(profile) },
  } as unknown as PrismaService;

  const storage = {} as DocumentStorageService;

  return { service: new RatingRequestsService(prisma, storage, config), update };
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
});
