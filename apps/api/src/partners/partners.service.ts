import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OverdueCharge,
  PartnersOverview,
  PartnersQuery,
  PaymentMethod,
} from '@rating-pro/shared';
import { AsaasConfigService } from '../integrations/asaas/asaas-config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPartnerResults,
  changePct,
  parseSplitSnapshot,
  partnerTotals,
  summarizeCash,
  toSplitConfig,
  type PaidPayment,
} from './partners-report';

/**
 * Fuso fixo do negocio. Brasilia nao tem mais horario de verao desde 2019,
 * entao o offset e constante e nao vale arrastar uma biblioteca de timezone
 * para o projeto por causa disto.
 *
 * Agregar em UTC jogaria todo recebimento depois das 21h do dia 31 para o mes
 * seguinte, e os dois socios fechariam meses diferentes do extrato do Asaas.
 */
const BRT = '-03:00';
const BRT_TZ = 'America/Sao_Paulo';

/**
 * Pedido morto nao tem promessa de pagamento a exibir. O filtro e obrigatorio
 * em toda consulta de "a receber": o cancelamento da cobranca no gateway e
 * best-effort, entao existe cobranca pendente pendurada em pedido cancelado.
 */
const LIVE_ORDER: Prisma.EnumOrderStatusFilter = { notIn: ['cancelled', 'rejected'] };

/** Linha crua do levantamento central. */
interface PaymentRow {
  gross: number;
  net: number | null;
  split: unknown;
  method: PaymentMethod;
  commission: number;
  /** `YYYY-MM` no fuso de Brasilia. */
  month: string;
  /** `YYYY-MM-DD` no fuso de Brasilia. */
  day: string;
  reseller_id: string;
  reseller_name: string;
}

