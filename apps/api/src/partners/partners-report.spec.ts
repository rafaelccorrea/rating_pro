import { partnerShares } from '../integrations/asaas/asaas-split';
import {
  buildPartnerResults,
  changePct,
  parseSplitSnapshot,
  partnerTotals,
  summarizeCash,
  type PaidPayment,
} from './partners-report';

const SHARES = partnerShares(
  [{ walletId: 'wallet-bruno', percentualValue: 30, label: 'Bruno' }],
  'Ana',
);

/** 70% da Ana (sobra na conta principal) e 30% do Bruno. */
const SPLIT_70_30 = [{ walletId: 'wallet-bruno', percentualValue: 30 }];

function payment(overrides: Partial<PaidPayment> = {}): PaidPayment {
  return {
    gross: 1000,
    net: 1000,
    split: SPLIT_70_30,
    commission: 0,
    month: '2026-07',
    ...overrides,
  };
}

describe('parseSplitSnapshot', () => {
  it('lista vazia é rateio conhecido, não ausência', () => {
    // Passou pelo gateway sem split: tudo na conta principal.
    expect(parseSplitSnapshot([])).toEqual([]);
  });

  it('null e lixo viram "sem rateio"', () => {
    expect(parseSplitSnapshot(null)).toBeNull();
    expect(parseSplitSnapshot('70/30')).toBeNull();
    expect(parseSplitSnapshot([{ walletId: 'a' }])).toBeNull();
    expect(parseSplitSnapshot([{ walletId: 'a', percentualValue: 'trinta' }])).toBeNull();
  });

  it('lê o rateio gravado', () => {
    expect(parseSplitSnapshot([{ walletId: 'a', percentualValue: 30, extra: 1 }])).toEqual([
      { walletId: 'a', percentualValue: 30 },
    ]);
  });
});

describe('buildPartnerResults', () => {
  it('divide o líquido pelo rateio gravado na cobrança', () => {
    const { partners, splitSource } = buildPartnerResults(
      [payment({ gross: 1000, net: 970 })],
      'Ana',
      SHARES,
    );

    expect(splitSource).toBe('snapshot');
    expect(partners).toEqual([
      expect.objectContaining({ key: 'main', name: 'Ana', received: 679, net: 679 }),
      expect.objectContaining({ key: 'wallet-bruno', name: 'Bruno', received: 291, net: 291 }),
    ]);
  });

  it('rateio antigo continua valendo depois que o .env muda', () => {
    // A cobrança nasceu 50/50; hoje a config é 70/30. O passado não se mexe.
    const { partners } = buildPartnerResults(
      [payment({ net: 1000, split: [{ walletId: 'wallet-bruno', percentualValue: 50 }] })],
      'Ana',
      SHARES,
    );

    expect(partners.map((p) => [p.key, p.received])).toEqual([
      ['main', 500],
      ['wallet-bruno', 500],
    ]);
  });

  it('cobrança fora do gateway não entra na conta de ninguém', () => {
    // Baixa manual: o dinheiro entrou, mas não passou por split nenhum —
    // atribuir 70/30 seria inventar uma divisão que não aconteceu.
    const { partners, unattributed, splitSource } = buildPartnerResults(
      [payment({ split: null, net: null, gross: 800 })],
      'Ana',
      SHARES,
    );

    expect(partners).toEqual([]);
    expect(unattributed).toEqual({ amount: 800, count: 1 });
    expect(splitSource).toBe('none');
  });

  it('mistura de cobranças com e sem rateio é sinalizada', () => {
    const { unattributed, splitSource } = buildPartnerResults(
      [payment(), payment({ split: null, gross: 500, net: null })],
      'Ana',
      SHARES,
    );

    expect(splitSource).toBe('partial');
    expect(unattributed).toEqual({ amount: 500, count: 1 });
  });

  it('gateway sem split é 100% da conta principal', () => {
    const { partners } = buildPartnerResults([payment({ split: [] })], 'Ana', SHARES);

    expect(partners).toEqual([
      expect.objectContaining({ key: 'main', name: 'Ana', received: 1000 }),
    ]);
  });

  it('sem líquido registrado, rateia o bruto', () => {
    const { partners } = buildPartnerResults(
      [payment({ gross: 1000, net: null })],
      'Ana',
      SHARES,
    );

    expect(partners.find((p) => p.key === 'wallet-bruno')?.received).toBe(300);
  });

  it('a comissão sai na mesma proporção do rateio', () => {
    const { partners } = buildPartnerResults(
      [payment({ net: 1000, commission: 300 })],
      'Ana',
      SHARES,
    );

    const ana = partners.find((p) => p.key === 'main');
    expect(ana).toMatchObject({ received: 700, commission: 210, net: 490 });
  });

  it('arredonda por pagamento, não sobre o total do período', () => {
    // 3 cobranças de 10,05. O Asaas reparte e arredonda cada uma: 30% de 10,05
    // é 3,015 -> 3,02, então 9,06. Aplicar 30% sobre os 30,15 do período daria
    // 9,045 -> 9,05, e o centavo de diferença é o que não bate com o extrato.
    const one = payment({ gross: 10.05, net: 10.05 });
    const { partners } = buildPartnerResults([one, one, one], 'Ana', SHARES);

    expect(partners.find((p) => p.key === 'wallet-bruno')?.received).toBe(9.06);
  });

  it('carteira que saiu da config mantém o nome do histórico', () => {
    const { partners } = buildPartnerResults(
      [payment({ split: [{ walletId: 'wallet-antigo', percentualValue: 100 }] })],
      'Ana',
      SHARES,
    );

    expect(partners[0]).toMatchObject({ key: 'wallet-antigo', name: 'Carteira wallet-a' });
  });

  it('período sem cobrança paga não inventa sócio', () => {
    const { partners, splitSource } = buildPartnerResults([], 'Ana', SHARES);

    expect(partners).toEqual([]);
    expect(splitSource).toBe('none');
  });
});

describe('summarizeCash', () => {
  it('taxa é null quando nenhuma cobrança trouxe o líquido', () => {
    // Zero diria "não teve taxa", e teve — só não foi registrada.
    const cash = summarizeCash([payment({ gross: 100, net: null })]);

    expect(cash).toMatchObject({ gross: 100, net: 100, fees: null, count: 1, avgTicket: 100 });
  });

  it('com líquido conhecido, a taxa é a diferença', () => {
    const cash = summarizeCash([
      payment({ gross: 100, net: 96.51 }),
      payment({ gross: 200, net: null }),
    ]);

    expect(cash).toMatchObject({ gross: 300, net: 296.51, fees: 3.49, avgTicket: 150 });
  });

  it('período vazio não divide por zero', () => {
    expect(summarizeCash([])).toMatchObject({ gross: 0, avgTicket: 0, fees: null });
  });
});

describe('partnerTotals', () => {
  it('soma por sócio e ignora o que não foi rateado', () => {
    const totals = partnerTotals(
      [payment({ net: 1000 }), payment({ net: 500, split: null })],
      'Ana',
    );

    expect(totals).toEqual({ main: 700, 'wallet-bruno': 300 });
  });
});

describe('changePct', () => {
  it('sem base anterior não inventa variação', () => {
    expect(changePct(1000, 0)).toBeNull();
  });

  it('calcula a variação sobre o período anterior', () => {
    expect(changePct(1500, 1000)).toBe(50);
    expect(changePct(750, 1000)).toBe(-25);
  });
});
