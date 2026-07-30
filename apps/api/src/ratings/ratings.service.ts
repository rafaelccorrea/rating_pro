import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ORDER_STATUS_LABEL,
  type IssueRatingInput,
} from '@rating-pro/shared';
import { assertMaster } from '../common/scope';
import type { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

/** Soma meses a uma data preservando o fim do mês (31/01 + 1 mês => 28/02). */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetDay = result.getUTCDate();

  result.setUTCMonth(result.getUTCMonth() + months);

  if (result.getUTCDate() < targetDay) {
    result.setUTCDate(0);
  }

  return result;
}

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emite o rating e entrega o pedido. `grade` e `risk` não são enviados: o
   * trigger `ratings_fill_derived` os deriva do score, mantendo uma única fonte
   * da verdade para a escala.
   */
  async issue(user: AuthenticatedUser, orderId: string, input: IssueRatingInput) {
    assertMaster(user);

    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, rating: { select: { id: true } } },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.rating) {
      throw new BadRequestException('Este pedido já tem rating emitido. Use a correção.');
    }

    if (order.status !== 'in_analysis') {
      throw new BadRequestException(
        `O pedido precisa estar em "Em análise" para emitir o rating (está em "${ORDER_STATUS_LABEL[order.status]}")`,
      );
    }

    const validUntil = addMonths(new Date(), input.validityMonths);

    /*
     * A máquina de estados do banco não aceita in_analysis -> delivered direto,
     * então passa por approved. O laudo em PDF é gerado sob demanda no download
     * (ver ReportsService), o que mantém tudo isto numa única transação.
     */
    const delivered = await this.prisma.$transaction(async (tx) => {
      await tx.rating.create({
        data: {
          orderId,
          score: input.score,
          summary: input.summary || null,
          factors: input.factors,
          validUntil,
          issuedBy: user.id,
        },
      });

      await tx.ratingOrder.update({ where: { id: orderId }, data: { status: 'approved' } });

      return tx.ratingOrder.update({
        where: { id: orderId },
        data: { status: 'delivered' },
        include: { rating: true, client: true },
      });
    });

    this.logger.log(`Rating ${input.score} emitido para ${delivered.code} por ${user.email}`);
    return delivered;
  }

  /**
   * Correção de um rating já emitido. Não há laudo armazenado para invalidar:
   * o PDF é montado a cada download, então já sai com o valor novo.
   */
  async update(user: AuthenticatedUser, orderId: string, input: IssueRatingInput) {
    assertMaster(user);

    const rating = await this.prisma.rating.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (!rating) {
      throw new NotFoundException('Este pedido ainda não tem rating emitido');
    }

    await this.prisma.rating.update({
      where: { id: rating.id },
      data: {
        score: input.score,
        summary: input.summary || null,
        factors: input.factors,
        validUntil: addMonths(new Date(), input.validityMonths),
        issuedBy: user.id,
        issuedAt: new Date(),
      },
    });

    return this.prisma.ratingOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { rating: true, client: true },
    });
  }
}
