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
