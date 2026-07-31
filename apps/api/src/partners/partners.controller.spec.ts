import { partnerShares } from '../integrations/asaas/asaas-split';
import { PartnersController } from './partners.controller';
import type { PartnersService } from './partners.service';

/** 70% da conta principal (Ana) e 30% do Bruno. */
const SHARES = partnerShares([{ walletId: 'w-bruno', percentualValue: 30, label: 'Bruno' }], 'Ana');

function makeController(rows: unknown[]) {
  const ledger = jest.fn().mockResolvedValue({
    from: '2026-07-01',
    to: '2026-07-31',
    rows,
    shares: SHARES,
    mainName: 'Ana',
  });

  return {
    controller: new PartnersController({ ledger } as unknown as PartnersService),
    ledger,
  };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  gross: 1000,
  net: 970,
  split: [{ walletId: 'w-bruno', percentualValue: 30 }],
  commission: 300,
  month: '2026-07',
  day: '2026-07-15',
  method: 'pix',
  resellerId: 'reseller-1',
  resellerName: 'Ana Correspondente',
  ...overrides,
});

const query = { months: 6 } as const;

describe('PartnersController.ledgerCsv', () => {
  it('uma coluna por sócio, com a fatia de cada um sobre o líquido', async () => {
    const { controller } = makeController([row()]);

    const csv = await controller.ledgerCsv(query);
    const [comment, header, line] = csv.split('\n');

    expect(comment).toBe('# extrato 2026-07-01 a 2026-07-31');
    expect(header).toBe(
      'data;revendedor;metodo;bruto;liquido;taxa;comissao;Ana;Bruno;rateio_registrado',
    );
    // 970 líquido: 679,00 para Ana (70%) e 291,00 para Bruno (30%); taxa 30,00.
    expect(line).toBe(
      '2026-07-15;Ana Correspondente;pix;1000,00;970,00;30,00;300,00;679,00;291,00;sim',
    );
  });

  it('cobrança sem rateio deixa as colunas dos sócios vazias', async () => {
    // Baixa manual: o dinheiro entrou mas não foi repartido — coluna vazia é
    // diferente de zero, que sugeriria "coube zero a ele".
    const { controller } = makeController([row({ split: null, net: null })]);

    const line = (await controller.ledgerCsv(query)).split('\n')[2];

    expect(line).toBe('2026-07-15;Ana Correspondente;pix;1000,00;1000,00;;300,00;;;nao');
  });

  it('neutraliza fórmula no nome do revendedor', async () => {
    // O nome é texto que o próprio usuário cadastra; sem a aspa à frente, o
    // Excel executaria isso ao abrir o extrato.
    const { controller } = makeController([
      row({ resellerName: '=HYPERLINK("http://x","clique")' }),
    ]);

    const line = (await controller.ledgerCsv(query)).split('\n')[2];

    expect(line).toContain(`'=HYPERLINK`);
  });

  it('escapa ponto e vírgula no nome sem quebrar a coluna', async () => {
    const { controller } = makeController([row({ resellerName: 'Silva; Souza & Cia' })]);

    const line = (await controller.ledgerCsv(query)).split('\n')[2];

    expect(line).toContain('"Silva; Souza & Cia"');
  });

  it('período sem recebimento devolve só cabeçalho', async () => {
    const { controller } = makeController([]);

    expect((await controller.ledgerCsv(query)).split('\n')).toHaveLength(2);
  });
});
