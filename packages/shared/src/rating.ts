import type { RatingGrade, RiskLevel } from './domain';

export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

/**
 * Faixas da escala. Espelha `public.grade_from_score` / `public.risk_from_score`.
 * Ordenado do melhor para o pior; a busca para no primeiro `min` alcancado.
 */
export const SCORE_BANDS: ReadonlyArray<{
  min: number;
  grade: RatingGrade;
  risk: RiskLevel;
  label: string;
}> = [
  { min: 950, grade: 'AAA', risk: 'minimo', label: 'Excepcional' },
  { min: 900, grade: 'AA', risk: 'minimo', label: 'Excelente' },
  { min: 850, grade: 'A', risk: 'baixo', label: 'Muito bom' },
  { min: 780, grade: 'BBB', risk: 'baixo', label: 'Bom' },
  { min: 700, grade: 'BB', risk: 'moderado', label: 'Adequado' },
  { min: 620, grade: 'B', risk: 'moderado', label: 'Regular' },
  { min: 520, grade: 'CCC', risk: 'alto', label: 'Atenção' },
  { min: 420, grade: 'CC', risk: 'alto', label: 'Frágil' },
  { min: 300, grade: 'C', risk: 'critico', label: 'Crítico' },
  { min: 0, grade: 'D', risk: 'critico', label: 'Inadimplente' },
];

function bandFor(score: number) {
  const clamped = clampScore(score);
  // SCORE_BANDS sempre termina em min: 0, entao o find nunca falha.
  return SCORE_BANDS.find((b) => clamped >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score)));
}

export function gradeFromScore(score: number): RatingGrade {
  return bandFor(score).grade;
}

export function riskFromScore(score: number): RiskLevel {
  return bandFor(score).risk;
}

export function bandLabelFromScore(score: number): string {
  return bandFor(score).label;
}

/** Cor de destaque por faixa — usada em badges e no gauge do painel. */
export function riskColor(risk: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    minimo: '#10b981',
    baixo: '#22c55e',
    moderado: '#eab308',
    alto: '#f97316',
    critico: '#ef4444',
  };
  return map[risk];
}

export interface RatingFactor {
  label: string;
  /** Peso do fator no total, de 0 a 1. */
  weight: number;
  /** Nota do fator na mesma escala de 0 a 1000. */
  score: number;
}

/** Fatores sugeridos ao master na hora de emitir; os pesos somam 1. */
export const DEFAULT_FACTORS: ReadonlyArray<Omit<RatingFactor, 'score'>> = [
  { label: 'Histórico de pagamento', weight: 0.3 },
  { label: 'Capacidade de endividamento', weight: 0.25 },
  { label: 'Tempo de relacionamento', weight: 0.15 },
  { label: 'Regularidade cadastral', weight: 0.2 },
  { label: 'Setor de atuação', weight: 0.1 },
];

/** Media ponderada dos fatores. Retorna null se os pesos somarem zero. */
export function scoreFromFactors(factors: readonly RatingFactor[]): number | null {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight <= 0) return null;

  const weighted = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  return clampScore(weighted / totalWeight);
}
