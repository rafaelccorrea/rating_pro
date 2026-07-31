import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AsaasConfigService } from './asaas-config.service';
import type { AsaasClient } from './asaas.client';
import { AsaasService } from './asaas.service';

/**
 * O AsaasService fala com Prisma e com o client HTTP; os dois entram mockados.
 * O que se trava aqui: o corpo da cobranca (split incluso), a corrida de dupla
 * cobranca, a reconciliacao do webhook (incluindo corpo hostil) e o
 * comportamento "nunca lanca" dos try*.
 */

const pendingPayment = {
  id: '11111111-1111-4111-8111-111111111111',
  orderId: 'order-1',
  method: 'pix',
  status: 'pending',
  amount: new Prisma.Decimal(500),
  asaasPaymentId: null,
  order: {
    id: 'order-1',
    code: 'RP-2026-000042',
    status: 'draft',
    reseller: {
      id: 'reseller-1',
      fullName: 'Revendedor Um',
      email: 'rev@test',
      phone: '11999999999',
      document: '111.444.777-35',
      asaasCustomerId: null,
    },
  },
};

function makeService(overrides?: {
  enabled?: boolean;
  splits?: Array<{ walletId: string; percentualValue: number }>;
  payment?: Record<string, unknown> | null;
  clientPost?: jest.Mock;
  clientGet?: jest.Mock;
  /** Quantas linhas o updateMany condicional afeta; 0 = perdeu a corrida. */
  claimCount?: number;
}) {
  const config = {
    enabled: overrides?.enabled ?? true,
    splits: overrides?.splits ?? [
      { walletId: 'wallet-socio-1', percentualValue: 70 },
      { walletId: 'wallet-socio-2', percentualValue: 30 },
    ],
    dueDays: 3,
  } as unknown as AsaasConfigService;

  const post =
    overrides?.clientPost ??
    jest.fn().mockImplementation((path: string) => {
      if (path === '/customers') return Promise.resolve({ id: 'cus_1' });
      return Promise.resolve({
        id: 'pay_asaas_1',
        invoiceUrl: 'https://asaas/i/1',
        bankSlipUrl: null,
        dueDate: '2026-08-03',
      });
    });

  const get =
    overrides?.clientGet ??
    jest.fn().mockImplementation((path: string) => {
      // Busca por externalReference: sem órfã por padrão.
      if (path.startsWith('/payments?')) return Promise.resolve({ data: [] });
      return Promise.resolve({ payload: 'pix-copia-e-cola' });
    });

  const del = jest.fn().mockResolvedValue({ deleted: true });

  const client = { post, get, delete: del } as unknown as AsaasClient;

  const updateMany = jest.fn().mockResolvedValue({ count: overrides?.claimCount ?? 1 });
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const profileUpdate = jest.fn().mockResolvedValue({});

  const prisma = {
    orderPayment: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides?.payment === undefined ? pendingPayment : overrides.payment),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...pendingPayment, asaasPaymentId: 'pay_asaas_1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany,
      update: paymentUpdate,
    },
    profile: { update: profileUpdate },
  } as unknown as PrismaService;

  return {
    service: new AsaasService(prisma, client, config),
    prisma,
    post,
    get,
    del,
    updateMany,
    paymentUpdate,
    profileUpdate,
  };
}

