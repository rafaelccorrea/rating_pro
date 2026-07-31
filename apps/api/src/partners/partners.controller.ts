import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { partnersQuerySchema, type PartnersQuery } from '@rating-pro/shared';
import { Roles } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { partnerShares } from '../integrations/asaas/asaas-split';
import { baseOf } from './partners-report';
import { PartnersService } from './partners.service';

/**
 * Prestacao de contas entre os socios. Master-only no controller inteiro: e a
 * tela que mostra quanto cada dono recebeu, e revendedor nao tem o que fazer
 * aqui.
 */
@ApiTags('partners')
@ApiBearerAuth()
@Roles('master')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Caixa do período e rateio entre os sócios' })
  overview(@Query(zodPipe(partnersQuerySchema)) query: PartnersQuery) {
    return this.partners.overview(query);
  }

  @Get('ledger.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="extrato-socios.csv"')
  @ApiOperation({ summary: 'Extrato dos recebimentos do período, em CSV' })
  async ledgerCsv(@Query(zodPipe(partnersQuerySchema)) query: PartnersQuery) {
    const { from, to, rows, shares, mainName } = await this.partners.ledger(query);

    // Uma coluna por sócio, na mesma ordem do rateio vigente — é assim que a
    // planilha do acerto de contas fica somável sem retrabalho.
    const header = [
      'data',
      'revendedor',
      'metodo',
      'bruto',
      'liquido',
      'taxa',
      'comissao',
      ...shares.map((share) => share.name),
      'rateio_registrado',
    ];

    const lines = rows.map((row) => {
      const base = baseOf(row);
      const applied = row.split === null ? null : partnerShares(row.split, mainName);

      return [
        row.day,
        row.resellerName,
        row.method,
        money(row.gross),
        money(base),
        row.net === null ? '' : money(row.gross - row.net),
        money(row.commission),
        ...shares.map((share) => {
          const percent = applied?.find((item) => item.key === share.key)?.percent;
          return percent === undefined ? '' : money((base * percent) / 100);
        }),
        row.split === null ? 'nao' : 'sim',
      ];
    });

    return [`# extrato ${from} a ${to}`, header.join(';'), ...lines.map(csvLine)].join('\n');
  }
}

/** Vírgula decimal e ponto e vírgula como separador: o Excel em pt-BR espera isso. */
const money = (value: number): string => value.toFixed(2).replace('.', ',');

/**
 * Neutraliza fórmula antes de escapar.
 *
 * Nome de revendedor é texto que o próprio usuário cadastra; começando com
 * `=`, `+`, `-` ou `@`, o Excel trata a célula como fórmula ao abrir o arquivo.
 * A aspa simples à frente é a convenção que força texto sem sujar o que se lê
 * na planilha.
 */
const defuse = (cell: string): string => (/^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell);

const csvLine = (cells: string[]): string =>
  cells
    .map(defuse)
    .map((cell) => (/[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(';');
