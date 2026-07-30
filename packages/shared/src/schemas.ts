import { z } from 'zod';
import { isValidDocument, onlyDigits } from './br';
import {
  LEAD_STATUSES,
  ORDER_STATUSES,
  PERSON_TYPES,
  PROFILE_STATUSES,
  USER_ROLES,
} from './domain';
import { intakeSchema } from './intake';
import { SCORE_MAX, SCORE_MIN } from './rating';

/**
 * Schemas usados nos dois lados: o NestJS valida a requisicao com eles e o
 * React valida o formulario antes de enviar. Uma definicao, dois usos.
 */

// --- Primitivos -------------------------------------------------------------

const documentSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine(isValidDocument, { message: 'CPF ou CNPJ inválido' });

const phoneSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: 'Telefone deve ter DDD + número',
  });

const stateSchema = z
  .string()
  .trim()
  .length(2, 'UF deve ter 2 letras')
  .transform((v) => v.toUpperCase());

export const uuidSchema = z.string().uuid('Identificador inválido');

// --- Lead (landing page) ----------------------------------------------------

export const createLeadSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  email: z.string().trim().email('E-mail inválido').max(160),
  phone: phoneSchema,
  company: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
  source: z.string().trim().max(60).default('landing'),
  utm: z.record(z.string()).default({}),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  ownerId: uuidSchema.nullable().optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// --- Auth -------------------------------------------------------------------

export const signUpSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  email: z.string().trim().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .max(72, 'Senha muito longa'),
  phone: phoneSchema,
  document: documentSchema.optional(),
  companyName: z.string().trim().max(120).optional().or(z.literal('')),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Troca de senha pelo próprio usuário. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: z
      .string()
      .min(8, 'A nova senha precisa de pelo menos 8 caracteres')
      .max(72, 'Senha muito longa'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Redefinição feita por um master para um revendedor. */
export const adminSetPasswordSchema = z.object({
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(72),
});
export type AdminSetPasswordInput = z.infer<typeof adminSetPasswordSchema>;

// --- Perfil -----------------------------------------------------------------

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  phone: phoneSchema.optional(),
  document: documentSchema.optional(),
  companyName: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  state: stateSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Somente master. */
export const adminUpdateProfileSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(PROFILE_STATUSES).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});
export type AdminUpdateProfileInput = z.infer<typeof adminUpdateProfileSchema>;

// --- Cliente ----------------------------------------------------------------

export const createClientSchema = z
  .object({
    personType: z.enum(PERSON_TYPES),
    document: documentSchema,
    name: z.string().trim().min(3, 'Informe o nome do cliente').max(160),
    email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
    phone: phoneSchema.optional(),
    birthDate: z.string().date('Data inválida').optional().or(z.literal('')),
    city: z.string().trim().max(80).optional().or(z.literal('')),
    state: stateSchema.optional(),
  })
  // O banco tem o mesmo check; validar aqui devolve mensagem util ao usuario.
  .refine((v) => (v.personType === 'pf' ? v.document.length === 11 : v.document.length === 14), {
    message: 'Pessoa física exige CPF e pessoa jurídica exige CNPJ',
    path: ['document'],
  });
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.innerType().partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// --- Pedido -----------------------------------------------------------------

export const createOrderSchema = z
  .object({
    clientId: uuidSchema,
    saleAmount: z.number().min(0, 'Valor não pode ser negativo').max(1_000_000).default(0),
    resellerNotes: z.string().trim().max(2000).optional().or(z.literal('')),
    /**
     * Formulário de coleta (PF ou PJ). Opcional no rascunho — o revendedor pode
     * abrir o pedido e completar depois — mas obrigatório para enviar à análise:
     * sem esses dados não há o que analisar.
     */
    intake: intakeSchema.optional(),
    /** true envia direto para a fila; false salva como rascunho. */
    submit: z.boolean().default(false),
  })
  // Rascunho pode ficar sem valor; enviar para análise sem valor zeraria a
  // comissão do revendedor sem ele perceber.
  .refine((v) => !v.submit || v.saleAmount > 0, {
    message: 'Informe o valor cobrado antes de enviar para análise',
    path: ['saleAmount'],
  })
  .refine((v) => !v.submit || v.intake !== undefined, {
    message: 'Preencha o formulário de análise antes de enviar',
    path: ['intake'],
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderIntakeSchema = z.object({
  intake: intakeSchema,
});
export type UpdateOrderIntakeInput = z.infer<typeof updateOrderIntakeSchema>;

export const updateOrderSchema = z.object({
  saleAmount: z.number().min(0).max(1_000_000).optional(),
  resellerNotes: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const changeOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    reason: z.string().trim().max(1000).optional().or(z.literal('')),
    internalNotes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => v.status !== 'rejected' || (v.reason && v.reason.trim().length >= 5), {
    message: 'Recusa exige um motivo com pelo menos 5 caracteres',
    path: ['reason'],
  });
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// --- Rating -----------------------------------------------------------------

export const ratingFactorSchema = z.object({
  label: z.string().trim().min(2).max(80),
  weight: z.number().min(0).max(1),
  score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
});

/** Tolerância na soma dos pesos: acomoda arredondamento de fração. */
export const FACTOR_WEIGHT_TOLERANCE = 0.011;

export const issueRatingSchema = z
  .object({
    score: z
      .number({ invalid_type_error: 'Informe o score' })
      .int('O score é um número inteiro')
      .min(SCORE_MIN, `O score mínimo é ${SCORE_MIN}`)
      .max(SCORE_MAX, `O score máximo é ${SCORE_MAX}`),
    summary: z
      .string()
      .trim()
      .max(2000, 'O parecer não pode passar de 2000 caracteres')
      .optional()
      .or(z.literal('')),
    factors: z.array(ratingFactorSchema).max(12).default([]),
    /** Validade do laudo em meses a partir da emissao. */
    validityMonths: z
      .number()
      .int()
      .min(1, 'A validade mínima é de 1 mês')
      .max(60, 'A validade máxima é de 60 meses')
      .default(12),
  })
  /*
   * Os pesos precisam somar 1: eles são a média ponderada impressa no laudo, e
   * uma soma diferente de 100% torna a nota por fator incoerente com o total
   * que o cliente lê no documento.
   */
  .refine(
    (v) => {
      if (v.factors.length === 0) return true;
      const total = v.factors.reduce((sum, f) => sum + f.weight, 0);
      return Math.abs(total - 1) <= FACTOR_WEIGHT_TOLERANCE;
    },
    {
      message: 'A soma dos pesos dos fatores precisa fechar em 100%',
      path: ['factors'],
    },
  )
  // Parecer curto demais não ajuda ninguém: ou escreve, ou deixa vazio.
  .refine((v) => !v.summary || v.summary.trim().length >= 20, {
    message: 'O parecer precisa de pelo menos 20 caracteres (ou deixe em branco)',
    path: ['summary'],
  });
export type IssueRatingInput = z.infer<typeof issueRatingSchema>;
