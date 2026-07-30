import { lazy, Suspense, useMemo, useState } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { formatBRL } from '@rating-pro/shared';
import { Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

const EarningsChart = lazy(() => import('./EarningsChart'));

const COMMISSION_RATE = 0.3;

interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function Range({ label, value, min, max, step, display, onChange }: RangeProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={`range-${label}`} className="text-sm font-medium text-ink-700 dark:text-ink-200">
          {label}
        </label>
        <span className="text-base font-bold tabular-nums text-brand-700 dark:text-brand-300">
          {display}
        </span>
      </div>

      <input
        id={`range-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full',
          '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white',
          '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform',
          '[&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white',
          '[&::-moz-range-thumb]:bg-brand-600',
        )}
        style={{
          // Trilha em cor translúcida neutra: funciona nos dois temas, ao
          // contrário de um token fixo como ink-200.
          background: `linear-gradient(to right, var(--color-brand-500) ${percent}%, rgb(125 122 150 / 0.28) ${percent}%)`,
        }}
      />
    </div>
  );
}

interface EarningsCalculatorProps {
  onUseSimulation: (summary: string) => void;
}

export function EarningsCalculator({ onUseSimulation }: EarningsCalculatorProps) {
  const [salesPerMonth, setSalesPerMonth] = useState(8);
  const [ticket, setTicket] = useState(1400);

  const monthlyCommission = salesPerMonth * ticket * COMMISSION_RATE;
  const perSale = ticket * COMMISSION_RATE;

  const projection = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return {
          month: `${month}º`,
          acumulado: Math.round(monthlyCommission * month),
        };
      }),
    [monthlyCommission],
  );

  const summary =
    `Simulei ${salesPerMonth} vendas/mês com ticket de ${formatBRL(ticket)} — ` +
    `comissão estimada de ${formatBRL(monthlyCommission)}/mês. Quero saber mais.`;

  return (
    <Card className="shadow-lift overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-ink-200 p-6 sm:p-8 lg:border-r dark:border-ink-800">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
              <TrendingUp className="size-4.5" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold text-ink-950 dark:text-white">
              Simule seus ganhos
            </h3>
          </div>

          <div className="space-y-6">
            <Range
              label="Vendas por mês"
              value={salesPerMonth}
              min={1}
              max={40}
              step={1}
              display={String(salesPerMonth)}
              onChange={setSalesPerMonth}
            />

            <Range
              label="Preço cobrado por laudo"
              value={ticket}
              min={400}
              max={4000}
              step={50}
              display={formatBRL(ticket)}
              onChange={setTicket}
            />
          </div>

          <div className="mt-7 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5">
            <p className="text-xs font-semibold tracking-wide text-brand-200 uppercase">
              Sua comissão por mês
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
              {formatBRL(monthlyCommission)}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
              <div>
                <dt className="text-xs text-brand-200">Por venda</dt>
                <dd className="text-sm font-semibold tabular-nums text-white">
                  {formatBRL(perSale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-200">Em 12 meses</dt>
                <dd className="text-sm font-semibold tabular-nums text-white">
                  {formatBRL(monthlyCommission * 12)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            Simulação com comissão de {Math.round(COMMISSION_RATE * 100)}% — a taxa padrão de
            entrada. Números ilustrativos: seu resultado depende do volume que você vender.
          </p>

          <Button
            variant="accent"
            className="mt-5 w-full"
            icon={<ArrowRight className="size-4" aria-hidden />}
            onClick={() => onUseSimulation(summary)}
          >
            Quero esse resultado
          </Button>
        </div>

        <div className="bg-ink-50 p-6 sm:p-8 dark:bg-ink-950/40">
          <h4 className="text-sm font-semibold text-ink-700 dark:text-ink-200">
            Comissão acumulada em 12 meses
          </h4>

          <div className="mt-4 h-56 w-full sm:h-72 lg:h-[19rem]">
            <Suspense fallback={<Skeleton className="size-full" />}>
              <EarningsChart data={projection} />
            </Suspense>
          </div>

          <p className="mt-3 text-xs text-ink-500">
            Projeção linear do valor simulado, sem considerar recorrência de carteira.
          </p>
        </div>
      </div>
    </Card>
  );
}
