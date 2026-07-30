import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, FileWarning, Search, ShieldCheck, X } from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  ORDER_STATUS_LABEL,
  RISK_LEVEL_LABEL,
  type OrderStatus,
  type TrackingInfo,
} from '@rating-pro/shared';
import { ScoreGauge } from '@/components/ScoreGauge';
import { Card, Skeleton } from '@/components/ui';
import { env } from '@/config/env';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Marcos que o cliente final acompanha, na ordem em que acontecem. */
const STEPS: ReadonlyArray<{ status: OrderStatus; label: string; description: string }> = [
  { status: 'submitted', label: 'Pedido recebido', description: 'Sua solicitação entrou na fila.' },
  { status: 'in_analysis', label: 'Em análise', description: 'A equipe está avaliando os fatores de risco.' },
  { status: 'approved', label: 'Análise concluída', description: 'A classificação foi definida.' },
  { status: 'delivered', label: 'Laudo emitido', description: 'O documento está pronto.' },
];

const TERMINAL_BAD: readonly OrderStatus[] = ['rejected', 'cancelled'];

function StepIcon({ state }: { state: 'done' | 'current' | 'todo' }) {
  if (state === 'done') {
    return (
      <span className="grid size-8 place-items-center rounded-full bg-emerald-600 text-white">
        <Check className="size-4" aria-hidden />
      </span>
    );
  }

  if (state === 'current') {
    return (
      <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950">
        <Clock className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    <span className="grid size-8 place-items-center rounded-full border-2 border-ink-200 bg-white text-ink-300 dark:border-ink-700 dark:bg-ink-900">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
    </span>
  );
}

export function TrackingPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracking', token],
    queryFn: () => api.publicGet<TrackingInfo>(`/acompanhamento/${token}`),
    enabled: Boolean(token),
    retry: false,
    // Recarrega ao voltar para a aba: o cliente costuma deixar aberto esperando.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const brand = data?.brandName ?? env.brandName;

  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <header className="border-b border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2.5 px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-black text-white">
            R
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink-950 dark:text-white">
            {brand}
          </span>
          <span className="ml-auto text-xs font-medium text-ink-500">Acompanhamento</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-64" />
          </div>
        )}

        {error && (
          <Card className="text-center">
            <div className="flex flex-col items-center gap-3 py-10">
              <span className="grid size-12 place-items-center rounded-full bg-ink-100 text-ink-400 dark:bg-ink-800">
                <Search className="size-6" aria-hidden />
              </span>
              <h1 className="text-xl font-semibold text-ink-950 dark:text-white">
                Link não encontrado
              </h1>
              <p className="max-w-sm text-sm text-ink-600 dark:text-ink-300">
                Este link de acompanhamento não existe ou foi substituído. Peça um novo a quem
                enviou.
              </p>
            </div>
          </Card>
        )}

        {data && (
          <div className="space-y-5">
            {/* ------------------------------------------------- cabeçalho */}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold tracking-wide text-ink-500">
                    {data.code}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-950 dark:text-white">
                    {data.clientName}
                  </h1>
                  <p className="mt-1 text-sm text-ink-500">
                    {data.clientPersonType === 'pf' ? 'CPF' : 'CNPJ'}{' '}
                    <span className="font-mono">{data.clientDocumentMasked}</span>
                  </p>
                </div>

                <span
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-semibold',
                    data.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : TERMINAL_BAD.includes(data.status)
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        : 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
                  )}
                >
                  {ORDER_STATUS_LABEL[data.status]}
                </span>
              </div>
            </Card>

            {/* ------------------------------------------------ resultado */}
            {data.rating && (
              <Card>
                <div className="grid gap-6 sm:grid-cols-[260px_minmax(0,1fr)] sm:items-center">
                  <ScoreGauge score={data.rating.score} size={260} />

                  <div>
                    <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                      Classificação emitida
                    </h2>
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                      Nota <strong>{data.rating.grade}</strong> —{' '}
                      {RISK_LEVEL_LABEL[data.rating.risk].toLowerCase()}.
                    </p>

                    {data.rating.summary && (
                      <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-700 dark:bg-ink-950/50 dark:text-ink-300">
                        {data.rating.summary}
                      </p>
                    )}

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-ink-500">Emitido em</dt>
                        <dd className="font-medium text-ink-900 dark:text-ink-100">
                          {formatDate(data.rating.issuedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-500">Válido até</dt>
                        <dd className="font-medium text-ink-900 dark:text-ink-100">
                          {formatDate(data.rating.validUntil)}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-500">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      O laudo completo em PDF, com os fatores detalhados, é entregue por quem
                      contratou a análise.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* ------------------------------------------------- recusado */}
            {data.status === 'rejected' && (
              <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
                <div className="flex gap-3">
                  <FileWarning
                    className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400"
                    aria-hidden
                  />
                  <div>
                    <p className="font-semibold text-red-800 dark:text-red-300">
                      Análise não concluída
                    </p>
                    {data.rejectionReason && (
                      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                        {data.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* -------------------------------------------------- etapas */}
            <Card>
              <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                Etapas do processo
              </h2>

              {TERMINAL_BAD.includes(data.status) ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-ink-50 p-4 dark:bg-ink-950/50">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-300 text-white dark:bg-ink-700">
                    <X className="size-4" aria-hidden />
                  </span>
                  <p className="text-sm text-ink-600 dark:text-ink-300">
                    Este pedido foi {ORDER_STATUS_LABEL[data.status].toLowerCase()} e não segue mais
                    no fluxo.
                  </p>
                </div>
              ) : (
                <ol className="mt-5 space-y-1">
                  {STEPS.map((step, index) => {
                    const reached = data.timeline.find((item) => item.status === step.status);
                    const currentIndex = STEPS.findIndex((s) => s.status === data.status);
                    const state =
                      reached || (currentIndex > index && currentIndex !== -1)
                        ? 'done'
                        : step.status === data.status
                          ? 'current'
                          : 'todo';

                    const isLast = index === STEPS.length - 1;

                    return (
                      <li key={step.status} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <StepIcon state={state} />
                          {!isLast && (
                            <span
                              className={cn(
                                'my-1 w-0.5 flex-1 rounded-full',
                                state === 'done'
                                  ? 'bg-emerald-500'
                                  : 'bg-ink-200 dark:bg-ink-800',
                              )}
                              aria-hidden
                            />
                          )}
                        </div>

                        <div className={cn('pb-5', isLast && 'pb-0')}>
                          <p
                            className={cn(
                              'text-sm font-medium',
                              state === 'todo'
                                ? 'text-ink-400'
                                : 'text-ink-900 dark:text-ink-100',
                            )}
                          >
                            {step.label}
                          </p>
                          <p className="text-sm text-ink-500">{step.description}</p>
                          {reached && (
                            <p className="mt-0.5 text-xs text-ink-400">
                              {formatDateTime(reached.at)}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="mt-5 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500 dark:border-ink-800">
                Prazo de referência de até 30 dias a partir do envio com a documentação completa.
                Esta página atualiza sozinha — basta recarregar.
              </p>
            </Card>

            <p className="text-center text-xs leading-relaxed text-ink-500">
              O laudo de rating é um documento informativo que classifica o perfil de risco com base
              nos dados disponíveis na data da emissão. Não constitui garantia de concessão de
              crédito.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
