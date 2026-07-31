import { parseSplitWallets } from './asaas-split';

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
});
