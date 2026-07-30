import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { onlyDigits, type AdminUpdateProfileInput, type UpdateProfileInput } from '@rating-pro/shared';
import { ProfileCacheService } from '../auth/profile-cache.service';
import { paginate, skipTake } from '../common/pagination';
import type { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListProfilesQuery } from './profiles.query';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileCache: ProfileCacheService,
  ) {}

  async findMe(user: AuthenticatedUser) {
    return this.findByIdOrFail(user.id);
  }

  async updateMe(user: AuthenticatedUser, input: UpdateProfileInput) {
    // O guard cacheia o perfil; derruba a entrada para a mudança valer já na
    // próxima requisição.
    this.profileCache.invalidate(user.id);

    // Sem `role`, `status` nem `commissionRate` de propósito: um revendedor não
    // altera os próprios privilégios. O banco também barra via trigger.
    return this.prisma.profile.update({
      where: { id: user.id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.document !== undefined ? { document: onlyDigits(input.document) } : {}),
        ...(input.companyName !== undefined ? { companyName: input.companyName || null } : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
      },
    });
  }

  async list(query: ListProfilesQuery) {
    const where: Prisma.ProfileWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' } },
              { document: { contains: onlyDigits(query.search) || query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
        include: {
          _count: { select: { orders: true, clients: true } },
        },
      }),
      this.prisma.profile.count({ where }),
    ]);

    return paginate(items, total, query.page, query.pageSize);
  }

  async findByIdOrFail(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, clients: true } } },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    return profile;
  }

  /** Somente master: ajusta papel, status e comissão de um revendedor. */
  async adminUpdate(id: string, input: AdminUpdateProfileInput) {
    await this.findByIdOrFail(id);

    // Crítico: sem isto, uma suspensão só valeria quando o cache do guard
    // expirasse. É o que mantém o bloqueio instantâneo.
    this.profileCache.invalidate(id);

    return this.prisma.profile.update({
      where: { id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });
  }
}
