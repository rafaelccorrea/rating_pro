/**
 * Constantes e tipos do dominio. Espelham 1:1 os enums criados nas migrations
 * (`supabase/migrations/20260729120000_init_enums_and_tables.sql`).
 * Ao mexer em um enum do banco, mexa aqui tambem.
 */

export const USER_ROLES = ['master', 'reseller'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROFILE_STATUSES = ['pending', 'active', 'suspended'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const PERSON_TYPES = ['pf', 'pj'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const ORDER_STATUSES = [
  'draft',
  'submitted',
  'in_analysis',
  'pending_doc',
  'approved',
  'delivered',
  'rejected',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const RATING_GRADES = [
  'AAA',
  'AA',
  'A',
  'BBB',
  'BB',
  'B',
  'CCC',
  'CC',
  'C',
  'D',
] as const;
export type RatingGrade = (typeof RATING_GRADES)[number];

export const RISK_LEVELS = ['minimo', 'baixo', 'moderado', 'alto', 'critico'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Rotulos em pt-BR para exibicao. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  submitted: 'Enviado',
  in_analysis: 'Em análise',
  pending_doc: 'Pendência',
  approved: 'Aprovado',
  delivered: 'Entregue',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  minimo: 'Risco mínimo',
  baixo: 'Risco baixo',
  moderado: 'Risco moderado',
  alto: 'Risco alto',
  critico: 'Risco crítico',
};

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, string> = {
  pending: 'Aguardando aprovação',
  active: 'Ativo',
  suspended: 'Suspenso',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

/**
 * Transicoes permitidas do pedido. Precisa bater com o trigger
 * `rating_orders_guard_transition` — o banco e a autoridade final; esta copia
 * existe so para a UI nao oferecer um botao que o banco vai recusar.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['in_analysis', 'pending_doc', 'rejected', 'cancelled'],
  in_analysis: ['pending_doc', 'approved', 'rejected'],
  pending_doc: ['submitted', 'in_analysis', 'rejected', 'cancelled'],
  approved: ['delivered', 'rejected'],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Status que ainda consomem trabalho da operacao. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  'submitted',
  'in_analysis',
  'pending_doc',
  'approved',
];
