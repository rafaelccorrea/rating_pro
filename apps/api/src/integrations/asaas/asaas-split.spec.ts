import { parseSplitWallets, partnerShares } from './asaas-split';

describe('parseSplitWallets', () => {
  it('vazio significa sem split', () => {
    expect(parseSplitWallets('')).toEqual([]);
    expect(parseSplitWallets('   ')).toEqual([]);
  });

  it('faz o 70/30 dos sócios', () => {
    expect(parseSplitWallets('wallet-a:70,wallet-b:30')).toEqual([
      { walletId: 'wallet-a', percentualValue: 70 },
      { walletId: 'wallet-b', percentualValue: 30 },
    ]);
  });

  it('aceita percentual quebrado e espaços em volta', () => {
    expect(parseSplitWallets(' wallet-a : 12.5 ')).toEqual([
      { walletId: 'wallet-a', percentualValue: 12.5 },
    ]);
  });

  it('recusa trecho sem percentual', () => {
    expect(() => parseSplitWallets('wallet-a')).toThrow(/walletId:percentual/);
  });

  it('recusa percentual fora de 0..100', () => {
    expect(() => parseSplitWallets('wallet-a:0')).toThrow(/entre 0 e 100/);
    expect(() => parseSplitWallets('wallet-a:101')).toThrow(/entre 0 e 100/);
    expect(() => parseSplitWallets('wallet-a:setenta')).toThrow(/entre 0 e 100/);
  });

  it('recusa soma acima de 100%', () => {
    expect(() => parseSplitWallets('wallet-a:70,wallet-b:40')).toThrow(/soma.*110/);
  });

  it('recusa carteira repetida', () => {
    expect(() => parseSplitWallets('wallet-a:50,wallet-a:20')).toThrow(/mais de uma vez/);
  });

  it('lê o nome do sócio quando o .env informa', () => {
    expect(parseSplitWallets('wallet-a:70:Ana,wallet-b:30:Bruno')).toEqual([
      { walletId: 'wallet-a', percentualValue: 70, label: 'Ana' },
      { walletId: 'wallet-b', percentualValue: 30, label: 'Bruno' },
    ]);
  });
});

describe('partnerShares', () => {
  it('a sobra vira a fatia da conta principal, na frente', () => {
    const shares = partnerShares(
      [{ walletId: 'wallet-b', percentualValue: 30, label: 'Bruno' }],
      'Ana',
    );

    expect(shares).toEqual([
      { key: 'main', name: 'Ana', percent: 70, walletId: null },
      { key: 'wallet-b', name: 'Bruno', percent: 30, walletId: 'wallet-b' },
    ]);
  });

  it('split que cobre 100% não inventa uma conta principal zerada', () => {
    const shares = partnerShares(
      [
        { walletId: 'wallet-a', percentualValue: 70, label: 'Ana' },
        { walletId: 'wallet-b', percentualValue: 30, label: 'Bruno' },
      ],
      'Conta principal',
    );

    expect(shares.map((share) => share.key)).toEqual(['wallet-a', 'wallet-b']);
  });

  it('sem nome no .env, identifica a carteira pelo começo do id', () => {
    const [share] = partnerShares([{ walletId: 'abcdef1234567890', percentualValue: 100 }], 'Ana');

    expect(share).toMatchObject({ name: 'Carteira abcdef12', percent: 100 });
  });

  it('percentual quebrado não deixa resto de ponto flutuante', () => {
    const shares = partnerShares(
      [
        { walletId: 'wallet-a', percentualValue: 33.33 },
        { walletId: 'wallet-b', percentualValue: 33.33 },
      ],
      'Ana',
    );

    expect(shares[0]).toMatchObject({ key: 'main', percent: 33.34 });
  });
});
