import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { AsaasConfigService } from './asaas-config.service';
import { AsaasService } from './asaas.service';

/** Comparacao em tempo constante; o hash iguala os tamanhos antes. */
function tokenMatches(received: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

@ApiTags('webhooks')
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(
    private readonly config: AsaasConfigService,
    private readonly asaas: AsaasService,
  ) {}

  /**
   * Recebe os eventos de cobranca do Asaas.
   *
   * Publico porque quem chama e o Asaas, autenticado pelo token combinado no
   * cadastro do webhook. Sem throttle: um 429 pausaria a fila de eventos deles
   * e atrasaria todas as confirmacoes seguintes.
   *
   * O corpo chega como `unknown` de proposito: quem valida e o service, com
   * zod, porque um corpo torto precisa virar ACK (200) e nao 400 — e o token
   * autentica o remetente, nao o conteudo.
   */
  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook de cobranças do Asaas (autenticado por token)' })
  handle(@Headers('asaas-access-token') token: string | undefined, @Body() body: unknown) {
    const expected = this.config.webhookToken;

    if (!expected || !token || !tokenMatches(token, expected)) {
      throw new UnauthorizedException('Token do webhook ausente ou inválido');
    }

    return this.asaas.handleWebhookEvent(body ?? {});
  }
}
