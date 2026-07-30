import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  onlyDigits,
  type CreateClientInput,
  type UpdateClientInput,
} from '@rating-pro/shared';
import { paginate, skipTake } from '../common/pagination';
import { assertOwnership, scopeByReseller } from '../common/scope';
import { isMaster, type AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListClientsQuery } from './clients.query';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: ListClientsQuery) {
    const search = query.search?.trim();
    const digits = search ? onlyDigits(search) : '';

    const where: Prisma.ClientWhereInput = {
      ...scopeByReseller(user),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              ...(digits ? [{ document: { contains: digits } }] : []),
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(items, total, query.page, query.pageSize);
  }

  async create(user: AuthenticatedUser, input: CreateClientInput) {
    if (isMaster(user)) {
      // A carteira pertence ao revendedor; um master criando cliente para si
      // não faz sentido no modelo de negócio e sujaria os relatórios.
      throw new ForbiddenException('Master não cadastra clientes; use uma conta de revendedor');
    }

    return this.prisma.client.create({
      data: {
        resellerId: user.id,
        personType: input.personType,
        document: onlyDigits(input.document),
        name: input.name,
        email: input.email || null,
        phone: input.phone ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        city: input.city || null,
        state: input.state || null,
      },
    });
  }

  async findOneOrFail(user: AuthenticatedUser, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, code: true, status: true, createdAt: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    assertOwnership(user, client.resellerId);
    return client;
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateClientInput) {
    await this.findOneOrFail(user, id);

    return this.prisma.client.update({
      where: { id },
      data: {
        ...(input.personType !== undefined ? { personType: input.personType } : {}),
        ...(input.document !== undefined ? { document: onlyDigits(input.document) } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.birthDate !== undefined
          ? { birthDate: input.birthDate ? new Date(input.birthDate) : null }
          : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
      },
    });
  }
}
