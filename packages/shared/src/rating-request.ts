import { z } from 'zod';
import { isValidCNPJ, isValidCPF, onlyDigits } from './br';
import { MARITAL_STATUSES } from './intake';

/**
 * Contratacao de rating pelo fluxo de quatro etapas (cadastro, perfil,
 * documentos e pagamento).
 *
 * E um caminho diferente do `createOrder`: la o revendedor escolhe um cliente
 * ja cadastrado e define o preco; aqui a pessoa se cadastra, envia documentos e
 * paga na hora. O pedido resultante e o mesmo `rating_orders` — muda so a porta
 * de entrada.
 */

// --- Vocabulario ------------------------------------------------------------

export const EDUCATION_LEVELS = [
  'fundamental',
  'medio',
  'tecnico',
  'superior',
  'pos',
  'mestrado',
  'doutorado',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LABEL: Record<EducationLevel, string> = {
  fundamental: 'Ensino fundamental',
  medio: 'Ensino médio',
  tecnico: 'Ensino técnico',
  superior: 'Ensino superior',
  pos: 'Pós-graduação',
  mestrado: 'Mestrado',
  doutorado: 'Doutorado',
};

export const PAYMENT_METHODS = ['pix', 'card', 'boleto'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  card: 'Cartão de crédito',
  boleto: 'Boleto',
};

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

// --- Checklist de documentos ------------------------------------------------

export interface DocumentSlot {
  key: string;
  label: string;
  /** Sem ele o pedido nao pode ser enviado para analise. */
  required: boolean;
  hint?: string;
}

/**
 * DRE e Balanco sao os unicos obrigatorios no PJ: sem eles a analise contabil
 * nao roda e o prazo de 35 dias nao comeca a contar. Os demais o analista
 * consegue cobrar durante a analise, entao nao travam o envio.
 */
export const PJ_DOCUMENT_SLOTS: readonly DocumentSlot[] = [
  { key: 'docFront', label: 'Documento com foto (FRENTE, todos sócios)', required: false },
  { key: 'docBack', label: 'Documento com foto (VERSO, todos sócios)', required: false },
  { key: 'selfie', label: 'Selfie dos sócios segurando o mesmo documento', required: false },
  { key: 'cnpjCard', label: 'Cartão CNPJ', required: false },
  { key: 'articles', label: 'Contrato Social', required: false },
  { key: 'addressProof', label: 'Comprovante de residência', required: false },
  { key: 'revenue', label: 'Faturamento (últimos 12 meses)', required: false },
  {
    key: 'dre',
    label: 'DRE 2025 (Demonstração do Resultado do Exercício)',
    required: true,
    hint: 'Assinado pelo contador',
  },
  {
    key: 'balanceSheet',
    label: 'Balanço Patrimonial 2025',
    required: true,
    hint: 'Assinado pelo contador',
  },
] as const;

export const PF_DOCUMENT_SLOTS: readonly DocumentSlot[] = [
  { key: 'docFront', label: 'Documento com foto (FRENTE)', required: true },
  { key: 'docBack', label: 'Documento com foto (VERSO)', required: true },
  { key: 'selfie', label: 'Selfie segurando o mesmo documento', required: true },
  { key: 'addressProof', label: 'Comprovante de residência', required: false },
  { key: 'incomeProof', label: 'Comprovante de renda (últimos 3 meses)', required: false },
] as const;

export function documentSlots(personType: 'pf' | 'pj'): readonly DocumentSlot[] {
  return personType === 'pj' ? PJ_DOCUMENT_SLOTS : PF_DOCUMENT_SLOTS;
}

export function requiredDocumentSlots(personType: 'pf' | 'pj'): readonly DocumentSlot[] {
  return documentSlots(personType).filter((slot) => slot.required);
}

export const DOCUMENT_SLOT_KEYS = [
  ...new Set([...PJ_DOCUMENT_SLOTS, ...PF_DOCUMENT_SLOTS].map((slot) => slot.key)),
] as const;

export const ACCEPTED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

// --- Schemas ----------------------------------------------------------------

/** `dd/mm/aaaa` ou ISO; normaliza para ISO e recusa data que nao existe. */
const brDateSchema = z
  .string()
  .trim()
  .min(1, 'Informe a data')
  .transform((value) => {
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    return br ? `${br[3]}-${br[2]}-${br[1]}` : value;
  })
  .refine((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso), { message: 'Data inválida' })
  .refine((iso) => {
    // Recompoe e compara: so assim 31/02 cai fora — o regex acima aceitaria.
    const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Data inválida')
  .refine((iso) => new Date(iso).getTime() <= Date.now(), 'A data não pode ser no futuro');

const phoneSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((v) => v.length >= 10 && v.length <= 11, 'WhatsApp deve ter DDD + número');

/** Etapa 2 — igual para PF e PJ: quem responde e sempre uma pessoa. */
const applicantSchema = z.object({
  maritalStatus: z.enum(MARITAL_STATUSES, { message: 'Selecione o estado civil' }),
  education: z.enum(EDUCATION_LEVELS, { message: 'Selecione a escolaridade' }),
  occupation: z.string().trim().min(2, 'Informe a profissão').max(120),
  /**
   * Guardada cifrada e nunca devolvida pela API: e credencial de terceiro,
   * usada so pelo analista para puxar o relatorio.
   */
  serasaPassword: z.string().min(4, 'Informe a senha Serasa').max(120),
});

const baseSchema = z.object({
  email: z.string().trim().email('Email inválido').max(160),
  phone: phoneSchema,
  birthDate: brDateSchema,
  applicant: applicantSchema,
  paymentMethod: z.enum(PAYMENT_METHODS, { message: 'Escolha a forma de pagamento' }),
});

export const ratingRequestSchema = z.discriminatedUnion('personType', [
  baseSchema.extend({
    personType: z.literal('pf'),
    name: z.string().trim().min(3, 'Informe o nome completo').max(160),
    document: z
      .string()
      .trim()
      .transform(onlyDigits)
      .refine(isValidCPF, 'CPF inválido'),
  }),
  baseSchema.extend({
    personType: z.literal('pj'),
    /** Razao social. */
    name: z.string().trim().min(3, 'Informe a razão social').max(160),
    document: z
      .string()
      .trim()
      .transform(onlyDigits)
      .refine(isValidCNPJ, 'CNPJ inválido'),
  }),
]);
export type RatingRequestInput = z.infer<typeof ratingRequestSchema>;

/** Etapa 3: metadado do anexo. O arquivo em si vai como multipart. */
export const documentSlotSchema = z.object({
  slot: z.enum(DOCUMENT_SLOT_KEYS as unknown as [string, ...string[]], {
    message: 'Documento fora da lista',
  }),
});
export type DocumentSlotInput = z.infer<typeof documentSlotSchema>;

export const confirmPaymentSchema = z.object({
  status: z.enum(['paid', 'failed', 'cancelled', 'refunded']),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
