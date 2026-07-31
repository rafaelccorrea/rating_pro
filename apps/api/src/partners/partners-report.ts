import type { AmountCount, PartnerResult, PartnerSplitConfig, PartnersOverview } from '@rating-pro/shared';
import { partnerShares, type AsaasSplitEntry, type PartnerShare } from '../integrations/asaas/asaas-split';

/**
 * Matematica do painel dos socios, separada das consultas para poder ser
 * testada com numeros na mao — errar centavo em divisao de socio e o tipo de
 * bug que ninguem perdoa.
 *
 * Duas decisoes estruturais moram aqui:
 *
 * 1. O rateio sai do que ficou GRAVADO em cada cobranca (`split`), nunca da
 *    config atual. Trocar 70/30 por 60/40 no .env nao pode reescrever meses
 *    fechados.
 * 2. Arredonda-se POR PAGAMENTO, e so depois se soma. Aplicar o percentual
 *    sobre o total do periodo daria centavos diferentes do extrato do Asaas —
 *    e centavo que nao bate reabre justamente a discussao que a tela existe
 *    para encerrar.
 */

/** Uma cobranca paga, com o que o rateio precisa saber sobre ela. */
export interface PaidPayment {
  gross: number;
  /** Liquido do gateway; `null` quando a taxa nao foi registrada. */
  net: number | null;
  /**
   * Rateio aplicado nesta cobranca:
   * - lista com carteiras: foi assim que o Asaas repartiu;
   * - lista vazia: passou pelo gateway sem split, tudo na conta principal;
   * - `null`: nunca passou pelo gateway (baixa manual) — nao se atribui a
   *   ninguem, porque de fato nao foi repartida.
   */
  split: AsaasSplitEntry[] | null;
  /** Comissao do revendedor, ja rateada pela fracao paga do pedido. */
  commission: number;
  /** `YYYY-MM` no fuso de Brasilia. */
  month: string;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Base do rateio: o liquido quando conhecido, senao o bruto. */
export const baseOf = (payment: PaidPayment): number => payment.net ?? payment.gross;

/**
 * Le o JSON gravado em `order_payments.split`.
 *
 * Defensivo de proposito: e dado que ja esta no banco, e uma linha torta nao
 * pode derrubar o painel — vale mais trata-la como "sem rateio", que a tela
 * mostra separado, do que inventar uma divisao.
 */
export function parseSplitSnapshot(value: unknown): AsaasSplitEntry[] | null {
  if (!Array.isArray(value)) return null;

  const entries: AsaasSplitEntry[] = [];

  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;

    const { walletId, percentualValue } = item as Record<string, unknown>;

    if (typeof walletId !== 'string' || !walletId) return null;
    if (typeof percentualValue !== 'number' || !Number.isFinite(percentualValue)) return null;

    entries.push({ walletId, percentualValue });
  }

  return entries;
}

interface Accumulator extends PartnerResult {}

/**
 * Reparte as cobrancas pagas entre os socios.
 *
 * A comissao segue o mesmo percentual do rateio: e a leitura natural de "o que
 * sobra para mim" quando os dois socios dividem tanto a receita quanto a
 * obrigacao com o revendedor.
 */
export function buildPartnerResults(
  payments: readonly PaidPayment[],
  mainAccountName: string,
  /** Nomes e percentuais de hoje, so para rotular e ordenar. */
  currentShares: readonly PartnerShare[],
): {
  partners: PartnerResult[];
  unattributed: AmountCount;
  splitSource: PartnersOverview['splitSource'];
} {
  const byKey = new Map<string, Accumulator>();
  const current = new Map(currentShares.map((share) => [share.key, share]));

  let unattributedAmount = 0;
  let unattributedCount = 0;
  let attributedCount = 0;

  for (const payment of payments) {
    if (payment.split === null) {
      unattributedAmount = round2(unattributedAmount + baseOf(payment));
      unattributedCount += 1;
      continue;
    }

    attributedCount += 1;

    const base = baseOf(payment);
    // `partnerShares` de uma lista vazia devolve a conta principal com 100%,
    // que e exatamente o caso "gateway sem split".
    for (const share of partnerShares(payment.split, mainAccountName)) {
      const accumulated = byKey.get(share.key);
      const received = round2((base * share.percent) / 100);
      const commission = round2((payment.commission * share.percent) / 100);

      if (accumulated) {
        accumulated.received = round2(accumulated.received + received);
        accumulated.commission = round2(accumulated.commission + commission);
        continue;
      }

      byKey.set(share.key, {
        key: share.key,
        // O nome vem da config de hoje: o rateio gravado guarda carteira, não
        // gente. Carteira que saiu da config mantém o rótulo do histórico.
        name: current.get(share.key)?.name ?? share.name,
        percent: current.get(share.key)?.percent ?? share.percent,
        walletId: share.walletId,
        received,
        commission,
        net: 0,
      });
    }
  }

  const partners = [...byKey.values()]
    .map((partner) => ({ ...partner, net: round2(partner.received - partner.commission) }))
    .sort((a, b) => b.received - a.received || a.name.localeCompare(b.name, 'pt-BR'));

  return {
    partners,
    unattributed: { amount: unattributedAmount, count: unattributedCount },
    splitSource: sourceOf(attributedCount, unattributedCount),
  };
}

function sourceOf(attributed: number, unattributed: number): PartnersOverview['splitSource'] {
  if (attributed === 0) return 'none';
  return unattributed === 0 ? 'snapshot' : 'partial';
}

/** Totais por sócio de um conjunto de pagamentos — usado na série mensal. */
export function partnerTotals(
  payments: readonly PaidPayment[],
  mainAccountName: string,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const payment of payments) {
    if (payment.split === null) continue;

    const base = baseOf(payment);

    for (const share of partnerShares(payment.split, mainAccountName)) {
      totals[share.key] = round2((totals[share.key] ?? 0) + (base * share.percent) / 100);
    }
  }

  return totals;
}

/**
 * Soma o caixa do periodo.
 *
 * `fees` fica `null` quando nenhuma cobranca trouxe o liquido: a taxa existe,
 * so nao foi registrada, e devolver zero seria apresentar estimativa como fato.
 */
export function summarizeCash(payments: readonly PaidPayment[]): {
  gross: number;
  net: number;
  fees: number | null;
  count: number;
  avgTicket: number;
} {
  let gross = 0;
  let net = 0;
  let anyNetKnown = false;

  for (const payment of payments) {
    gross = round2(gross + payment.gross);
    net = round2(net + baseOf(payment));
    if (payment.net !== null) anyNetKnown = true;
  }

  return {
    gross,
    net,
    fees: anyNetKnown ? round2(gross - net) : null,
    count: payments.length,
    avgTicket: payments.length > 0 ? round2(gross / payments.length) : 0,
  };
}

/** Variação percentual entre dois períodos; `null` quando não havia base. */
export function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round2(((current - previous) / previous) * 100);
}

export function toSplitConfig(shares: readonly PartnerShare[]): PartnerSplitConfig[] {
  return shares.map((share) => ({
    key: share.key,
    name: share.name,
    percent: share.percent,
    walletId: share.walletId,
  }));
}
