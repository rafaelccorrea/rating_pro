import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useReveal } from '@/hooks/useReveal';
import { COMPARISON, FAQ_ITEMS } from './content';

/** Seção com animação de entrada. Sem observer o conteúdo já nasce visível. */
export function Section({
  id,
  className,
  children,
  label,
  /** Remove o container interno, para a seção sangrar na largura total. */
  bleed = false,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  label?: string;
  bleed?: boolean;
}) {
  const ref = useReveal<HTMLElement>();

  return (
    <section
      id={id}
      ref={ref}
      aria-label={label}
      className={cn(
        'reveal py-20 sm:py-24 lg:py-32',
        !bleed && 'container-page',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && (
        <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase dark:text-brand-400">
          <span className="h-px w-6 bg-brand-400/60" aria-hidden />
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-headline font-semibold text-ink-950 dark:text-white">{title}</h2>
      {description && (
        <p className="mt-4 text-lead text-ink-600 dark:text-ink-300">{description}</p>
      )}
    </div>
  );
}

export function ComparisonTable({ brandName }: { brandName: string }) {
  return (
    <div className="mt-12">
      {/* Tabela a partir de md; abaixo disso viraria scroll horizontal ruim. */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-card border border-ink-200 dark:border-ink-800">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Comparativo entre {brandName} e o processo tradicional de contratação de rating
            </caption>
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900/60">
                <th scope="col" className="px-5 py-4 font-medium text-ink-500">
                  Recurso
                </th>
                <th
                  scope="col"
                  className="w-44 px-5 py-4 text-center font-semibold text-brand-700 dark:text-brand-300"
                >
                  {brandName}
                </th>
                <th scope="col" className="w-44 px-5 py-4 text-center font-medium text-ink-500">
                  Processo tradicional
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr
                  key={row.feature}
                  className="border-t border-ink-100 even:bg-ink-50/40 dark:border-ink-800/60 dark:even:bg-ink-900/25"
                >
                  <th
                    scope="row"
                    className="px-5 py-4 font-normal text-ink-700 dark:text-ink-200"
                  >
                    {row.feature}
                  </th>
                  <td className="bg-brand-50/50 px-5 py-4 text-center dark:bg-brand-950/25">
                    <Cell value={row.ours} positive />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Cell value={row.theirs} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: cada recurso vira um card com as duas colunas lado a lado. */}
      <ul className="space-y-3 md:hidden">
        {COMPARISON.map((row) => (
          <li
            key={row.feature}
            className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900/60"
          >
            <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{row.feature}</p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand-50 px-3 py-2 text-center dark:bg-brand-950/40">
                <p className="text-[11px] font-semibold text-brand-700 uppercase dark:text-brand-300">
                  {brandName}
                </p>
                <div className="mt-1">
                  <Cell value={row.ours} positive />
                </div>
              </div>

              <div className="rounded-xl bg-ink-50 px-3 py-2 text-center dark:bg-ink-800/60">
                <p className="text-[11px] font-semibold text-ink-500 uppercase">Tradicional</p>
                <div className="mt-1">
                  <Cell value={row.theirs} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ value, positive = false }: { value: boolean | string; positive?: boolean }) {
  if (typeof value === 'string') {
    return (
      <span
        className={cn(
          'text-sm font-medium',
          positive ? 'text-ink-900 dark:text-ink-100' : 'text-ink-500',
        )}
      >
        {value}
      </span>
    );
  }

  return value ? (
    <>
      <Check className="mx-auto size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="sr-only">Sim</span>
    </>
  ) : (
    <>
      <Minus className="mx-auto size-5 text-ink-300 dark:text-ink-600" aria-hidden />
      <span className="sr-only">Não</span>
    </>
  );
}

export function Faq() {
  return (
    <div className="mt-8 space-y-3">
      {FAQ_ITEMS.map((item) => (
        <details
          key={item.question}
          className="group rounded-2xl border border-ink-200 bg-white px-5 transition-colors open:border-brand-300 hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/50 dark:open:border-brand-700 dark:hover:border-ink-700"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-left font-medium text-ink-900 dark:text-ink-100">
            <span>{item.question}</span>
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full border border-ink-300 text-ink-500 transition-transform duration-300 group-open:rotate-45 group-open:border-brand-400 group-open:text-brand-600 dark:border-ink-700 dark:group-open:text-brand-400"
              aria-hidden
            >
              +
            </span>
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
