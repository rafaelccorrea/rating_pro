/**
 * Configuracao do split de recebimento entre os socios.
 *
 * O formato no .env e "walletId:percentual" separado por virgula, com um nome
 * opcional no fim:
 *
 *   ASAAS_SPLIT_WALLETS=1b6a2c0e-...:70:Ana,9f4d1a3b-...:30:Bruno
 *
 * Cada walletId e a carteira Asaas de um socio (Menu > Integracoes > Carteira,
 * na conta DELE). O percentual incide sobre o valor liquido da cobranca. O que
 * nao for listado aqui fica na conta que emitiu a cobranca — entao, se a conta
 * principal ja e de um dos socios, liste apenas a carteira do outro. O nome so
 * serve para o painel dos socios; a API do Asaas nunca o recebe.
 */

export interface AsaasSplitEntry {
  walletId: string;
  percentualValue: number;
  /** Nome do socio, para exibicao. Ausente quando o .env nao informou. */
  label?: string;
}

/** Fatia de um socio, ja incluindo a sobra que fica na conta principal. */
export interface PartnerShare {
  /** Estavel entre requisicoes: o walletId, ou `main` para a conta principal. */
  key: string;
  name: string;
  /** Percentual de 0 a 100. */
  percent: number;
  /** `null` na conta principal, que recebe por sobra e nao por carteira. */
  walletId: string | null;
}

/** Duas casas: percentual do Asaas nao vai alem disso. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Lanca `Error` com mensagem legivel; a validacao do .env transforma em issue. */
export function parseSplitWallets(raw: string): AsaasSplitEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const entries = trimmed.split(',').map((piece) => {
    const [walletId, percent, label, ...rest] = piece.split(':').map((part) => part.trim());

    if (!walletId || !percent || rest.length > 0) {
      throw new Error(
        `Trecho "${piece.trim()}" inválido. Use "walletId:percentual" (com "walletId:percentual:Nome" opcional) separado por vírgula, ex.: "abc:70:Ana,def:30:Bruno"`,
      );
    }

    const percentualValue = Number(percent);
    if (!Number.isFinite(percentualValue) || percentualValue <= 0 || percentualValue > 100) {
      throw new Error(`Percentual "${percent}" inválido em "${piece.trim()}": use um número entre 0 e 100`);
    }

    return { walletId, percentualValue, ...(label ? { label } : {}) };
  });

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.walletId)) {
      throw new Error(`Carteira "${entry.walletId}" aparece mais de uma vez`);
    }
    seen.add(entry.walletId);
  }

  const total = entries.reduce((sum, entry) => sum + entry.percentualValue, 0);
  if (total > 100) {
    throw new Error(`A soma dos percentuais é ${round2(total)}%, acima de 100%`);
  }

  return entries;
}

/**
 * Traduz o split em fatias por socio.
 *
 * A conta principal entra na frente porque e ela quem recebe por sobra: num
 * "abc:30", quem emitiu a cobranca fica com os outros 70%, e um painel que
 * mostrasse so os 30% listados contaria a historia pela metade.
 */
export function partnerShares(
  entries: readonly AsaasSplitEntry[],
  mainAccountName: string,
): PartnerShare[] {
  const listed = entries.map((entry) => ({
    key: entry.walletId,
    name: entry.label ?? `Carteira ${entry.walletId.slice(0, 8)}`,
    percent: round2(entry.percentualValue),
    walletId: entry.walletId,
  }));

  const remainder = round2(100 - listed.reduce((sum, share) => sum + share.percent, 0));

  // Sem sobra (o split cobre 100%), a conta principal nao recebe nada e nao
  // deve aparecer zerada na tela.
  if (remainder <= 0) return listed;

  return [{ key: 'main', name: mainAccountName, percent: remainder, walletId: null }, ...listed];
}
