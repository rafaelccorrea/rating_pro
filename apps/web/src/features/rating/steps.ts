import type { PersonType } from '@rating-pro/shared';

/**
 * Rótulos das etapas. O resto do vocabulário (escolaridade, checklist de
 * documentos, formas de pagamento) mora em `@rating-pro/shared`, porque a API
 * valida com a mesma lista — duplicar aqui daria divergência silenciosa.
 */

export const WIZARD_STEPS_PJ = [
  'Dados da Empresa',
  'Dados Pessoais',
  'Documentos',
  'Pagamento',
] as const;

export const WIZARD_STEPS_PF = ['Dados Pessoais', 'Perfil', 'Documentos', 'Pagamento'] as const;

export function stepLabels(personType: PersonType): readonly string[] {
  return personType === 'pj' ? WIZARD_STEPS_PJ : WIZARD_STEPS_PF;
}

/** Em qual etapa cada campo do schema da API aparece, para levar o erro lá. */
export const FIELD_STEP: Record<string, number> = {
  resellerId: 0,
  name: 0,
  document: 0,
  birthDate: 0,
  email: 0,
  phone: 0,
  'applicant.maritalStatus': 1,
  'applicant.education': 1,
  'applicant.occupation': 1,
  'applicant.serasaPassword': 1,
  paymentMethod: 3,
};

/** Campo do schema -> campo do formulário. */
export const FIELD_ALIAS: Record<string, string> = {
  name: 'legalName',
  'applicant.maritalStatus': 'maritalStatus',
  'applicant.education': 'education',
  'applicant.occupation': 'occupation',
  'applicant.serasaPassword': 'serasaPassword',
  paymentMethod: 'method',
};
