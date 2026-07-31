import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { parseSplitWallets, type AsaasSplitEntry } from './asaas-split';

/**
 * Leitura tipada da configuracao do Asaas. Tudo ja passou pela validacao do
 * .env no boot — aqui e so acesso, sem revalidar.
 */
@Injectable()
export class AsaasConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get apiKey(): string {
    return this.config.get('ASAAS_API_KEY', { infer: true });
  }

  /** Sem chave de API a integracao inteira vira no-op e o fluxo manual segue valendo. */
  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  get baseUrl(): string {
    return this.config.get('ASAAS_ENV', { infer: true }) === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
  }

  get webhookToken(): string {
    return this.config.get('ASAAS_WEBHOOK_TOKEN', { infer: true });
  }

  get dueDays(): number {
    return this.config.get('ASAAS_DUE_DAYS', { infer: true });
  }

  /** Split entre os socios (ex.: 70/30). Vazio = tudo fica na conta principal. */
  get splits(): AsaasSplitEntry[] {
    return parseSplitWallets(this.config.get('ASAAS_SPLIT_WALLETS', { infer: true }));
  }
}
