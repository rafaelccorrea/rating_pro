import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { TrackingService } from './tracking.service';

@ApiTags('acompanhamento')
@Controller()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Public()
  // Rota aberta e consultável por token: limite apertado para não virar oráculo
  // de força bruta, mesmo com UUID sendo inviável de adivinhar.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('acompanhamento/:token')
  @ApiOperation({ summary: 'Andamento do pedido por token público (sem login)' })
  find(@Param('token', ParseUUIDPipe) token: string) {
    return this.tracking.findByToken(token);
  }

  @ApiBearerAuth()
  @Post('orders/:id/tracking/rotate')
  @ApiOperation({ summary: 'Gera um token novo e invalida o link compartilhado' })
  rotate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.rotateToken(user, id);
  }
}
