import { Injectable, Logger } from '@nestjs/common';
import type { OrderPayment, PaymentStatus, Profile } from '@prisma/client';
import { onlyDigits, type PaymentMethod } from '@rating-pro/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AsaasConfigService } from './asaas-config.service';
import { AsaasClient } from './asaas.client';
import {
  asaasWebhookEventSchema,
  type AsaasCustomerResponse,
  type AsaasPaymentListResponse,
  type AsaasPaymentResponse,
  type AsaasPixQrCodeResponse,
} from './asaas.types';

const BILLING_TYPE: Record<PaymentMethod, string> = {
  pix: 'PIX',
  card: 'CREDIT_CARD',
  boleto: 'BOLETO',
};

/**
 * Eventos de cobranca -> status local. `PAYMENT_CONFIRMED` (cartao aprovado,
 * repasse futuro) ja libera a analise: o risco de chargeback e da operacao,
 * nao do cliente esperando o laudo.
 *
 * `PAYMENT_RESTORED` existe porque cobranca cancelada pode voltar a viver: o
 * boleto ja impresso continua pagavel no banco, e o Asaas restaura a cobranca
 * quando isso acontece.
 */
const EVENT_TO_STATUS: Record<string, PaymentStatus> = {
  PAYMENT_RECEIVED: 'paid',
  PAYMENT_CONFIRMED: 'paid',
  PAYMENT_REFUNDED: 'refunded',
  PAYMENT_DELETED: 'cancelled',
  PAYMENT_RESTORED: 'pending',
};

/**
 * De quais status locais cada destino pode vir. Fora disso o evento e ignorado.
 *
 * `cancelled -> paid` e permitido de proposito: dinheiro que entrou precisa
 * ficar registrado mesmo que a cobranca tenha sido cancelada antes (boleto
 * emitido e pago depois do cancelamento). O contrario — desfazer uma cobranca
 * paga — nunca sai daqui.
 */
const ALLOWED_FROM: Record<string, PaymentStatus[]> = {
  paid: ['pending', 'failed', 'cancelled'],
  refunded: ['paid'],
  cancelled: ['pending', 'failed'],
  pending: ['cancelled', 'failed'],
};

