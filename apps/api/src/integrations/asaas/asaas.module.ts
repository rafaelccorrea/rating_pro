import { Module } from '@nestjs/common';
import { AsaasConfigService } from './asaas-config.service';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasClient } from './asaas.client';
import { AsaasService } from './asaas.service';

/**
 * Cobranca via Asaas com split entre os socios.
 *
 * Toda a integracao e opcional: sem ASAAS_API_KEY no ambiente, o AsaasService
 * vira no-op e o fluxo manual (PIX_KEY + baixa pelo master) continua valendo.
 */
@Module({
  controllers: [AsaasWebhookController],
  providers: [AsaasConfigService, AsaasClient, AsaasService],
  exports: [AsaasService],
})
export class AsaasModule {}
