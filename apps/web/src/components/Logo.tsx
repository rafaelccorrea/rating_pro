import { useId } from 'react';
import { cn } from '@/lib/cn';
import { env } from '@/config/env';

/**
 * O mark é o próprio produto: o arco de um medidor com o ponteiro subindo.
 * Mesma metáfora do `ScoreGauge`, então a marca e a tela principal contam a
 * mesma história.
 *
 * Geometria em viewBox 32×32, centro do medidor em (16, 20), raio 10.
 * O arco de trilha vai de 170° a 10°; o de progresso para em 55°, e o ponteiro
 * aponta para lá — a leitura é "score alto", não um mostrador vazio.
 */
export function LogoMark({
  className,
  boxed = true,
}: {
  className?: string;
  /** Fundo em gradiente arredondado. Sem ele, o traço herda a cor do texto. */
  boxed?: boolean;
}) {
  const id = useId();
  const boxGradient = `${id}-box`;
  const strokeGradient = `${id}-stroke`;

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={`${env.brandName} — medidor de rating`}
    >
      <defs>
        <linearGradient id={boxGradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="var(--color-brand-700)" />
        </linearGradient>

        <linearGradient id={strokeGradient} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="var(--color-accent-400)" />
        </linearGradient>
      </defs>

      {boxed && <rect width="32" height="32" rx="9" fill={`url(#${boxGradient})`} />}

      {/* Trilha completa do medidor */}
      <path
        d="M 6.15 18.26 A 10 10 0 0 1 25.85 18.26"
        fill="none"
        stroke={boxed ? '#ffffff' : 'currentColor'}
        strokeOpacity={boxed ? 0.3 : 0.22}
        strokeWidth="3.1"
        strokeLinecap="round"
      />

      {/* Progresso até 55° — o trecho "conquistado" */}
      <path
        d="M 6.15 18.26 A 10 10 0 0 1 21.74 11.81"
        fill="none"
        stroke={boxed ? `url(#${strokeGradient})` : 'currentColor'}
        strokeWidth="3.1"
        strokeLinecap="round"
      />

      {/* Ponteiro apontando para o trecho alto da escala */}
      <path
        d="M 16 20 L 20.6 13.45"
        stroke={boxed ? '#ffffff' : 'currentColor'}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      <circle cx="16" cy="20" r="2.15" fill={boxed ? '#ffffff' : 'currentColor'} />
    </svg>
  );
}

/** Lockup completo: mark + nome da marca (vem de VITE_BRAND_NAME). */
export function Logo({
  className,
  markClassName,
  textClassName,
  hideText = false,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  hideText?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn('size-9', markClassName)} />
      <span
        className={cn(
          'text-lg font-semibold tracking-tight',
          hideText && 'sr-only',
          textClassName,
        )}
      >
        {env.brandName}
      </span>
    </span>
  );
}
