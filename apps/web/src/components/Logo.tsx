import { cn } from '@/lib/cn';
import { env } from '@/config/env';

/**
 * Cores da marca, tiradas do arquivo original da logo (moda dos pixels opacos).
 * Ficam aqui e não no tema porque são da identidade e não mudam com light/dark.
 */
const NAVY = '#04294F';
const ORANGE = '#F98A2E';

/**
 * O mark é a pilha (toggle) do lockup — o único elemento gráfico da marca.
 * Redesenhado em vetor em vez de recortado do JPEG: fica nítido em qualquer
 * tamanho e o `boxed` consegue inverter as cores sem artefato de compressão.
 *
 * Geometria em viewBox 32×32: pilha de 22×11.2 centralizada, botão à direita
 * (estado "ligado"), igual ao original.
 */
export function LogoMark({
  className,
  boxed = true,
}: {
  className?: string;
  /** Fundo navy arredondado. Sem ele, a pilha herda a cor do texto. */
  boxed?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={env.brandName}
    >
      {boxed && <rect width="32" height="32" rx="9" fill={NAVY} />}

      <rect
        x="5"
        y="10.4"
        width="22"
        height="11.2"
        rx="5.6"
        fill={boxed ? '#0B3A6B' : 'currentColor'}
        stroke={boxed ? '#ffffff' : 'currentColor'}
        strokeOpacity={boxed ? 0.26 : 0}
        strokeWidth="0.8"
      />

      <circle cx="21.4" cy="16" r="4.5" fill={ORANGE} />
    </svg>
  );
}

/**
 * Lockup completo. O nome da marca faz parte da arte, então renderizamos a
 * imagem e o texto vira `alt` — nada de escrever o nome duas vezes.
 *
 * São dois arquivos: o normal (navy) e o `logo-dark` (navy virado branco),
 * porque o navy some em fundo escuro. A troca é por CSS, sem JS de tema.
 */
export function Logo({
  className,
  markClassName,
  textClassName,
  hideText = false,
  onDark = false,
}: {
  className?: string;
  /** Mantido por compatibilidade: aplica-se à imagem do lockup. */
  markClassName?: string;
  /** Mantido por compatibilidade: só tem efeito com `hideText`. */
  textClassName?: string;
  /** Mostra apenas o mark quadrado, sem o wordmark. */
  hideText?: boolean;
  /** Força a arte clara — para fundos escuros que não dependem do tema. */
  onDark?: boolean;
}) {
  if (hideText) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <LogoMark className={cn('size-9', markClassName)} />
        <span className={cn('sr-only', textClassName)}>{env.brandName}</span>
      </span>
    );
  }

  const common = cn('h-9 w-auto select-none', markClassName);

  if (onDark) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <img
          src="/logo-dark-600.png"
          srcSet="/logo-dark-300.png 300w, /logo-dark-600.png 600w, /logo-dark-1200.png 1200w"
          sizes="220px"
          alt={env.brandName}
          width={600}
          height={150}
          className={common}
        />
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <img
        src="/logo-600.png"
        srcSet="/logo-300.png 300w, /logo-600.png 600w, /logo-1200.png 1200w"
        sizes="220px"
        alt={env.brandName}
        width={600}
        height={150}
        className={cn(common, 'dark:hidden')}
      />
      <img
        src="/logo-dark-600.png"
        srcSet="/logo-dark-300.png 300w, /logo-dark-600.png 600w, /logo-dark-1200.png 1200w"
        sizes="220px"
        alt=""
        aria-hidden="true"
        width={600}
        height={150}
        className={cn(common, 'hidden dark:block')}
      />
    </span>
  );
}
