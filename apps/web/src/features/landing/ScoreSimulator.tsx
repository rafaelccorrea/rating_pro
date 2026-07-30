import { useState } from 'react';
import { FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { SCORE_BANDS, SCORE_MAX } from '@rating-pro/shared';
import { ScoreGauge } from '@/components/ScoreGauge';
import { cn } from '@/lib/cn';

const SHORTCUTS = ['D', 'CC', 'BB', 'A', 'AAA'] as const;

const HIGHLIGHTS = [
  {
    icon: FileText,
    title: 'Laudo em PDF pronto para entregar',
    text: 'Gerado quando a análise termina. Sem montar documento na mão.',
  },
  {
    icon: ShieldCheck,
    title: 'Fatores abertos, não caixa-preta',
    text: 'Cada fator com seu peso e sua nota, impressos no documento.',
  },
  {
    icon: Sparkles,
    title: 'Validade definida na emissão',
    text: 'O prazo de validade vai impresso no laudo.',
  },
];

/**
 * Mostra o produto de verdade em vez de um print estático: o visitante mexe no
 * score e vê a classificação e a faixa de risco mudarem com a mesma tabela que
 * o laudo usa (SCORE_BANDS de @rating-pro/shared).
 *
 * Sem borda própria: quem desenha a moldura é o wrapper no hero.
 */
export function ScoreSimulator() {
  const [score, setScore] = useState(812);

  return (
    <div className="surface-glass rounded-card p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Simulador ao vivo
        </p>
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          Interativo
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <ScoreGauge score={score} size={280} />
      </div>

      <div className="mt-5">
        <label htmlFor="score-sim" className="sr-only">
          Ajustar o score simulado
        </label>
        <input
          id="score-sim"
          type="range"
          min={0}
          max={SCORE_MAX}
          step={1}
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
          aria-valuetext={`${score} de ${SCORE_MAX} pontos`}
          className={cn(
            'h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-200 dark:bg-ink-800',
            '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-900',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white',
            '[&::-webkit-slider-thumb]:shadow-md',
            'dark:[&::-webkit-slider-thumb]:bg-white dark:[&::-webkit-slider-thumb]:border-ink-900',
            '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white',
            '[&::-moz-range-thumb]:bg-ink-900',
          )}
        />

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {SHORTCUTS.map((grade) => {
            const band = SCORE_BANDS.find((item) => item.grade === grade);
            if (!band) return null;

            const target = Math.min(band.min + 25, SCORE_MAX);

            return (
              <button
                key={grade}
                type="button"
                onClick={() => setScore(target)}
                className="rounded-lg border border-ink-200 bg-white/60 py-1.5 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-400 hover:text-brand-700 dark:border-ink-700 dark:bg-ink-900/50 dark:text-ink-300 dark:hover:border-brand-500 dark:hover:text-brand-300"
              >
                {grade}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-6 space-y-3 border-t border-ink-200/70 pt-5 dark:border-ink-800/70">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</p>
              <p className="text-xs leading-relaxed text-ink-500">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
