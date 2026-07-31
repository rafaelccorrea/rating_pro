import { z } from 'zod';
import type { PaymentMethod } from './rating-request';

/**
 * Painel dos socios: quanto entrou de fato e quanto cabe a cada um.
 *
 * Duas regras valem para tudo aqui:
 *
 * 1. REGIME DE CAIXA. A base e `order_payments.paid_at`, nunca o valor dos
 *    pedidos entregues. Pedido entregue cuja cobranca nao foi paga e promessa,
 *    e promessa nao se divide entre socios.
 * 2. VALOR DEVIDO, NAO CREDITADO. O rateio diz o que cabe a cada um; o credito
 *    na conta segue o prazo do meio de pagamento (PIX ~D+1, cartao ~D+30).
 */

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato aaaa-mm-dd');

export const partnersQuerySchema = z
  .object({
    /** Inicio do periodo, inclusive. Vazio = primeiro dia do mes corrente. */
    from: isoDate.optional(),
    /** Fim do periodo, inclusive. Vazio = hoje. */
    to: isoDate.optional(),
    /** Quantos meses a serie historica cobre, contando o mes corrente. */
    months: z.coerce.number().int().min(1).max(24).default(6),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'O início do período não pode ser depois do fim',
    path: ['from'],
  });
export type PartnersQuery = z.infer<typeof partnersQuerySchema>;

/** Fatia de um socio no rateio. */
export interface PartnerSplitConfig {
  /** `main` para a conta que emite as cobrancas; senao o walletId. */
  key: string;
  name: string;
  percent: number;
  walletId: string | null;
}

export interface PartnerResult extends PartnerSplitConfig {
  /** Devido pelo rateio de cada cobranca paga no periodo. */
  received: number;
  /** Comissao de revendedor atribuida a este socio, na mesma proporcao. */
  commission: number;
  /** `received` menos `commission`. */
  net: number;
}

/** Um valor que so faz sentido junto com a quantidade que o gerou. */
export interface AmountCount {
  amount: number;
  count: number;
}

export interface OverdueCharge {
  paymentId: string;
  orderId: string;
  code: string;
  clientName: string;
  resellerName: string;
  amount: number;
  method: PaymentMethod;
  dueDate: string;
  daysLate: number;
  invoiceUrl: string | null;
}

export interface PartnersOverview {
  period: { from: string; to: string };

  /** Rateio vigente no ambiente — o combinado, independente do periodo. */
  splitConfig: PartnerSplitConfig[];
  /** Falso quando ASAAS_API_KEY esta vazia: nada passa pelo split. */
  gatewayEnabled: boolean;

  cash: {
    /** Bruto cobrado nas cobrancas pagas no periodo. */
    gross: number;
    /** Liquido; igual ao bruto nas cobrancas sem taxa registrada. */
    net: number;
    /**
     * `gross` menos `net`. `null` quando NENHUMA cobranca do periodo trouxe o
     * liquido do gateway — a taxa existe, so nao foi registrada, e mostrar
     * zero seria apresentar estimativa como fato.
     */
    fees: number | null;
    count: number;
    avgTicket: number;
    /** Mesmo intervalo imediatamente anterior. */
    previous: number;
    /** Variacao percentual sobre o periodo anterior; `null` sem base. */
    changePct: number | null;
    /** Cartao aprovado que ainda nao virou dinheiro (repasse futuro). */
    settling: number;
    /** Estornado no periodo, pela data do estorno. */
    refunded: number;
  };

  /** Comissao gerada sobre o que foi pago no periodo. Nunca "a pagar". */
  commission: number;

  partners: PartnerResult[];

  /**
   * Dinheiro recebido que nao passou por rateio nenhum (baixa manual, ou
   * cobranca anterior ao registro do split). Nao entra na conta de ninguem.
   */
  unattributed: AmountCount;

  receivables: {
    /** Em aberto e dentro do prazo. */
    open: number;
    overdue: number;
    overdueCount: number;
    /** Pedidos vivos que nunca geraram cobranca. */
    uncharged: AmountCount;
    /** Cobranca pendente que nunca chegou ao gateway. */
    withoutGateway: AmountCount;
  };

  overdueCharges: OverdueCharge[];

  /** Do mes mais antigo ao atual. `byPartner` e indexado pela `key`. */
  monthly: Array<{
    month: string;
    /** Recebido, pela data do pagamento. */
    received: number;
    /** Prometido: cobranca em aberto, pela data de vencimento. */
    promised: number;
    byPartner: Record<string, number>;
  }>;

  byMethod: Array<{ method: PaymentMethod; total: number; count: number }>;

  topResellers: Array<{
    id: string;
    name: string;
    total: number;
    count: number;
    commission: number;
  }>;

  /**
   * Quanto do que entrou no periodo passou por rateio conhecido:
   * - `snapshot`: tudo — os numeros sao historicos, nao recalculados;
   * - `partial`: parte nao passou pelo gateway (ver `unattributed`);
   * - `none`: nenhuma cobranca rateada, com ou sem dinheiro no periodo.
   */
  splitSource: 'snapshot' | 'partial' | 'none';
}
