import { z } from 'zod';

/** Subconjunto da API do Asaas que a integracao usa. */

export interface AsaasCustomerResponse {
  id: string;
}

export interface AsaasPaymentResponse {
  id: string;
  status?: string;
  /** Fatura hospedada: QR do PIX, boleto e cartao numa pagina so. */
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  /** yyyy-mm-dd */
  dueDate?: string;
  /** Cobranca removida no painel; nao serve para adotar. */
  deleted?: boolean;
}

export interface AsaasPaymentListResponse {
  data?: AsaasPaymentResponse[];
}

export interface AsaasPixQrCodeResponse {
  success?: boolean;
  /** PIX copia e cola. */
  payload?: string;
  /** QR em base64 — grande de proposito; nao persistimos. */
  encodedImage?: string;
}

/**
 * Corpo dos webhooks de cobranca.
 *
 * Validado com zod e nao apenas tipado: o corpo entra direto em filtro do
 * Prisma, e um valor que nao seja string vira operador de consulta (`{ not: '' }`
 * casaria com qualquer cobranca). Cada campo tem `.catch()` proprio para que
 * lixo em um deles nao derrube o evento inteiro — evento sem nada aproveitavel
 * so vira log.
 *
 * `externalReference` e o id do OrderPayment local (uuid). Cobranca criada por
 * outro sistema na mesma conta Asaas traz outro formato ali; `.catch(null)`
 * descarta em vez de estourar na consulta a uma coluna uuid, que pausaria a
 * fila de webhooks inteira.
 */
export const asaasWebhookEventSchema = z.object({
  event: z.string().trim().max(120).optional().catch(undefined),
  payment: z
    .object({
      id: z.string().trim().min(1).max(120).optional().catch(undefined),
      status: z.string().trim().max(60).optional().catch(undefined),
      externalReference: z.string().trim().uuid().nullable().optional().catch(null),
    })
    .optional()
    .catch(undefined),
});

export type AsaasWebhookEvent = z.infer<typeof asaasWebhookEventSchema>;
