import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransition,
  onlyDigits,
  ORDER_STATUS_LABEL,
  type ChangeOrderStatusInput,
  type CreateOrderInput,
  type IntakeInput,
  type ListOrdersQuery,
  type OrderStatus,
  type UpdateOrderInput,
} from '@rating-pro/shared';
import { paginate, skipTake } from '../common/pagination';
import { assertOwnership, scopeByReseller } from '../common/scope';
import { isMaster, type AuthenticatedUser } from '../common/types';
import { AsaasService } from '../integrations/asaas/asaas.service';
import { PrismaService } from '../prisma/prisma.service';

/** Transições que um revendedor pode disparar. Master pode qualquer válida. */
const RESELLER_ALLOWED_TRANSITIONS: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ['draft', 'submitted'],
  ['draft', 'cancelled'],
  ['pending_doc', 'submitted'],
  ['pending_doc', 'cancelled'],
  ['submitted', 'cancelled'],
];

const orderInclude = {
  client: true,
  rating: true,
  reseller: { select: { id: true, fullName: true, email: true } },
  assignee: { select: { id: true, fullName: true } },
} satisfies Prisma.RatingOrderInclude;

type OrderWithRelations = Prisma.RatingOrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  /**
   * `internalNotes` é anotação da operação e nunca vai para o revendedor.
   * O Prisma ignora RLS, então a remoção acontece aqui.
   */
  private sanitize(order: OrderWithRelations, user: AuthenticatedUser) {
    if (isMaster(user)) return order;

    const { internalNotes: _internalNotes, ...visible } = order;
    return visible;
  }

  /** URL relativa do acompanhamento; o frontend prefixa com a própria origem. */
  static trackingPath(trackingToken: string): string {
    return `/acompanhamento/${trackingToken}`;
  }

  async list(user: AuthenticatedUser, query: ListOrdersQuery) {
    const search = query.search?.trim();
    const digits = search ? onlyDigits(search) : '';

    const where: Prisma.RatingOrderWhereInput = {
      ...scopeByReseller(user),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { client: { name: { contains: search, mode: 'insensitive' } } },
              ...(digits ? [{ client: { document: { contains: digits } } }] : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ratingOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
        include: orderInclude,
      }),
      this.prisma.ratingOrder.count({ where }),
    ]);

    return paginate(
      rows.map((row) => this.sanitize(row, user)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async create(user: AuthenticatedUser, input: CreateOrderInput) {
    if (isMaster(user)) {
      throw new ForbiddenException('Master não abre pedidos; use uma conta de revendedor');
    }

    // O cliente precisa ser da carteira de quem está abrindo o pedido.
    const client = await this.prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, resellerId: true, personType: true },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    assertOwnership(user, client.resellerId);

    // O tipo do formulário tem de casar com o do cliente; o banco também barra,
    // mas aqui a mensagem sai legível em vez de erro de trigger.
    if (input.intake && input.intake.personType !== client.personType) {
      throw new BadRequestException(
        `Este cliente é ${client.personType === 'pf' ? 'pessoa física' : 'pessoa jurídica'}; ` +
          'use o formulário correspondente.',
      );
    }

    const order = await this.prisma.ratingOrder.create({
      data: {
        resellerId: user.id,
        clientId: client.id,
        saleAmount: new Prisma.Decimal(input.saleAmount),
        resellerNotes: input.resellerNotes || null,
        ...(input.intake ? { intake: input.intake } : {}),
        status: input.submit ? 'submitted' : 'draft',
        ...(input.submit ? { submittedAt: new Date() } : {}),
      },
      include: orderInclude,
    });

    return this.sanitize(order, user);
  }

  /**
   * Salva/atualiza o formulário de coleta. Separado do `update` porque é um
   * documento inteiro e vale enquanto o pedido não entrou em análise — depois
   * disso, mudar os dados sob os pés de quem analisa não faz sentido.
   */
  async updateIntake(user: AuthenticatedUser, id: string, intake: IntakeInput) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id },
      select: { resellerId: true, status: true, client: { select: { personType: true } } },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    if (!isMaster(user) && order.status !== 'draft' && order.status !== 'pending_doc') {
      throw new BadRequestException(
        `Pedido em "${ORDER_STATUS_LABEL[order.status]}" não aceita mais alteração do formulário`,
      );
    }

    if (intake.personType !== order.client.personType) {
      throw new BadRequestException(
        `Este cliente é ${order.client.personType === 'pf' ? 'pessoa física' : 'pessoa jurídica'}; ` +
          'use o formulário correspondente.',
      );
    }

    const updated = await this.prisma.ratingOrder.update({
      where: { id },
      data: { intake },
      include: orderInclude,
    });

    return this.sanitize(updated, user);
  }

  async findOneOrFail(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id },
      include: {
        ...orderInclude,
        documents: { orderBy: { createdAt: 'desc' } },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    if (isMaster(user)) return order;

    const { internalNotes: _internalNotes, ...visible } = order;
    return visible;
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateOrderInput) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id },
      select: { id: true, resellerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    if (!isMaster(user) && order.status !== 'draft' && order.status !== 'pending_doc') {
      throw new BadRequestException(
        `Pedido em "${ORDER_STATUS_LABEL[order.status]}" não pode mais ser editado`,
      );
    }

    const updated = await this.prisma.ratingOrder.update({
      where: { id },
      data: {
        ...(input.saleAmount !== undefined
          ? { saleAmount: new Prisma.Decimal(input.saleAmount), commissionAmount: new Prisma.Decimal(0) }
          : {}),
        ...(input.resellerNotes !== undefined ? { resellerNotes: input.resellerNotes || null } : {}),
      },
      include: orderInclude,
    });

    return this.sanitize(updated, user);
  }

  /**
   * A máquina de estados também é validada por trigger no banco. Repetimos a
   * checagem aqui para devolver 400 com mensagem legível em vez de deixar o
   * erro do Postgres subir como conflito genérico.
   */
  async changeStatus(user: AuthenticatedUser, id: string, input: ChangeOrderStatusInput) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id },
      select: { id: true, resellerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    if (!canTransition(order.status, input.status)) {
      throw new BadRequestException(
        `Não é possível ir de "${ORDER_STATUS_LABEL[order.status]}" para "${ORDER_STATUS_LABEL[input.status]}"`,
      );
    }

    if (!isMaster(user)) {
      const allowed = RESELLER_ALLOWED_TRANSITIONS.some(
        ([from, to]) => from === order.status && to === input.status,
      );

      if (!allowed) {
        throw new ForbiddenException(
          `Esta mudança de status é feita pela equipe de análise, não pelo revendedor`,
        );
      }
    }

    const updated = await this.prisma.ratingOrder.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === 'rejected' ? { rejectionReason: input.reason || null } : {}),
        // Quem coloca em análise assume o pedido.
        ...(input.status === 'in_analysis' ? { assignedTo: user.id } : {}),
        ...(isMaster(user) && input.internalNotes !== undefined
          ? { internalNotes: input.internalNotes || null }
          : {}),
      },
      include: orderInclude,
    });

    // Pedido morto nao deixa cobranca viva no gateway. Best-effort: o proprio
    // servico so loga em caso de falha, e a mudanca de status ja aconteceu.
    if (input.status === 'cancelled' || input.status === 'rejected') {
      await this.asaas.tryCancelPendingCharge(id);
    }

    return this.sanitize(updated, user);
  }

  async listEvents(user: AuthenticatedUser, id: string) {
    // Confirma acesso ao pedido antes de expor a trilha.
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id },
      select: { resellerId: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    assertOwnership(user, order.resellerId);

    return this.prisma.orderEvent.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, fullName: true } } },
    });
  }
}

export { RESELLER_ALLOWED_TRANSITIONS, orderInclude };
