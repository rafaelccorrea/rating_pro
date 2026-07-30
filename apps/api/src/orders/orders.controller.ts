import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changeOrderStatusSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  updateOrderIntakeSchema,
  updateOrderSchema,
  type ChangeOrderStatusInput,
  type CreateOrderInput,
  type ListOrdersQuery,
  type UpdateOrderInput,
  type UpdateOrderIntakeInput,
} from '@rating-pro/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista pedidos (master vê todos, revendedor só os seus)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(listOrdersQuerySchema)) query: ListOrdersQuery,
  ) {
    return this.orders.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Abre um pedido de rating (rascunho ou já enviado)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createOrderSchema)) input: CreateOrderInput,
  ) {
    return this.orders.create(user, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do pedido com cliente, rating, anexos e trilha' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOneOrFail(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita valor e observações (apenas rascunho/pendência)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateOrderSchema)) input: UpdateOrderInput,
  ) {
    return this.orders.update(user, id, input);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Move o pedido na máquina de estados' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(changeOrderStatusSchema)) input: ChangeOrderStatusInput,
  ) {
    return this.orders.changeStatus(user, id, input);
  }

  @Patch(':id/intake')
  @ApiOperation({ summary: 'Salva o formulário de coleta PF ou PJ do pedido' })
  updateIntake(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateOrderIntakeSchema)) body: UpdateOrderIntakeInput,
  ) {
    return this.orders.updateIntake(user, id, body.intake);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Trilha de auditoria do pedido' })
  listEvents(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listEvents(user, id);
  }
}
