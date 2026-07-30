import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@rating-pro/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { listClientsQuerySchema, type ListClientsQuery } from './clients.query';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista clientes da carteira (master vê todos)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(zodPipe(listClientsQuerySchema)) query: ListClientsQuery) {
    return this.clients.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra um cliente PF ou PJ' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createClientSchema)) input: CreateClientInput,
  ) {
    return this.clients.create(user, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do cliente' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findOneOrFail(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza o cliente' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateClientSchema)) input: UpdateClientInput,
  ) {
    return this.clients.update(user, id, input);
  }
}
