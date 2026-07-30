import { z } from 'zod';
import { isValidCPF, onlyDigits } from './br';

/**
 * Formulários de coleta para a análise de rating.
 *
 * São dois conjuntos distintos de dados, porque analisar risco de pessoa física
 * e de empresa não usa a mesma informação: PF gira em torno de renda, vínculo e
 * patrimônio pessoal; PJ, de faturamento, endividamento e regime tributário.
 *
 * Guardados em `rating_orders.intake` (jsonb): é um documento lido por inteiro,
 * cuja forma varia por tipo de pessoa. Modelar isso em coluna daria ~40 campos,
 * metade sempre nula.
 */

// --- Vocabulário -----------------------------------------------------------

export const MARITAL_STATUSES = [
  'solteiro',
  'casado',
  'uniao_estavel',
  'divorciado',
  'viuvo',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABEL: Record<MaritalStatus, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  uniao_estavel: 'União estável',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
};

export const EMPLOYMENT_TYPES = [
  'clt',
  'autonomo',
  'servidor_publico',
  'empresario',
  'aposentado',
  'desempregado',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  clt: 'CLT',
  autonomo: 'Autônomo',
  servidor_publico: 'Servidor público',
  empresario: 'Empresário',
  aposentado: 'Aposentado(a)',
  desempregado: 'Desempregado(a)',
};

export const TAX_REGIMES = ['mei', 'simples', 'presumido', 'real'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  mei: 'MEI',
  simples: 'Simples Nacional',
  presumido: 'Lucro presumido',
  real: 'Lucro real',
};

