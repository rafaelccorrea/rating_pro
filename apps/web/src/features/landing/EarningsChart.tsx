import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL } from '@rating-pro/shared';

/**
 * Fica em módulo próprio para o recharts (~400 kB) sair do bundle inicial da
 * landing e ser carregado sob demanda.
 */
export default function EarningsChart({
  data,
}: {
  data: Array<{ month: string; acumulado: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="earnings-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="currentColor"
          className="text-ink-200 dark:text-ink-800"
        />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-400" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          className="text-ink-400"
          tickFormatter={(value: number) =>
            value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
          }
          width={44}
        />
        <Tooltip
          formatter={(value) => [formatBRL(Number(value)), 'Acumulado']}
          labelFormatter={(label) => `${label} mês`}
          contentStyle={{
            borderRadius: 12,
            border: '1px solid var(--color-ink-200)',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="acumulado"
          stroke="var(--color-brand-600)"
          strokeWidth={2}
          fill="url(#earnings-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
