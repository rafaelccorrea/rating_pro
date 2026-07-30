import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RatingFactor } from '@rating-pro/shared';
import { assertOwnership } from '../common/scope';
import type { AuthenticatedUser } from '../common/types';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { buildReportPdf } from './report-pdf';

export interface GeneratedReport {
  fileName: string;
  pdf: Buffer;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Monta o laudo sob demanda, a cada download.
   *
   * Não há armazenamento intermediário de propósito: o PDF é função pura dos
   * dados do rating, gerar custa poucos milissegundos, e assim não existe
   * arquivo velho para invalidar quando um master corrige o score — nem
   * dependência de um serviço externo de storage.
   */
  async generate(user: AuthenticatedUser, orderId: string): Promise<GeneratedReport> {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        rating: { include: { issuer: { select: { fullName: true } } } },
        reseller: { select: { fullName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    if (!order.rating) {
      throw new NotFoundException('Este pedido ainda não tem rating emitido');
    }

    const pdf = await buildReportPdf({
      brandName: this.config.get('BRAND_NAME', { infer: true }),
      orderCode: order.code,
      score: order.rating.score,
      summary: order.rating.summary,
      factors: this.parseFactors(order.rating.factors),
      validUntil: order.rating.validUntil,
      issuedAt: order.rating.issuedAt,
      issuedByName: order.rating.issuer.fullName,
      resellerName: order.reseller.fullName,
      client: {
        name: order.client.name,
        document: order.client.document,
        personType: order.client.personType,
        city: order.client.city,
        state: order.client.state,
      },
    });

    this.logger.log(`Laudo gerado para ${order.code} (${pdf.byteLength} bytes)`);

    return { fileName: `laudo-${order.code}.pdf`, pdf };
  }

  /** `factors` é jsonb: valida a forma antes de confiar no conteúdo. */
  private parseFactors(raw: unknown): RatingFactor[] {
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((item): RatingFactor[] => {
      if (typeof item !== 'object' || item === null) return [];

      const candidate = item as Record<string, unknown>;
      const { label, weight, score } = candidate;

      if (typeof label !== 'string' || typeof weight !== 'number' || typeof score !== 'number') {
        return [];
      }

      return [{ label, weight, score }];
    });
  }
}
