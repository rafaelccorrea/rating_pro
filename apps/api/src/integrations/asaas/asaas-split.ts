/**
 * Configuracao do split de recebimento entre os socios.
 *
 * O formato no .env e "walletId:percentual" separado por virgula, ex.:
 *
 *   ASAAS_SPLIT_WALLETS=1b6a2c0e-...:70,9f4d1a3b-...:30
 *
 * Cada walletId e a carteira Asaas de um socio (Menu > Integracoes > Carteira,
 * na conta DELE). O percentual incide sobre o valor liquido da cobranca. O que
 * nao for listado aqui fica na conta que emitiu a cobranca — entao, se a conta
 * principal ja e de um dos socios, liste apenas a carteira do outro.
 */

export interface AsaasSplitEntry {
  walletId: string;
  percentualValue: number;
}

/** Lanca `Error` com mensagem legivel; a validacao do .env transforma em issue. */
export function parseSplitWallets(raw: string): AsaasSplitEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const entries = trimmed.split(',').map((piece) => {
    const [walletId, percent, ...rest] = piece.split(':').map((part) => part.trim());

    if (!walletId || !percent || rest.length > 0) {
      throw new Error(
        `Trecho "${piece.trim()}" inválido. Use "walletId:percentual" separado por vírgula, ex.: "abc:70,def:30"`,
      );
    }

    const percentualValue = Number(percent);
    if (!Number.isFinite(percentualValue) || percentualValue <= 0 || percentualValue > 100) {
      throw new Error(`Percentual "${percent}" inválido em "${piece.trim()}": use um número entre 0 e 100`);
    }

    return { walletId, percentualValue };
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
    throw new Error(`A soma dos percentuais é ${total}%, acima de 100%`);
  }

  return entries;
}