describe('AsaasService.tryCreateCharge', () => {
  it('é no-op com a integração desligada', async () => {
    const { service, post } = makeService({ enabled: false });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('cria a cobrança com o split 70/30 dos sócios', async () => {
    const { service, post, updateMany } = makeService();

    const updated = await service.tryCreateCharge(pendingPayment.id);

    expect(post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({
        customer: 'cus_1',
        billingType: 'PIX',
        value: 500,
        externalReference: pendingPayment.id,
        split: [
          { walletId: 'wallet-socio-1', percentualValue: 70 },
          { walletId: 'wallet-socio-2', percentualValue: 30 },
        ],
      }),
    );
    // O claim é condicional: só grava se a cobrança ainda não existir.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pendingPayment.id, asaasPaymentId: null },
        data: expect.objectContaining({
          asaasPaymentId: 'pay_asaas_1',
          pixPayload: 'pix-copia-e-cola',
        }),
      }),
    );
    expect(updated).toMatchObject({ asaasPaymentId: 'pay_asaas_1' });
  });

  it('perdeu a corrida: derruba no Asaas a cobrança recém-criada', async () => {
    const { service, del, updateMany } = makeService({ claimCount: 0 });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
    expect(updateMany).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('/payments/pay_asaas_1');
  });

  it('adota a cobrança órfã de uma tentativa anterior em vez de criar outra', async () => {
    const { service, post, updateMany } = makeService({
      clientGet: jest.fn().mockImplementation((path: string) => {
        if (path.startsWith('/payments?')) {
          return Promise.resolve({
            data: [
              { id: 'pay_deletada', deleted: true },
              { id: 'pay_orfa', invoiceUrl: 'https://asaas/i/orfa', dueDate: '2026-08-03' },
            ],
          });
        }
        return Promise.resolve({ payload: 'pix-copia-e-cola' });
      }),
    });

    await service.tryCreateCharge(pendingPayment.id);

    expect(post).not.toHaveBeenCalledWith('/payments', expect.anything());
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ asaasPaymentId: 'pay_orfa' }) }),
    );
  });

  it('sem split configurado o campo nem vai no corpo', async () => {
    const { service, post } = makeService({ splits: [] });

    await service.tryCreateCharge(pendingPayment.id);

    const body = post.mock.calls.find((call) => call[0] === '/payments')?.[1] as Record<
      string,
      unknown
    >;
    expect('split' in body).toBe(false);
  });

  it('cria o customer com CPF só de dígitos e guarda o id no perfil', async () => {
    const { service, post, profileUpdate } = makeService();

    await service.tryCreateCharge(pendingPayment.id);

    expect(post).toHaveBeenCalledWith(
      '/customers',
      expect.objectContaining({
        cpfCnpj: '11144477735',
        email: 'rev@test',
        mobilePhone: '11999999999',
        externalReference: 'reseller-1',
      }),
    );
    // Sem este update, cada cobrança criaria um customer novo no Asaas.
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: 'reseller-1' },
      data: { asaasCustomerId: 'cus_1' },
    });
  });

  it('telefone fixo vai como phone, não como mobilePhone', async () => {
    const { service, post } = makeService({
      payment: {
        ...pendingPayment,
        order: {
          ...pendingPayment.order,
          reseller: { ...pendingPayment.order.reseller, phone: '1133334444' },
        },
      },
    });

    await service.tryCreateCharge(pendingPayment.id);

    const body = post.mock.calls.find((call) => call[0] === '/customers')?.[1] as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ phone: '1133334444' });
    expect('mobilePhone' in body).toBe(false);
  });

  it('reaproveita o customer já criado no Asaas', async () => {
    const { service, post } = makeService({
      payment: {
        ...pendingPayment,
        order: {
          ...pendingPayment.order,
          reseller: { ...pendingPayment.order.reseller, asaasCustomerId: 'cus_antigo' },
        },
      },
    });

    await service.tryCreateCharge(pendingPayment.id);

    expect(post).not.toHaveBeenCalledWith('/customers', expect.anything());
    expect(post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ customer: 'cus_antigo' }),
    );
  });

  it('não cobra de novo quem já tem cobrança no Asaas', async () => {
    const { service, post } = makeService({
      payment: { ...pendingPayment, asaasPaymentId: 'pay_asaas_1' },
    });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('não gera cobrança para pedido cancelado ou recusado', async () => {
    for (const status of ['cancelled', 'rejected']) {
      const { service, post } = makeService({
        payment: { ...pendingPayment, order: { ...pendingPayment.order, status } },
      });

      expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
      expect(post).not.toHaveBeenCalled();
    }
  });

  it('revendedor sem CPF/CNPJ vira null + log, nunca exceção', async () => {
    const { service, post } = makeService({
      payment: {
        ...pendingPayment,
        order: {
          ...pendingPayment.order,
          reseller: { ...pendingPayment.order.reseller, document: null },
        },
      },
    });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
    expect(post).not.toHaveBeenCalledWith('/payments', expect.anything());
  });

  it('falha do gateway vira null, não derruba a criação do pedido', async () => {
    const { service } = makeService({
      clientPost: jest.fn().mockRejectedValue(new Error('Asaas fora do ar')),
    });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
  });

  it('valor zerado não gera cobrança', async () => {
    const { service, post } = makeService({
      payment: { ...pendingPayment, amount: new Prisma.Decimal(0) },
    });

    expect(await service.tryCreateCharge(pendingPayment.id)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('AsaasService.handleWebhookEvent', () => {
  function makeWebhookService(
    payment: { status: string; asaasPaymentId?: string | null } | null,
  ) {
    const found =
      payment === null
        ? null
        : {
            id: '11111111-1111-4111-8111-111111111111',
            orderId: 'order-1',
            status: payment.status,
            asaasPaymentId: payment.asaasPaymentId ?? 'pay_asaas_1',
          };

    const findFirst = jest.fn().mockResolvedValue(found);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      orderPayment: { findFirst, update },
    } as unknown as PrismaService;

    const service = new AsaasService(
      prisma,
      {} as AsaasClient,
      { enabled: true } as AsaasConfigService,
    );

    return { service, update, findFirst };
  }

  it('PAYMENT_RECEIVED baixa a cobrança pendente', async () => {
    const { service, update } = makeWebhookService({ status: 'pending' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'paid', reference: 'pay_asaas_1' }),
      }),
    );
  });

  it('reconcilia pelo externalReference quando o id local se perdeu', async () => {
    const { service, update, findFirst } = makeWebhookService({
      status: 'pending',
      asaasPaymentId: null,
    });

    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_1', externalReference: '11111111-1111-4111-8111-111111111111' },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { asaasPaymentId: 'pay_asaas_1' },
          { id: '11111111-1111-4111-8111-111111111111' },
        ],
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paid' }) }),
    );
  });

  it('não aplica evento de cobrança divergente da registrada', async () => {
    const { service, update } = makeWebhookService({
      status: 'pending',
      asaasPaymentId: 'pay_asaas_B',
    });

    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_A', externalReference: '11111111-1111-4111-8111-111111111111' },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('corpo hostil não vira filtro do Prisma', async () => {
    const { service, update, findFirst } = makeWebhookService({ status: 'pending' });

    // `{ not: '' }` casaria com QUALQUER cobrança se entrasse cru no where.
    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: { not: '' } },
    });

    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('externalReference que não é uuid é descartado em vez de estourar', async () => {
    const { service, findFirst } = makeWebhookService({ status: 'pending' });

    // Cobrança de outro sistema na mesma conta Asaas: o id local é uuid, e
    // consultar a coluna com lixo pausaria a fila de webhooks inteira.
    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_1', externalReference: 'pedido-123' },
    });

    expect(findFirst).toHaveBeenCalledWith({ where: { OR: [{ asaasPaymentId: 'pay_asaas_1' }] } });
  });

  it('corpo sem nada aproveitável responde ok sem consultar o banco', async () => {
    const { service, findFirst } = makeWebhookService({ status: 'pending' });

    await expect(
      service.handleWebhookEvent({ event: 'PAYMENT_RECEIVED', payment: {} }),
    ).resolves.toEqual({ received: true });
    await expect(service.handleWebhookEvent('não é json de webhook')).resolves.toEqual({
      received: true,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('reentrega do mesmo evento é no-op', async () => {
    const { service, update } = makeWebhookService({ status: 'paid' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('pagamento após cancelamento é registrado (boleto pago depois)', async () => {
    const { service, update } = makeWebhookService({ status: 'cancelled' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paid' }) }),
    );
  });

  it('PAYMENT_RESTORED devolve a cobrança cancelada para pendente', async () => {
    const { service, update } = makeWebhookService({ status: 'cancelled' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_RESTORED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    );
  });

  it('estorno só sai de paga', async () => {
    const { service, update } = makeWebhookService({ status: 'pending' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_REFUNDED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('cobrança paga não volta para cancelada', async () => {
    const { service, update } = makeWebhookService({ status: 'paid' });

    await service.handleWebhookEvent({
      event: 'PAYMENT_DELETED',
      payment: { id: 'pay_asaas_1' },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('evento desconhecido e cobrança inexistente respondem ok mesmo assim', async () => {
    const { service, update } = makeWebhookService(null);

    await expect(service.handleWebhookEvent({ event: 'PAYMENT_UPDATED' })).resolves.toEqual({
      received: true,
    });
    await expect(
      service.handleWebhookEvent({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_x' } }),
    ).resolves.toEqual({ received: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AsaasService.tryCancelPendingCharge', () => {
  function makeCancelService(
    payment: { id: string; status: string; asaasPaymentId: string | null } | null,
    enabled = true,
  ) {
    const del = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      orderPayment: { findFirst: jest.fn().mockResolvedValue(payment), update },
    } as unknown as PrismaService;

    const service = new AsaasService(
      prisma,
      { delete: del } as unknown as AsaasClient,
      { enabled } as AsaasConfigService,
    );

    return { service, del, update };
  }

  it('cancela no gateway e no banco', async () => {
    const { service, del, update } = makeCancelService({
      id: 'pay-local-1',
      status: 'pending',
      asaasPaymentId: 'pay_asaas_1',
    });

    await service.tryCancelPendingCharge('order-1');

    expect(del).toHaveBeenCalledWith('/payments/pay_asaas_1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
  });

  it('cobrança que nunca chegou ao gateway também é encerrada', async () => {
    // Sem isso ela ficaria pendente para sempre e a retentativa preguiçosa
    // geraria boleto de um pedido morto.
    const { service, del, update } = makeCancelService({
      id: 'pay-local-1',
      status: 'pending',
      asaasPaymentId: null,
    });

    await service.tryCancelPendingCharge('order-1');

    expect(del).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
  });

  it('falha no gateway não propaga', async () => {
    const { service } = makeCancelService({
      id: 'pay-local-1',
      status: 'pending',
      asaasPaymentId: 'pay_asaas_1',
    });

    await expect(service.tryCancelPendingCharge('order-1')).resolves.toBeUndefined();
  });

  it('integração desligada não mexe em nada', async () => {
    const { service, update } = makeCancelService(
      { id: 'pay-local-1', status: 'pending', asaasPaymentId: null },
      false,
    );

    await service.tryCancelPendingCharge('order-1');

    expect(update).not.toHaveBeenCalled();
  });
});

describe('AsaasService.tryCancelRemoteCharge', () => {
  function makeService(payment: { asaasPaymentId: string | null } | null) {
    const del = jest.fn().mockResolvedValue({});
    const prisma = {
      orderPayment: { findUnique: jest.fn().mockResolvedValue(payment) },
    } as unknown as PrismaService;

    const service = new AsaasService(
      prisma,
      { delete: del } as unknown as AsaasClient,
      { enabled: true } as AsaasConfigService,
    );

    return { service, del };
  }

  it('remove a fatura ainda aberta depois da baixa manual', async () => {
    const { service, del } = makeService({ asaasPaymentId: 'pay_asaas_1' });

    await service.tryCancelRemoteCharge('pay-local-1');

    expect(del).toHaveBeenCalledWith('/payments/pay_asaas_1');
  });

  it('cobrança sem gateway não tem o que remover', async () => {
    const { service, del } = makeService({ asaasPaymentId: null });

    await service.tryCancelRemoteCharge('pay-local-1');

    expect(del).not.toHaveBeenCalled();
  });
});
