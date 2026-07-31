import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Copy,
  Download,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  formatBRL,
  formatDate,
  PAYMENT_METHOD_LABEL,
  type PartnersOverview,
} from '@rating-pro/shared';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/features/panel/PanelLayout';
import { usePartners, usePartnersCsv, type PartnersFilters } from '@/features/panel/hooks';

/**
 * Prestação de contas entre os sócios.
 *
 * Duas regras de leitura, que a tela repete em texto porque é delas que sai a
 * confiança no número: **regime de caixa** (conta o que foi pago, não o que foi
 * entregue) e **valor devido, não creditado** (o rateio diz o que cabe a cada
 * um; o crédito segue o prazo do meio de pagamento).
 *
 * A gramática visual separa as duas naturezas: cor cheia é dinheiro que
 * existe, contorno é promessa.
 */

// ------------------------------------------------------------------- período

type PresetKey = 'month' | 'lastMonth' | 'quarter' | 'year';

const PRESETS: ReadonlyArray<{ key: PresetKey; label: string }> = [
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'quarter', label: '3 meses' },
  { key: 'year', label: '12 meses' },
];

const iso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** O período de cada atalho, em datas locais — o servidor as lê como Brasília. */
function rangeOf(preset: PresetKey): PartnersFilters {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  switch (preset) {
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(first), to: iso(last), months: 6 };
    }
    case 'quarter':
      return { from: iso(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: iso(today), months: 6 };
    case 'year':
      return { from: iso(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to: iso(today), months: 12 };
    default:
      return { from: iso(firstOfMonth), to: iso(today), months: 6 };
  }
}

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-07` vira `jul/26`. */
const monthLabel = (month: string): string => {
  const [year = '', index = ''] = month.split('-');
  return `${MONTH_NAMES[Number(index) - 1] ?? month}/${year.slice(2)}`;
};

// --------------------------------------------------------------------- peças

function Tile({
  label,
  value,
  hint,
  tone = 'neutral',
  promise = false,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: 'brand' | 'positive' | 'warning' | 'neutral';
  /** Contorno em vez de cor cheia: é promessa, não dinheiro que existe. */
  promise?: boolean;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300',
    positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
  } as const;

  return (
    <Card className={cn('p-4', promise && 'border-dashed bg-transparent dark:bg-transparent')}>
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p
        className={cn(
          'mt-1.5 inline-flex rounded-lg px-2 py-1 text-2xl font-semibold tabular-nums',
          promise ? 'px-0 text-ink-700 dark:text-ink-200' : tones[tone],
        )}
      >
        {value}
      </p>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </Card>
  );
}

/** Linha da cascata: rótulo à esquerda, valor tabular à direita. */
function CascadeRow({
  label,
  value,
  sign,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  sign?: '−' | '=';
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5',
        strong && 'border-t border-ink-200 pt-2.5 dark:border-ink-800',
      )}
    >
      <dt className={cn('text-sm', strong ? 'font-semibold text-ink-900 dark:text-ink-100' : 'text-ink-600 dark:text-ink-300')}>
        {sign && <span className="mr-1 text-ink-400 tabular-nums">{sign}</span>}
        {label}
      </dt>
      <dd
        className={cn(
          'shrink-0 text-sm tabular-nums',
          muted && 'text-ink-400 italic',
          strong
            ? 'text-base font-semibold text-ink-950 dark:text-white'
            : 'font-medium text-ink-800 dark:text-ink-200',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------- conteúdo

function SplitBanner({ data }: { data: PartnersOverview }) {
  const parts = data.splitConfig.map((share) => `${share.name} ${share.percent}%`).join(' · ');

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <Wallet className="size-4 shrink-0 text-ink-400" aria-hidden />
        <p className="text-sm text-ink-700 dark:text-ink-200">
          <span className="font-medium">Rateio vigente:</span> {parts || 'não configurado'}
        </p>
      </div>

      {!data.gatewayEnabled && (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Cobrança manual — nada passa pelo split
        </Badge>
      )}
      {data.splitSource === 'partial' && (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Parte do período não passou pelo rateio
        </Badge>
      )}
    </Card>
  );
}

function Cascade({ data }: { data: PartnersOverview }) {
  const { cash, commission, partners } = data;
  const result = Math.round((cash.net - commission) * 100) / 100;

  return (
    <Card className="flex flex-col">
      <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
        Como o dinheiro se divide
      </h2>

      <dl className="mt-3">
        <CascadeRow label="Bruto recebido" value={formatBRL(cash.gross)} />
        <CascadeRow
          label="Taxa do Asaas"
          sign="−"
          value={cash.fees === null ? 'não registrada' : formatBRL(cash.fees)}
          muted={cash.fees === null}
        />
        <CascadeRow label="Líquido" sign="=" value={formatBRL(cash.net)} />
        <CascadeRow label="Comissão gerada" sign="−" value={formatBRL(commission)} />
        <CascadeRow label="Resultado da sociedade" sign="=" value={formatBRL(result)} strong />
      </dl>

      <div className="mt-4 space-y-2">
        {partners.length === 0 ? (
          <p className="rounded-xl bg-ink-50 p-3 text-xs text-ink-500 dark:bg-ink-950/50">
            Nenhuma cobrança do período passou pelo rateio.
          </p>
        ) : (
          partners.map((partner) => (
            <div
              key={partner.key}
              className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-950/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {partner.name}
                </p>
                <p className="text-xs text-ink-500">
                  {partner.percent}% · comissão {formatBRL(partner.commission)}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink-950 dark:text-white">
                {formatBRL(partner.net)}
              </p>
            </div>
          ))
        )}

        {data.unattributed.count > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300 px-3 py-2.5 dark:border-amber-900">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Sem rateio registrado
              </p>
              <p className="text-xs text-ink-500">
                {data.unattributed.count} cobrança(s) fora do gateway
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {formatBRL(data.unattributed.amount)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function MonthlyChart({ data }: { data: PartnersOverview }) {
  const chart = data.monthly.map((row) => ({
    label: monthLabel(row.month),
    Recebido: row.received,
    Prometido: row.promised,
  }));

  const empty = chart.every((row) => row.Recebido === 0 && row.Prometido === 0);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
          Recebido e prometido por mês
        </h2>
        <p className="text-xs text-ink-500">
          barra cheia = pago · barra clara = cobrança em aberto, pelo vencimento
        </p>
      </div>

      {empty ? (
        <div className="grid min-h-56 flex-1 place-items-center">
          <p className="text-sm text-ink-500">Sem movimento no período.</p>
        </div>
      ) : (
        <div className="mt-4 min-h-64 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-ink-200 dark:text-ink-800"
              />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-ink-400" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-ink-400"
                width={64}
                tickFormatter={(value: number) => formatBRL(value).replace('R$', '').trim()}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                formatter={(value) => formatBRL(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Recebido" fill="var(--color-brand-600)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Prometido" fill="var(--color-brand-600)" fillOpacity={0.35} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function OverdueList({ data }: { data: PartnersOverview }) {
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link da fatura copiado');
    } catch {
      toast.error('Não consegui copiar o link');
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
          Cobranças vencidas
        </h2>
      </div>

      {data.overdueCharges.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nenhuma cobrança vencida em aberto.</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink-100 dark:divide-ink-800">
          {data.overdueCharges.map((charge) => (
            <li key={charge.paymentId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-ink-500">{charge.code}</span>
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                    {charge.daysLate}d
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-800 dark:text-ink-200">
                  {charge.clientName}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {charge.resellerName} · {PAYMENT_METHOD_LABEL[charge.method]} · venceu{' '}
                  {formatDate(charge.dueDate)}
                </p>
              </div>

              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                {formatBRL(charge.amount)}
              </p>

              {charge.invoiceUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<Copy className="size-3.5" aria-hidden />}
                  onClick={() => void copy(charge.invoiceUrl!)}
                >
                  Fatura
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Reconciliation({ data }: { data: PartnersOverview }) {
  const lines = [
    {
      label: 'Recebido fora do gateway',
      hint: 'baixa manual: não passou pelo rateio',
      value: formatBRL(data.unattributed.amount),
      count: data.unattributed.count,
    },
    {
      label: 'Pedido vivo sem cobrança',
      hint: 'entregue ou em análise e nunca faturado',
      value: formatBRL(data.receivables.uncharged.amount),
      count: data.receivables.uncharged.count,
    },
    {
      label: 'Cobrança que não chegou ao gateway',
      hint: 'pendente sem fatura no Asaas',
      value: formatBRL(data.receivables.withoutGateway.amount),
      count: data.receivables.withoutGateway.count,
    },
    {
      label: 'Cartão em liquidação',
      hint: 'aprovado, repasse em ~30 dias',
      value: formatBRL(data.cash.settling),
      count: null,
    },
    {
      label: 'Estornado no período',
      hint: 'sai do resultado, não do mês em que entrou',
      value: formatBRL(data.cash.refunded),
      count: null,
    },
  ].filter((line) => line.count === null ? line.value !== formatBRL(0) : line.count > 0);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-ink-400" aria-hidden />
        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Conciliação</h2>
      </div>

      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          Nada fora do lugar: todo o dinheiro do período passou pelo rateio.
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-ink-100 dark:divide-ink-800">
          {lines.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <dt className="text-sm text-ink-800 dark:text-ink-200">
                  {line.label}
                  {line.count !== null && (
                    <span className="ml-1.5 text-xs text-ink-400">({line.count})</span>
                  )}
                </dt>
                <p className="text-xs text-ink-500">{line.hint}</p>
              </div>
              <dd className="shrink-0 text-sm font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function ResellersTable({ data }: { data: PartnersOverview }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
        Quem trouxe o dinheiro
      </h2>

      {data.topResellers.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Sem recebimentos no período.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-ink-500 uppercase">
                <th className="py-2 font-medium">Revendedor</th>
                <th className="py-2 text-right font-medium">Pagos</th>
                <th className="py-2 text-right font-medium">Recebido</th>
                <th className="py-2 text-right font-medium">Comissão gerada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {data.topResellers.map((reseller) => (
                <tr key={reseller.id}>
                  <td className="max-w-48 truncate py-2.5 text-ink-800 dark:text-ink-200">
                    {reseller.name}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink-500">{reseller.count}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-ink-900 dark:text-ink-100">
                    {formatBRL(reseller.total)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink-600 dark:text-ink-300">
                    {formatBRL(reseller.commission)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.byMethod.length > 0 && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500 dark:border-ink-800">
          Por forma de pagamento:{' '}
          {data.byMethod
            .map((row) => `${PAYMENT_METHOD_LABEL[row.method]} ${formatBRL(row.total)}`)
            .join(' · ')}
        </p>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------- página

export function PartnersPage() {
  const [preset, setPreset] = useState<PresetKey>('month');
  const filters = useMemo(() => rangeOf(preset), [preset]);

  const { data, isLoading, error, refetch } = usePartners(filters);
  const csv = usePartnersCsv();

  const change = data?.cash.changePct ?? null;

  return (
    <>
      <PageHeader
        title="Sócios"
        description="Quanto entrou no período e quanto cabe a cada um."
        action={
          <Button
            variant="outline"
            icon={<Download className="size-4" aria-hidden />}
            loading={csv.isPending}
            onClick={() =>
              csv.mutate(filters, {
                onError: (mutationError: Error) => toast.error(mutationError.message),
              })
            }
          >
            Exportar CSV
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {PRESETS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setPreset(option.key)}
            aria-pressed={preset === option.key}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              preset === option.key
                ? 'bg-brand-600 text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <SplitBanner data={data} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Recebido no período"
              value={formatBRL(data.cash.gross)}
              tone="brand"
              hint={
                <span className="inline-flex items-center gap-1">
                  {change !== null && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 font-medium',
                        change >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {change >= 0 ? (
                        <ArrowUpRight className="size-3" aria-hidden />
                      ) : (
                        <ArrowDownRight className="size-3" aria-hidden />
                      )}
                      {Math.abs(change)}%
                    </span>
                  )}
                  {data.cash.count} cobrança(s) · ticket {formatBRL(data.cash.avgTicket)}
                </span>
              }
            />
            <Tile
              label="A receber no prazo"
              value={formatBRL(data.receivables.open)}
              promise
              hint="cobrança em aberto, ainda não vencida"
            />
            <Tile
              label="Vencido"
              value={formatBRL(data.receivables.overdue)}
              tone={data.receivables.overdue > 0 ? 'warning' : 'positive'}
              hint={`${data.receivables.overdueCount} cobrança(s) em atraso`}
            />
            <Tile
              label="Resultado da sociedade"
              value={formatBRL(Math.round((data.cash.net - data.commission) * 100) / 100)}
              tone="positive"
              hint="líquido menos a comissão gerada"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Cascade data={data} />
            </div>
            <div className="lg:col-span-7">
              <MonthlyChart data={data} />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <OverdueList data={data} />
            <Reconciliation data={data} />
          </div>

          <ResellersTable data={data} />

          <p className="text-xs text-ink-400">
            Regime de caixa pela data do pagamento, fuso de Brasília. Os valores por sócio são{' '}
            <strong className="font-medium">devidos</strong>, não creditados: o repasse segue o prazo
            do meio de pagamento (PIX ~D+1, cartão ~D+30).
            {data.splitSource === 'snapshot' &&
              ' O rateio de cada cobrança é o que foi aplicado nela, não o configurado hoje.'}
          </p>
        </div>
      )}
    </>
  );
}
