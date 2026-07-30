import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateLeadInput, UpdateLeadInput } from '@rating-pro/shared';
import { paginate, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { ListLeadsQuery } from './leads.query';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Chamado pela landing page, sem autenticação. */
  async create(input: CreateLeadInput) {
    const lead = await this.prisma.lead.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        company: input.company || null,
        message: input.message || null,
        source: input.source,
        utm: input.utm,
      },
      select: { id: true, createdAt: true },
    });

    this.logger.log(`Lead recebido de ${input.email} (origem: ${input.source})`);

    // Não devolvemos o registro completo: a rota é pública.
    return { id: lead.id, message: 'Recebemos seu contato. Em breve falamos com você.' };
  }

  async list(query: ListLeadsQuery) {
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
        include: { owner: { select: { id: true, fullName: true } } },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginate(items, total, query.page, query.pageSize);
  }

  async update(id: string, input: UpdateLeadInput) {
    const exists = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });

    if (!exists) {
      throw new NotFoundException('Lead não encontrado');
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      },
    });
  }
}