/** Pagamento com o que o painel precisa alem da matematica do rateio. */
interface Paid extends PaidPayment {
  day: string;
  method: PaymentMethod;
  resellerId: string;
  resellerName: string;
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasConfigService,
  ) {}

  async overview(query: PartnersQuery): Promise<PartnersOverview> {
    const today = todayInBRT();
    const from = query.from ?? firstDayOfMonth(today);
    const to = query.to ?? today;

    const periodStart = startOfDay(from);
    const periodEnd = startOfNextDay(to);
    const seriesStart = startOfDay(monthsBack(firstDayOfMonth(today), query.months - 1));
    const tomorrow = startOfNextDay(today);

    // Uma janela só cobre o período e a série; o resto é agregado em memória.
    const windowStart = periodStart < seriesStart ? periodStart : seriesStart;
    const windowEnd = periodEnd > tomorrow ? periodEnd : tomorrow;

    // Mesma duração, imediatamente antes: é a comparação que responde "melhor
    // ou pior que da última vez".
    const previousStart = new Date(
      periodStart.getTime() - (periodEnd.getTime() - periodStart.getTime()),
    );

    const [
      rows,
      previous,
      settling,
      refunded,
      openReceivable,
      overdue,
      overdueCharges,
      promised,
      uncharged,
      withoutGateway,
    ] = await Promise.all([
      this.paidRows(windowStart, windowEnd),
      this.paidTotal(previousStart, periodStart),
      // Estado de agora, não do período: dinheiro aprovado esperando repasse.
      this.prisma.orderPayment.aggregate({
        where: { status: 'paid', asaasStatus: 'CONFIRMED' },
        _sum: { amount: true },
      }),
      this.prisma.orderPayment.aggregate({
        where: { status: 'refunded', refundedAt: { gte: periodStart, lt: periodEnd } },
        _sum: { amount: true },
      }),
      this.prisma.orderPayment.aggregate({
        where: {
          status: 'pending',
          order: { status: LIVE_ORDER },
          OR: [{ dueDate: null }, { dueDate: { gte: startOfDay(today) } }],
        },
        _sum: { amount: true },
      }),
      this.prisma.orderPayment.aggregate({
        where: { status: 'pending', order: { status: LIVE_ORDER }, dueDate: { lt: startOfDay(today) } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.orderPayment.findMany({
        where: { status: 'pending', order: { status: LIVE_ORDER }, dueDate: { lt: startOfDay(today) } },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          order: {
            select: {
              id: true,
              code: true,
              client: { select: { name: true } },
              reseller: { select: { fullName: true } },
            },
          },
        },
      }),
      this.promisedByMonth(),
      // Pedido vivo que nunca gerou cobrança: não está nem em "recebido" nem
      // em "a receber" — some de qualquer soma que se faça hoje.
      this.prisma.ratingOrder.aggregate({
        where: { status: { notIn: ['draft', 'cancelled', 'rejected'] }, payments: { none: {} } },
        _sum: { saleAmount: true },
        _count: { _all: true },
      }),
      this.prisma.orderPayment.aggregate({
        where: { status: 'pending', asaasPaymentId: null, order: { status: LIVE_ORDER } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const payments = rows.map(toPaid);
    const inPeriod = payments.filter((payment) => payment.day >= from && payment.day <= to);

    const shares = this.asaas.partners;
    const mainName = shares.find((share) => share.key === 'main')?.name ?? 'Conta principal';

    const cash = summarizeCash(inPeriod);
    const { partners, unattributed, splitSource } = buildPartnerResults(inPeriod, mainName, shares);

    return {
      period: { from, to },
      splitConfig: toSplitConfig(shares),
      gatewayEnabled: this.asaas.enabled,

      cash: {
        ...cash,
        previous,
        changePct: changePct(cash.gross, previous),
        settling: decimal(settling._sum.amount),
        refunded: decimal(refunded._sum.amount),
      },

      commission: round2(inPeriod.reduce((sum, payment) => sum + payment.commission, 0)),
      partners,
      unattributed,

      receivables: {
        open: decimal(openReceivable._sum.amount),
        overdue: decimal(overdue._sum.amount),
        overdueCount: overdue._count._all,
        uncharged: { amount: decimal(uncharged._sum.saleAmount), count: uncharged._count._all },
        withoutGateway: {
          amount: decimal(withoutGateway._sum.amount),
          count: withoutGateway._count._all,
        },
      },

      overdueCharges: overdueCharges.map((payment) => toOverdueCharge(payment, today)),
      monthly: this.buildMonthly(payments, promised, mainName, query.months, today),
      byMethod: byMethod(inPeriod),
      topResellers: topResellers(inPeriod),
      splitSource,
    };
  }

  /** Uma linha por cobrança paga do período — base do extrato em CSV. */
  async ledger(query: PartnersQuery) {
    const today = todayInBRT();
    const from = query.from ?? firstDayOfMonth(today);
    const to = query.to ?? today;

    const rows = await this.paidRows(startOfDay(from), startOfNextDay(to));
    const shares = this.asaas.partners;
    const mainName = shares.find((share) => share.key === 'main')?.name ?? 'Conta principal';

    return { from, to, rows: rows.map(toPaid), shares, mainName };
  }

  // --- consultas -------------------------------------------------------------

  /**
   * Levantamento central: uma linha por cobranca paga, com a comissao ja
   * rateada pela fracao paga do pedido.
   *
   * O rateio pela fracao e obrigatorio: um pedido pode ter mais de uma cobranca
   * paga (o indice unico so limita as pendentes), e somar `commission_amount`
   * por pedido contaria em dobro.
   */
  private paidRows(start: Date, end: Date): Promise<PaymentRow[]> {
    return this.prisma.$queryRaw<PaymentRow[]>`
      select
        p.amount::float8     as gross,
        p.net_amount::float8 as net,
        p.split              as split,
        p.method::text       as method,
        case
          when o.sale_amount > 0
            then round(o.commission_amount * (p.amount / o.sale_amount), 2)::float8
          else 0::float8
        end                  as commission,
        to_char(p.paid_at at time zone ${BRT_TZ}, 'YYYY-MM')    as month,
        to_char(p.paid_at at time zone ${BRT_TZ}, 'YYYY-MM-DD') as day,
        o.reseller_id::text  as reseller_id,
        prof.full_name       as reseller_name
      from public.order_payments p
      join public.rating_orders o on o.id = p.order_id
      join public.profiles prof on prof.id = o.reseller_id
      where p.status = 'paid'
        and p.paid_at >= ${start}
        and p.paid_at < ${end}
      order by p.paid_at desc
    `;
  }

  private async paidTotal(start: Date, end: Date): Promise<number> {
    const total = await this.prisma.orderPayment.aggregate({
      where: { status: 'paid', paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    return decimal(total._sum.amount);
  }

  /** Cobrança em aberto por mês de vencimento — a barra "prometido". */
  private promisedByMonth(): Promise<Array<{ month: string; total: number }>> {
    return this.prisma.$queryRaw`
      select
        to_char(p.due_date, 'YYYY-MM') as month,
        sum(p.amount)::float8          as total
      from public.order_payments p
      join public.rating_orders o on o.id = p.order_id
      where p.status = 'pending'
        and p.due_date is not null
        and o.status not in ('cancelled', 'rejected')
      group by 1
    `;
  }

  private buildMonthly(
    payments: readonly Paid[],
    promised: Array<{ month: string; total: number }>,
    mainName: string,
    months: number,
    today: string,
  ): PartnersOverview['monthly'] {
    const promisedByMonth = new Map(promised.map((row) => [row.month, row.total]));

    return lastMonths(today, months).map((month) => {
      const ofMonth = payments.filter((payment) => payment.month === month);

      return {
        month,
        received: summarizeCash(ofMonth).gross,
        promised: round2(promisedByMonth.get(month) ?? 0),
        byPartner: partnerTotals(ofMonth, mainName),
      };
    });
  }
}

// --- agregacoes em memoria --------------------------------------------------

function byMethod(payments: readonly Paid[]): PartnersOverview['byMethod'] {
  const totals = new Map<PaymentMethod, { total: number; count: number }>();

  for (const payment of payments) {
    const current = totals.get(payment.method) ?? { total: 0, count: 0 };
    totals.set(payment.method, {
      total: round2(current.total + payment.gross),
      count: current.count + 1,
    });
  }

  return [...totals.entries()]
    .map(([method, value]) => ({ method, ...value }))
    .sort((a, b) => b.total - a.total);
}

function topResellers(payments: readonly Paid[]): PartnersOverview['topResellers'] {
  const totals = new Map<string, PartnersOverview['topResellers'][number]>();

  for (const payment of payments) {
    const current = totals.get(payment.resellerId) ?? {
      id: payment.resellerId,
      name: payment.resellerName,
      total: 0,
      count: 0,
      commission: 0,
    };

    totals.set(payment.resellerId, {
      ...current,
      total: round2(current.total + payment.gross),
      count: current.count + 1,
      commission: round2(current.commission + payment.commission),
    });
  }

  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 5);
}

// --- helpers ----------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

const decimal = (value: Prisma.Decimal | null): number => value?.toNumber() ?? 0;

/** Primeiro instante do dia, no fuso de Brasília. */
const startOfDay = (isoDate: string): Date => new Date(`${isoDate}T00:00:00${BRT}`);

const startOfNextDay = (isoDate: string): Date =>
  new Date(startOfDay(isoDate).getTime() + 86_400_000);

/** Hoje em Brasília, como `YYYY-MM-DD`. */
function todayInBRT(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

const firstDayOfMonth = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** `isoDate` deslocado `months` meses para trás, no primeiro dia do mês. */
function monthsBack(isoDate: string, months: number): string {
  const [year, month] = isoDate.split('-').map(Number) as [number, number, number];
  const zeroBased = year * 12 + (month - 1) - months;

  return `${String(Math.floor(zeroBased / 12)).padStart(4, '0')}-${String(
    (zeroBased % 12) + 1,
  ).padStart(2, '0')}-01`;
}

/** Os `count` meses que terminam no mês de `today`, do mais antigo ao atual. */
function lastMonths(today: string, count: number): string[] {
  const first = firstDayOfMonth(today);

  return Array.from({ length: count }, (_, index) =>
    monthsBack(first, count - 1 - index).slice(0, 7),
  );
}

function toPaid(row: PaymentRow): Paid {
  return {
    gross: row.gross,
    net: row.net,
    split: parseSplitSnapshot(row.split),
    commission: row.commission,
    month: row.month,
    day: row.day,
    method: row.method,
    resellerId: row.reseller_id,
    resellerName: row.reseller_name,
  };
}

function toOverdueCharge(
  payment: {
    id: string;
    amount: Prisma.Decimal;
    method: string;
    dueDate: Date | null;
    invoiceUrl: string | null;
    order: { id: string; code: string; client: { name: string }; reseller: { fullName: string } };
  },
  today: string,
): OverdueCharge {
  // A consulta filtra por `dueDate < hoje`, então nulo aqui é impossível; o
  // fallback existe só para o tipo, sem inventar atraso.
  const dueDate = payment.dueDate ? payment.dueDate.toISOString().slice(0, 10) : today;

  return {
    paymentId: payment.id,
    orderId: payment.order.id,
    code: payment.order.code,
    clientName: payment.order.client.name,
    resellerName: payment.order.reseller.fullName,
    amount: payment.amount.toNumber(),
    method: payment.method as PaymentMethod,
    dueDate,
    daysLate: Math.max(
      0,
      Math.round((startOfDay(today).getTime() - startOfDay(dueDate).getTime()) / 86_400_000),
    ),
    invoiceUrl: payment.invoiceUrl,
  };
}

export { lastMonths, monthsBack, todayInBRT };
