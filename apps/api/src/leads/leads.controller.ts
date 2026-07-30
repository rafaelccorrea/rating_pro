import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createLeadSchema,
  updateLeadSchema,
  type CreateLeadInput,
  type UpdateLeadInput,
} from '@rating-pro/shared';
import { Public, Roles } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { listLeadsQuerySchema, type ListLeadsQuery } from './leads.query';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  // Formulário aberto na internet: teto próprio, bem abaixo do limite global.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Recebe um lead da landing page (público)' })
  create(@Body(zodPipe(createLeadSchema)) input: CreateLeadInput) {
    return this.leads.create(input);
  }

  @ApiBearerAuth()
  @Roles('master')
  @Get()
  @ApiOperation({ summary: 'Lista leads (master)' })
  list(@Query(zodPipe(listLeadsQuerySchema)) query: ListLeadsQuery) {
    return this.leads.list(query);
  }

  @ApiBearerAuth()
  @Roles('master')
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza status ou responsável do lead (master)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateLeadSchema)) input: UpdateLeadInput,
  ) {
    return this.leads.update(id, input);
  }
}