/** Pedido nesses status nao gera cobranca nova nem revive a que foi cancelada. */
const DEAD_ORDER_STATUSES = ['cancelled', 'rejected'];

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AsaasClient,
    private readonly config: AsaasConfigService,
  ) {}

  /**
   * Cria a cobranca no Asaas para um OrderPayment pendente, com o split entre
   * os socios configurado no ambiente.
   *
   * Nunca lanca: a cobranca local ja existe e o pedido nao pode falhar por
   * indisponibilidade do gateway. Devolve o pagamento atualizado, ou null
   * quando nao havia o que fazer (integracao desligada, ja cobrado, pedido
   * morto, erro) — quem chama segue com o registro que tinha. A proxima visita
   * a tela de pagamento tenta de novo.
   */
  async tryCreateCharge(paymentId: string): Promise<OrderPayment | null> {
    if (!this.config.enabled) return null;

    try {
      return await this.createCharge(paymentId);
    } catch (error) {
      this.logger.warn(`Cobrança Asaas não criada para o pagamento ${paymentId}: ${String(error)}`);
      return null;
    }
  }

  private async createCharge(paymentId: string): Promise<OrderPayment | null> {
    const payment = await this.prisma.orderPayment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { reseller: true } } },
    });

    if (!payment || payment.status !== 'pending' || payment.asaasPaymentId) return null;

    // Pedido cancelado/recusado nao pode ganhar cobranca nova pela retentativa
    // preguicosa — seria boleto valido de um pedido que ninguem vai entregar.
    if (DEAD_ORDER_STATUSES.includes(payment.order.status)) {
      this.logger.warn(
        `Pedido ${payment.order.code} está "${payment.order.status}": não gerei cobrança`,
      );
      return null;
    }

    const amount = payment.amount.toNumber();
    if (amount <= 0) return null; // preco de tabela zerado: nada a cobrar

    // Uma tentativa anterior pode ter criado a cobranca e morrido antes de
    // gravar o id (o POST nao tem chave de idempotencia). Adotar a orfa evita
    // um segundo boleto valido para o mesmo pedido.
    const orphan = await this.findChargeByExternalReference(payment.id);
    if (orphan) {
      this.logger.warn(`Adotei a cobrança ${orphan.id}, já existente no Asaas para ${payment.id}`);
      return this.claim(payment, orphan);
    }

    const customerId = await this.ensureCustomer(payment.order.reseller);

    const splits = this.config.splits;
    const created = await this.client.post<AsaasPaymentResponse>('/payments', {
      customer: customerId,
      billingType: BILLING_TYPE[payment.method],
      value: amount,
      dueDate: this.dueDate(),
      description: `Rating ${payment.order.code}`,
      // Reconciliacao reserva do webhook, caso o asaas_payment_id se perca.
      externalReference: payment.id,
      ...(splits.length > 0 ? { split: splits } : {}),
    });

    const updated = await this.claim(payment, created);

    if (!updated) {
      // Outra requisicao concorrente ganhou a corrida e ja gravou a cobranca
      // dela. Duas cobrancas vivas para o mesmo pedido significa cliente
      // pagando duas vezes: derruba a que acabou de nascer.
      this.logger.warn(`Corrida de cobrança em ${payment.id}: removendo ${created.id} do Asaas`);
      await this.client.delete(`/payments/${created.id}`).catch((error: unknown) => {
        this.logger.error(`Cobrança duplicada ${created.id} ficou aberta no Asaas: ${String(error)}`);
      });

      return null;
    }

    this.logger.log(
      `Cobrança ${created.id} criada no Asaas para ${payment.order.code}` +
        (splits.length > 0
          ? ` (split ${splits.map((s) => `${s.percentualValue}%`).join('/')})`
          : ''),
    );

    return updated;
  }

  /**
   * Grava a cobranca no OrderPayment, mas so se ele ainda estiver sem uma.
   *
   * O `updateMany` com `asaasPaymentId: null` no where e o que fecha a corrida:
   * duas requisicoes simultaneas podem chegar aqui, e apenas a primeira afeta
   * linha. `null` de volta significa "perdi a corrida".
   */
  private async claim(
    payment: OrderPayment,
    charge: AsaasPaymentResponse,
  ): Promise<OrderPayment | null> {
    // Cosmetico: se falhar, a fatura hospedada ainda mostra o QR.
    const pixPayload =
      payment.method === 'pix'
        ? await this.client
            .get<AsaasPixQrCodeResponse>(`/payments/${charge.id}/pixQrCode`)
            .then((qr) => qr.payload ?? null)
            .catch(() => null)
        : null;

    const claimed = await this.prisma.orderPayment.updateMany({
      where: { id: payment.id, asaasPaymentId: null },
      data: {
        asaasPaymentId: charge.id,
        reference: charge.id,
        invoiceUrl: charge.invoiceUrl ?? null,
        bankSlipUrl: charge.bankSlipUrl ?? null,
        pixPayload,
        dueDate: charge.dueDate ? new Date(charge.dueDate) : null,
      },
    });

    if (claimed.count === 0) return null;

    return this.prisma.orderPayment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  /**
   * Procura no Asaas uma cobranca ja criada para este OrderPayment. Serve para
   * adotar a orfa de uma tentativa que caiu entre o POST e a gravacao do id.
   */
  private async findChargeByExternalReference(
    paymentId: string,
  ): Promise<AsaasPaymentResponse | null> {
    const found = await this.client.get<AsaasPaymentListResponse>(
      `/payments?externalReference=${encodeURIComponent(paymentId)}&limit=10`,
    );

    return found.data?.find((charge) => charge.deleted !== true) ?? null;
  }

  /**
   * O revendedor como customer do Asaas, criado sob demanda e reaproveitado.
   * Exige CPF/CNPJ no perfil — sem ele o Asaas recusa o cadastro.
   */
  private async ensureCustomer(reseller: Profile): Promise<string> {
    if (reseller.asaasCustomerId) return reseller.asaasCustomerId;

    const document = onlyDigits(reseller.document ?? '');
    if (document.length !== 11 && document.length !== 14) {
      throw new Error(
        `revendedor ${reseller.email} sem CPF/CNPJ válido no perfil; ` +
          'peça a um master para completar o cadastro',
      );
    }

    const phone = onlyDigits(reseller.phone ?? '');

    const customer = await this.client.post<AsaasCustomerResponse>('/customers', {
      name: reseller.fullName,
      cpfCnpj: document,
      email: reseller.email,
      // 11 digitos e celular; 10 e fixo, e o Asaas recusa fixo em mobilePhone.
      ...(phone.length === 11 ? { mobilePhone: phone } : {}),
      ...(phone.length === 10 ? { phone } : {}),
      externalReference: reseller.id,
    });

    await this.prisma.profile.update({
      where: { id: reseller.id },
      data: { asaasCustomerId: customer.id },
    });

    return customer.id;
  }

  /**
   * Baixa vinda do Asaas. Mesma regra da confirmacao manual do master, com
   * outro disparador — exatamente o gancho previsto em confirmPayment.
   *
   * Problema permanente (corpo invalido, cobranca desconhecida, transicao que
   * nao se aplica) resolve com log e ACK: devolver erro faria o Asaas
   * reenfileirar o mesmo evento para sempre e pausar TODOS os seguintes. Falha
   * transitoria de banco, ao contrario, sobe — ai reenviar e justamente o que
   * salva a confirmacao.
   */
  async handleWebhookEvent(raw: unknown): Promise<{ received: true }> {
    const parsed = asaasWebhookEventSchema.safeParse(raw);

    if (!parsed.success) {
      this.logger.warn('Webhook com corpo fora do formato esperado; ignorado');
      return { received: true };
    }

    const body = parsed.data;
    const event = body.event ?? '';
    const target = EVENT_TO_STATUS[event];

    if (!target) {
      this.logger.debug(`Webhook ${event || 'sem evento'} ignorado`);
      return { received: true };
    }

    const asaasId = body.payment?.id;
    const localId = body.payment?.externalReference;

    if (!asaasId && !localId) {
      this.logger.warn(`Webhook ${event} sem identificação de cobrança; ignorado`);
      return { received: true };
    }

    const payment = await this.prisma.orderPayment.findFirst({
      where: {
        OR: [
          ...(asaasId ? [{ asaasPaymentId: asaasId }] : []),
          ...(localId ? [{ id: localId }] : []),
        ],
      },
    });

    if (!payment) {
      this.logger.warn(`Webhook ${event}: cobrança ${asaasId ?? localId ?? '?'} não encontrada`);
      return { received: true };
    }

    // Casou pelo externalReference, mas o pedido aponta para OUTRA cobranca:
    // ha duas vivas no Asaas para o mesmo pagamento. Aplicar o evento
    // esconderia a segunda — o caso pede olho humano, nao baixa automatica.
    if (asaasId && payment.asaasPaymentId && payment.asaasPaymentId !== asaasId) {
      this.logger.error(
        `Webhook ${event}: cobrança ${asaasId} diverge da registrada ` +
          `(${payment.asaasPaymentId}) no pagamento ${payment.id}; verifique duplicidade no Asaas`,
      );
      return { received: true };
    }

    if (payment.status === target) return { received: true }; // reentrega: no-op

    if (!ALLOWED_FROM[target]?.includes(payment.status)) {
      this.logger.warn(
        `Webhook ${event}: cobrança ${payment.id} em "${payment.status}" não vai para "${target}"`,
      );
      return { received: true };
    }

    // `paidAt` e preenchido por trigger quando o status vira paid.
    await this.prisma.orderPayment.update({
      where: { id: payment.id },
      data: { status: target, ...(asaasId ? { reference: asaasId } : {}) },
    });

    this.logger.log(`Webhook ${event}: cobrança ${payment.id} -> ${target}`);
    return { received: true };
  }

  /**
   * Fecha a cobranca pendente de um pedido que morreu (cancelado ou recusado).
   *
   * Marca como cancelada tambem a cobranca que nunca chegou ao gateway: sem
   * isso ela ficaria pendente para sempre, e a retentativa preguicosa poderia
   * gerar boleto de um pedido que ninguem vai entregar.
   *
   * Best-effort: falha vira log, nunca impede a mudanca de status do pedido.
   */
  async tryCancelPendingCharge(orderId: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const payment = await this.prisma.orderPayment.findFirst({
        where: { orderId, status: 'pending' },
      });

      if (!payment) return;

      if (payment.asaasPaymentId) {
        await this.client.delete(`/payments/${payment.asaasPaymentId}`);
      }

      await this.prisma.orderPayment.update({
        where: { id: payment.id },
        data: { status: 'cancelled' },
      });

      this.logger.log(
        `Cobrança ${payment.asaasPaymentId ?? payment.id} cancelada (pedido ${orderId})`,
      );
    } catch (error) {
      this.logger.warn(`Não cancelei a cobrança Asaas do pedido ${orderId}: ${String(error)}`);
    }
  }

  /**
   * Remove do gateway a cobranca de um pagamento fechado por fora (baixa manual
   * do master). Sem isso o boleto/PIX continua pagavel e o cliente pode pagar
   * de novo — o webhook viria como reentrega e o dinheiro extra nao apareceria
   * em lugar nenhum.
   *
   * So mexe no Asaas: o status local ja foi decidido por quem chamou.
   */
  async tryCancelRemoteCharge(paymentId: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const payment = await this.prisma.orderPayment.findUnique({ where: { id: paymentId } });

      if (!payment?.asaasPaymentId) return;

      await this.client.delete(`/payments/${payment.asaasPaymentId}`);
      this.logger.log(`Cobrança ${payment.asaasPaymentId} removida do Asaas (baixa manual)`);
    } catch (error) {
      this.logger.warn(`Não removi a cobrança Asaas do pagamento ${paymentId}: ${String(error)}`);
    }
  }

  /**
   * Vencimento em dias corridos. A data sai em UTC: perto da meia-noite de
   * Brasília pode cair um dia a frente — nunca antes de hoje, que e o que o
   * Asaas exige.
   */
  private dueDate(): string {
    return new Date(Date.now() + this.config.dueDays * 86_400_000).toISOString().slice(0, 10);
  }
}
