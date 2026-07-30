import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskDocumentPublic, type OrderStatus, type TrackingInfo } from '@rating-pro/shared';
import { assertOwnership } from '../common/scope';
import type { AuthenticatedUser } from '../common/types';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Consulta pública por token. Sem autenticação: quem tem o link vê.
   *
   * O `select` é explícito e enxuto de propósito — é o ponto onde um `include`
   * descuidado vazaria valor da venda, comissão ou nota interna para uma página
   * aberta na internet.
   */
  async findByToken(token: string): Promise<TrackingInfo> {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { trackingToken: token },
      select: {
        code: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        deliveredAt: true,
        rejectionReason: true,
        client: {
          select: { name: true, document: true, personType: true },
        },
        rating: {
          select: {
            score: true,
            grade: true,
            risk: true,
            summary: true,
            validUntil: true,
            issuedAt: true,
          },
        },
        events: {
          where: { eventType: 'order.status_changed' },
          orderBy: { createdAt: 'asc' },
          // Sem `actorId`: o cliente final não precisa saber quem mexeu.
          select: { toStatus: true, createdAt: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Link de acompanhamento inválido ou expirado');
    }

    return {
      code: order.code,
      status: order.status,
      clientName: order.client.name,
      clientDocumentMasked: maskDocumentPublic(order.client.document),
      clientPersonType: order.client.personType,
      createdAt: order.createdAt.toISOString(),
      submittedAt: order.submittedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      rejectionReason: order.status === 'rejected' ? order.rejectionReason : null,
      rating: order.rating
        ? {
            score: order.rating.score,
            grade: order.rating.grade,
            risk: order.rating.risk,
            summary: order.rating.summary,
            validUntil: order.rating.validUntil.toISOString(),
            issuedAt: order.rating.issuedAt.toISOString(),
          }
        : null,
      timeline: order.events.flatMap((event) =>
        event.toStatus
          ? [{ status: event.toStatus as OrderStatus, at: event.createdAt.toISOString() }]
          : [],
      ),
      brandName: this.config.get('BRAND_NAME', { infer: true }),
    };
  }

  /**
   * Gera um token novo, invalidando o link que já foi compartilhado. Útil quando
   * o link vaza para a pessoa errada.
   */
  async rotateToken(user: AuthenticatedUser, orderId: string): Promise<{ trackingToken: string }> {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: { resellerId: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    const [updated] = await this.prisma.$queryRaw<Array<{ tracking_token: string }>>`
      update public.rating_orders
         set tracking_token = extensions.gen_random_uuid()
       where id = ${orderId}::uuid
      returning tracking_token
    `;

    if (!updated) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return { trackingToken: updated.tracking_token };
  }
}