export const COMPANY_SIZES = ['mei', 'micro', 'pequena', 'media', 'grande'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const COMPANY_SIZE_LABEL: Record<CompanySize, string> = {
  mei: 'MEI',
  micro: 'Microempresa',
  pequena: 'Pequeno porte',
  media: 'Médio porte',
  grande: 'Grande porte',
};

// --- Blocos reutilizados ---------------------------------------------------

const money = (label: string) =>
  z
    .number({ invalid_type_error: `Informe ${label}` })
    .min(0, `${label} não pode ser negativo`)
    .max(999_999_999, `${label} fora da faixa aceita`);

const wholeNumber = (label: string, max = 100_000) =>
  z
    .number({ invalid_type_error: `Informe ${label}` })
    .int(`${label} deve ser um número inteiro`)
    .min(0, `${label} não pode ser negativo`)
    .max(max, `${label} fora da faixa aceita`);

export const addressSchema = z.object({
  zip: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((v) => v.length === 8, { message: 'CEP deve ter 8 dígitos' }),
  street: z.string().trim().min(3, 'Informe o logradouro').max(160),
  number: z.string().trim().min(1, 'Informe o número').max(20),
  complement: z.string().trim().max(80).optional().or(z.literal('')),
  district: z.string().trim().min(2, 'Informe o bairro').max(80),
  city: z.string().trim().min(2, 'Informe a cidade').max(80),
  state: z
    .string()
    .trim()
    .length(2, 'UF deve ter 2 letras')
    .transform((v) => v.toUpperCase()),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Situação de crédito declarada. Vale para PF e PJ. */
const creditSituation = z
  .object({
    hasRestriction: z.boolean(),
    restrictionDetails: z.string().trim().max(500).optional().or(z.literal('')),
    openDebtAmount: money('o valor em aberto'),
    bankRelationships: wholeNumber('a quantidade de bancos', 100),
  })
  // Declarar restrição sem dizer qual deixa a análise sem o dado que importa.
  .refine((v) => !v.hasRestriction || (v.restrictionDetails ?? '').trim().length >= 5, {
    message: 'Descreva a restrição declarada',
    path: ['restrictionDetails'],
  });

const purpose = z
  .string()
  .trim()
  .min(10, 'Descreva a finalidade em pelo menos 10 caracteres')
  .max(500);

// --- Pessoa física ---------------------------------------------------------

export const pfIntakeSchema = z.object({
  personType: z.literal('pf'),

  birthDate: z.string().date('Data de nascimento inválida'),
  motherName: z.string().trim().max(160).optional().or(z.literal('')),
  maritalStatus: z.enum(MARITAL_STATUSES, { message: 'Selecione o estado civil' }),
  dependents: wholeNumber('o número de dependentes', 30),

  occupation: z.string().trim().min(2, 'Informe a profissão').max(120),
  employmentType: z.enum(EMPLOYMENT_TYPES, { message: 'Selecione o vínculo' }),
  employmentMonths: wholeNumber('o tempo de vínculo em meses', 900),
  monthlyIncome: money('a renda mensal'),
  otherIncome: money('a outra renda'),

  address: addressSchema,

  assets: z.object({
    realEstate: money('o valor em imóveis'),
    vehicles: money('o valor em veículos'),
    investments: money('o valor em investimentos'),
  }),

  credit: creditSituation,
  purpose,
});
export type PfIntakeInput = z.infer<typeof pfIntakeSchema>;

// --- Pessoa jurídica -------------------------------------------------------

export const pjIntakeSchema = z.object({
  personType: z.literal('pj'),

  legalName: z.string().trim().min(3, 'Informe a razão social').max(160),
  tradeName: z.string().trim().max(160).optional().or(z.literal('')),
  foundedAt: z.string().date('Data de fundação inválida'),
  taxRegime: z.enum(TAX_REGIMES, { message: 'Selecione o regime tributário' }),
  companySize: z.enum(COMPANY_SIZES, { message: 'Selecione o porte' }),
  sector: z.string().trim().min(3, 'Informe o setor de atuação').max(120),
  employees: wholeNumber('o número de funcionários', 500_000),

  address: addressSchema,

  representative: z.object({
    name: z.string().trim().min(3, 'Informe o nome do responsável').max(160),
    document: z
      .string()
      .trim()
      .transform(onlyDigits)
      .refine(isValidCPF, { message: 'CPF do responsável inválido' }),
    sharePercent: z
      .number({ invalid_type_error: 'Informe a participação' })
      .min(0, 'A participação não pode ser negativa')
      .max(100, 'A participação não passa de 100%'),
  }),

  financials: z
    .object({
      monthlyRevenue: money('o faturamento mensal'),
      annualRevenue: money('o faturamento anual'),
      netProfit: z
        .number({ invalid_type_error: 'Informe o resultado' })
        // Prejuízo é informação legítima e relevante para o risco.
        .min(-999_999_999)
        .max(999_999_999),
      shareCapital: money('o capital social'),
      currentDebt: money('o endividamento atual'),
      totalAssets: money('o patrimônio total'),
    })
    // Faturamento anual menor que o mensal é erro de digitação, não um dado.
    .refine((v) => v.annualRevenue === 0 || v.annualRevenue >= v.monthlyRevenue, {
      message: 'O faturamento anual não pode ser menor que o mensal',
      path: ['annualRevenue'],
    }),

  hasAuditedStatements: z.boolean(),
  credit: creditSituation,
  purpose,
});
export type PjIntakeInput = z.infer<typeof pjIntakeSchema>;

// --- União -----------------------------------------------------------------

/**
 * Discriminada por `personType`: garante que um pedido de PF não seja enviado
 * com o corpo de PJ, e que o zod escolha as mensagens de erro certas.
 */
export const intakeSchema = z.discriminatedUnion('personType', [
  pfIntakeSchema,
  pjIntakeSchema,
]);
export type IntakeInput = z.infer<typeof intakeSchema>;

/** Renda/faturamento mensal, para exibição unificada em lista. */
export function intakeMonthlyIncome(intake: IntakeInput): number {
  return intake.personType === 'pf'
    ? intake.monthlyIncome + intake.otherIncome
    : intake.financials.monthlyRevenue;
}

/**
 * Comprometimento de renda: dívida em aberto sobre a renda/faturamento mensal.
 * É um dos sinais que a equipe olha ao ponderar os fatores do rating.
 */
export function debtToIncomeRatio(intake: IntakeInput): number | null {
  const income = intakeMonthlyIncome(intake);
  if (income <= 0) return null;

  const debt =
    intake.personType === 'pf'
      ? intake.credit.openDebtAmount
      : intake.credit.openDebtAmount + intake.financials.currentDebt;

  return debt / income;
}
