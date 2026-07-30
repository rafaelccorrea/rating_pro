import { z } from 'zod';

/**
 * Contrato de configuracao da API. Validado no boot para o processo morrer
 * cedo, com mensagem util, em vez de falhar na primeira requisicao.
 *
 * A autenticacao e resolvida pela propria aplicacao (ver a migration
 * `local_auth`), entao nao ha nenhuma chave do Supabase aqui: a string de
 * conexao do Postgres e o JWT_SECRET sao tudo o que o backend precisa.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_PREFIX: z.string().trim().min(1).default('api'),
  /** Lista separada por virgula. Vazio libera qualquer origem (apenas dev). */
  CORS_ORIGINS: z.string().default(''),

  /** Em segundos; o @nestjs/throttler v6 espera milissegundos e a conversao e feita no modulo. */
  THROTTLE_TTL: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(120),

  DATABASE_URL: z
    .string()
    .trim()
    .min(1, 'DATABASE_URL é obrigatória (string de conexão do Postgres/Supabase)'),
  DIRECT_URL: z.string().trim().optional(),

  JWT_SECRET: z
    .string()
    .trim()
    .min(
      32,
      'JWT_SECRET é obrigatória e precisa de pelo menos 32 caracteres. ' +
        'Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    ),
  /** Validade do token de sessao. Aceita o formato do jsonwebtoken (ex.: 12h, 7d). */
  JWT_EXPIRES_IN: z.string().trim().default('12h'),

  BRAND_NAME: z.string().trim().min(1).default('Rating Pro'),

  /** Onde os anexos dos pedidos sao gravados. Precisa ser volume persistente. */
  UPLOADS_DIR: z.string().trim().min(1).default('./uploads'),

  /**
   * Chave de 32 bytes em base64 para cifrar credenciais de terceiros (senha do
   * Serasa) em AES-256-GCM. Perder a chave torna os dados ilegiveis — guarde
   * junto do resto dos segredos e nao rotacione sem plano de re-cifra.
   * Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  CREDENTIALS_KEY: z
    .string()
    .trim()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'CREDENTIALS_KEY precisa ser 32 bytes em base64',
    }),

  /** Preco de tabela da contratacao direta, em reais. */
  RATING_PRICE_PF: z.coerce.number().nonnegative().default(0),
  RATING_PRICE_PJ: z.coerce.number().nonnegative().default(0),

  /** Chave PIX mostrada na etapa de pagamento. Vazio esconde a instrucao. */
  PIX_KEY: z.string().trim().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detalhes = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      [
        'Configuração de ambiente inválida. Corrija o .env de apps/api (ou o da raiz do monorepo):',
        detalhes,
      ].join('\n'),
    );
  }

  return result.data;
}
