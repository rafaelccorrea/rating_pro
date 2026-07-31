import { Injectable } from '@nestjs/common';
import { AsaasConfigService } from './asaas-config.service';

/** Erro da API do Asaas com a descricao que eles devolvem, para log e mensagem. */
export class AsaasApiError extends Error {
  constructor(
    readonly status: number,
    description: string,
  ) {
    super(`Asaas respondeu ${status}: ${description}`);
    this.name = 'AsaasApiError';
  }
}

/**
 * HTTP minimo para a API do Asaas. Sem retry: quem chama decide se a falha e
 * fatal (webhook devolve 500 e o Asaas reenvia) ou toleravel (criar a cobranca
 * de novo no proximo acesso a tela de pagamento).
 */
@Injectable()
export class AsaasClient {
  constructor(private readonly config: AsaasConfigService) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // O Asaas autentica pela chave neste header (nao e Bearer).
        access_token: this.config.apiKey,
        'User-Agent': 'rating-pro',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Corpo nao-JSON (pagina de erro do proxy etc.); segue nulo.
    }

    if (!response.ok) {
      throw new AsaasApiError(response.status, this.describeError(data) ?? text.slice(0, 200));
    }

    return data as T;
  }

  /** O Asaas devolve `{ errors: [{ code, description }] }` nos 4xx. */
  private describeError(data: unknown): string | null {
    if (typeof data !== 'object' || data === null) return null;

    const errors = (data as { errors?: Array<{ description?: string }> }).errors;
    const description = errors?.[0]?.description;
    return typeof description === 'string' && description ? description : null;
  }
}
