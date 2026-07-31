import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OPEN_ORDER_STATUSES, type DashboardStats } from '@rating-pro/shared';
import { scopeByOrderOwner, scopeByReseller } from '../common/scope';
import { isMaster, type AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Existe uma função `public.dashboard_stats()` no banco, mas ela depende de
   * `auth.uid()` e o Prisma conecta sem sessão de auth. Aqui as métricas são
   * recalculadas com o escopo vindo do guard.
   */
  async stats(user: AuthenticatedUser): Promise<DashboardStats> {
    const orderScope: Prisma.RatingOrderWhereInput = scopeByReseller(user);
    const master = isMaster(user);

    /*
     * Tudo num único Promise.all, inclusive as métricas de master. O papel já
     * vem do guard, então não há motivo para descobrir "é master?" só depois de
     * esperar o primeiro lote — e com o banco a ~800 ms de ida e volta, cada
     * lote sequencial extra aparecia direto na tela.
     */
    const [byStatus, deliveredTotals, scoreAvg, totalResellers, activeResellers, newLeads] =
      await Promise.all([
        this.prisma.ratingOrder.groupBy({
          by: ['status'],
          where: orderScope,
          _count: { _all: true },
        }),
        this.prisma.ratingOrder.aggregate({
          where: { ...orderScope, status: 'delivered' },
          _sum: { saleAmount: true, commissionAmount: true },
        }),
        this.prisma.rating.aggregate({
          where: scopeByOrderOwner(user),
          _avg: { score: true },
        }),
        master ? this.prisma.profile.count({ where: { role: 'reseller' } }) : null,
        master
          ? this.prisma.profile.count({ where: { role: 'reseller', status: 'active' } })
          : null,
        master ? this.prisma.lead.count({ where: { status: 'new' } }) : null,
      ]);

    const countOf = (...statuses: readonly string[]) =>
      byStatus
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    const stats: DashboardStats = {
      totalOrders: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      pendingOrders: countOf(...OPEN_ORDER_STATUSES),
      deliveredOrders: countOf('delivered'),
      rejectedOrders: countOf('rejected'),
      totalSales: deliveredTotals._sum.saleAmount?.toNumber() ?? 0,
      // Acumulado vitalício: sem recorte de período e sem nada para abater,
      // já que repasse de comissão não é registrado. Quem consome precisa
      // rotular como "gerada", não como saldo a pagar.
      totalCommission: deliveredTotals._sum.commissionAmount?.toNumber() ?? 0,
      avgScore: scoreAvg._avg.score === null ? null : Math.round(scoreAvg._avg.score),
    };

    if (!master) {
      return stats;
    }

    return {
      ...stats,
      totalResellers: totalResellers ?? 0,
      activeResellers: activeResellers ?? 0,
      newLeads: newLeads ?? 0,
    };
  }
}
