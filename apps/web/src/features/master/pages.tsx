import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Mail, MessageSquare, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  clampScore,
  DEFAULT_FACTORS,
  FACTOR_WEIGHT_TOLERANCE,
  formatBRL,
  formatDate,
  formatDateTime,
  formatDocument,
  formatPhone,
  issueRatingSchema,
  LEAD_STATUS_LABEL,
  LEAD_STATUSES,
  ORDER_STATUS_LABEL,
  PROFILE_STATUS_LABEL,
  PROFILE_STATUSES,
  scoreFromFactors,
  type LeadStatus,
  type OrderStatus,
  type ProfileStatus,
  type RatingFactor,
} from '@rating-pro/shared';
import { ScoreGauge } from '@/components/ScoreGauge';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/features/panel/PanelLayout';
import { Pagination } from '@/features/panel/pages';
import {
  useAdminUpdateProfile,
  useIssueRating,
  useLeads,
  useOrder,
  useOrders,
  useProfiles,
  useUpdateLead,
} from '@/features/panel/hooks';

const PAGE_SIZE = 10;

// ------------------------------------------------------------ fila de análise

const QUEUE_TABS: ReadonlyArray<{ status: OrderStatus | ''; label: string }> = [
  { status: 'submitted', label: 'Novos' },
  { status: 'in_analysis', label: 'Em análise' },
  { status: 'pending_doc', label: 'Pendência' },
  { status: 'delivered', label: 'Entregues' },
  { status: '', label: 'Todos' },
];

export function QueuePage() {
  const [status, setStatus] = useState<OrderStatus | ''>('submitted');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useOrders({ status, page, pageSize: PAGE_SIZE });

  return (
    <>
      <PageHeader
        title="Fila de análise"
        description="Pedidos aguardando ação da operação, do mais antigo ao mais recente."
      />

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por situação">
        {QUEUE_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => {
              setStatus(tab.status);
              setPage(1);
            }}
            className={cn(
              'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
              status === tab.status
                ? 'bg-brand-600 text-white'
                : 'bg-white text-ink-600 hover:bg-ink-100 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            title="Fila vazia"
            description="Nenhum pedido nesta situação no momento."
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map((order) => (
              <Card key={order.id} className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/painel/pedidos/${order.id}`}
                      className="font-mono text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    >
                      {order.code}
                    </Link>
                    <StatusBadge status={order.status} />
                    {order.rating && <Badge>Score {order.rating.score}</Badge>}
                  </div>

                  <p className="mt-1.5 truncate font-medium text-ink-900 dark:text-ink-100">
                    {order.client.name}
                  </p>
                  <p className="text-sm text-ink-500">
                    {formatDocument(order.client.document)} • {order.reseller.fullName}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {order.submittedAt
                      ? `Enviado em ${formatDateTime(order.submittedAt)}`
                      : `Criado em ${formatDateTime(order.createdAt)}`}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <p className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                    {formatBRL(order.saleAmount)}
                  </p>

                  {order.status === 'in_analysis' ? (
                    <Link
                      to={`/master/emitir/${order.id}`}
                      className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Emitir rating
                    </Link>
                  ) : (
                    <Link
                      to={`/painel/pedidos/${order.id}`}
                      className="rounded-xl border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 hover:border-brand-400 dark:border-ink-700 dark:text-ink-200"
                    >
                      Abrir
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}

// --------------------------------------------------------- emissão de rating

export function IssueRatingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, error, refetch } = useOrder(id);
  const issueRating = useIssueRating(id ?? '');

  const [factors, setFactors] = useState<RatingFactor[]>(() =>
    DEFAULT_FACTORS.map((factor) => ({ ...factor, score: 700 })),
  );
  const [manualScore, setManualScore] = useState<number | null>(null);
  const [summary, setSummary] = useState('');
  const [validityMonths, setValidityMonths] = useState(12);
  const [initialized, setInitialized] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const computedScore = scoreFromFactors(factors) ?? 0;
  const finalScore = manualScore ?? computedScore;

  // Os pesos são a ponderação impressa no laudo: se não fecharem 100%, a nota
  // por fator fica incoerente com o total que o cliente lê no documento.
  const weightTotal = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const weightsOk = Math.abs(weightTotal - 1) <= FACTOR_WEIGHT_TOLERANCE;

  // Ao corrigir um rating existente, parte dos valores já emitidos.
  useMemo(() => {
    if (!initialized && order?.rating) {
      if (order.rating.factors.length > 0) setFactors(order.rating.factors);
      setSummary(order.rating.summary ?? '');
      setManualScore(order.rating.score);
      setInitialized(true);
    }
  }, [initialized, order]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (error) return <ErrorState message={error.message} retry={() => void refetch()} />;
  if (!order) return null;

  const isCorrection = Boolean(order.rating);

  if (!isCorrection && order.status !== 'in_analysis') {
    return (
      <Card>
        <EmptyState
          title="Pedido não está em análise"
          description={`Para emitir o rating, o pedido precisa estar em "Em análise". Situação atual: ${ORDER_STATUS_LABEL[order.status]}.`}
          action={
            <Link
              to={`/painel/pedidos/${order.id}`}
              className="text-sm font-semibold text-brand-700 dark:text-brand-300"
            >
              Abrir o pedido
            </Link>
          }
        />
      </Card>
    );
  }

  const updateFactor = (index: number, patch: Partial<RatingFactor>) => {
    setFactors((current) =>
      current.map((factor, position) =>
        position === index
          ? {
              ...factor,
              ...patch,
              ...(patch.score !== undefined ? { score: clampScore(patch.score) } : {}),
            }
          : factor,
      ),
    );

    // Mexer na nota volta a valer mais que o override manual do score.
    if (patch.score !== undefined) setManualScore(null);
  };

  /** Redistribui os pesos igualmente — atalho para voltar a fechar 100%. */
  const balanceWeights = () => {
    if (factors.length === 0) return;
    const share = Math.round((100 / factors.length)) / 100;
    setFactors((current) =>
      current.map((factor, index) =>
        // A sobra de arredondamento vai toda para o primeiro fator.
        index === 0
          ? { ...factor, weight: Number((1 - share * (current.length - 1)).toFixed(4)) }
          : { ...factor, weight: share },
      ),
    );
  };

  const submit = () => {
    const parsed = issueRatingSchema.safeParse({
      score: finalScore,
      summary,
      factors,
      validityMonths,
    });

    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] ? String(issue.path[0]) : '_root';
        mapped[field] ??= issue.message;
      }
      setErrors(mapped);
      toast.error(Object.values(mapped)[0] ?? 'Revise os campos');
      return;
    }

    setErrors({});

    issueRating.mutate(
      { input: parsed.data, isCorrection },
      {
        onSuccess: () => {
          toast.success(
            isCorrection ? 'Rating corrigido e laudo regerado.' : 'Rating emitido e laudo gerado.',
          );
          navigate(`/painel/pedidos/${order.id}`);
        },
        onError: (mutationError) =>
          toast.error(
            mutationError instanceof Error ? mutationError.message : 'Falha ao emitir o rating',
          ),
      },
    );
  };

  return (
    <>
      <Link
        to={`/painel/pedidos/${order.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 dark:hover:text-brand-300"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao pedido
      </Link>

      <PageHeader
        title={isCorrection ? 'Corrigir rating' : 'Emitir rating'}
        description={`${order.code} • ${order.client.name} (${formatDocument(order.client.document)})`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                Fatores da avaliação
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                O score é a média ponderada dos fatores. Você pode sobrescrever manualmente.
              </p>
            </div>

            {/* Somatório dos pesos sempre visível: o erro fica óbvio antes de enviar. */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                  weightsOk
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                )}
              >
                {weightsOk ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <AlertTriangle className="size-3.5" aria-hidden />
                )}
                Pesos: {Math.round(weightTotal * 100)}%
              </span>

              {!weightsOk && (
                <button
                  type="button"
                  onClick={balanceWeights}
                  className="text-xs font-medium text-brand-700 underline dark:text-brand-300"
                >
                  Equilibrar
                </button>
              )}
            </div>
          </div>

          {errors.factors && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errors.factors}
            </p>
          )}

          <div className="mt-5 space-y-5">
            {factors.map((factor, index) => (
              <div key={factor.label}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <label
                    htmlFor={`factor-${index}`}
                    className="text-sm font-medium text-ink-700 dark:text-ink-200"
                  >
                    {factor.label}
                  </label>

                  <div className="flex items-center gap-3">
                    {/* Peso editável: dá ao master controle sobre a ponderação. */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(factor.weight * 100)}
                        onChange={(event) =>
                          updateFactor(index, {
                            weight: Math.min(100, Math.max(0, Number(event.target.value))) / 100,
                          })
                        }
                        aria-label={`Peso de ${factor.label} em porcentagem`}
                        className="w-16 rounded-lg border border-ink-300 px-2 py-1 text-right text-xs tabular-nums dark:border-ink-700 dark:bg-ink-900"
                      />
                      <span className="text-xs text-ink-500">%</span>
                    </div>

                    <span className="w-10 text-right text-sm font-bold tabular-nums text-ink-900 dark:text-ink-100">
                      {factor.score}
                    </span>
                  </div>
                </div>

                <input
                  id={`factor-${index}`}
                  type="range"
                  min={0}
                  max={1000}
                  step={1}
                  value={factor.score}
                  onChange={(event) => updateFactor(index, { score: Number(event.target.value) })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-200 dark:bg-ink-800 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 border-t border-ink-200 pt-5 sm:grid-cols-2 dark:border-ink-800">
            <Input
              label="Score final"
              type="number"
              min={0}
              max={1000}
              error={errors.score}
              hint={
                errors.score
                  ? undefined
                  : manualScore === null
                    ? `Calculado a partir dos fatores: ${computedScore}`
                    : `Sobrescrito manualmente (cálculo: ${computedScore})`
              }
              value={finalScore}
              onChange={(event) => setManualScore(clampScore(Number(event.target.value)))}
            />

            <Select
              label="Validade do laudo"
              value={validityMonths}
              onChange={(event) => setValidityMonths(Number(event.target.value))}
            >
              {[6, 12, 18, 24, 36].map((months) => (
                <option key={months} value={months}>
                  {months} meses
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-4">
            <Textarea
              label="Parecer"
              error={errors.summary}
              hint={
                errors.summary
                  ? undefined
                  : `Vai impresso no laudo. Opcional, mas se preencher use pelo menos 20 caracteres (${summary.trim().length}).`
              }
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
              Prévia do laudo
            </h2>
            <ScoreGauge score={finalScore} size={260} />
          </Card>

          <Card>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Valor da venda</dt>
                <dd className="font-semibold tabular-nums">{formatBRL(order.saleAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Revendedor</dt>
                <dd className="text-right font-medium">{order.reseller.fullName}</dd>
              </div>
            </dl>

            <Button
              className="mt-5 w-full"
              size="lg"
              loading={issueRating.isPending}
              disabled={!weightsOk}
              onClick={submit}
              icon={<Send className="size-4" aria-hidden />}
            >
              {isCorrection ? 'Regerar laudo' : 'Emitir e entregar'}
            </Button>

            <p className="mt-3 text-xs text-ink-500">
              {weightsOk
                ? 'Ao emitir, o pedido passa direto para entregue e o laudo fica disponível para download.'
                : 'Ajuste os pesos para fechar 100% antes de emitir.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------- revendedores

export function ResellersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProfileStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useProfiles({
    search,
    status,
    page,
    pageSize: PAGE_SIZE,
  });
  const updateProfile = useAdminUpdateProfile();

  const apply = (id: string, input: Parameters<typeof updateProfile.mutate>[0]['input']) => {
    updateProfile.mutate(
      { id, input },
      {
        onSuccess: () => toast.success('Revendedor atualizado.'),
        onError: (mutationError) =>
          toast.error(mutationError instanceof Error ? mutationError.message : 'Falha ao atualizar'),
      },
    );
  };

  return (
    <>
      <PageHeader title="Revendedores" description="Ative, suspenda e ajuste a comissão." />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Input
            label="Buscar"
            placeholder="Nome, e-mail ou empresa"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />

          <Select
            label="Situação"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProfileStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {PROFILE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {PROFILE_STATUS_LABEL[item]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={<Search className="size-6" aria-hidden />}
            title="Nenhum revendedor encontrado"
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map((reseller) => (
              <Card key={reseller.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900 dark:text-ink-100">
                        {reseller.fullName}
                      </p>
                      <Badge
                        className={
                          reseller.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : reseller.status === 'suspended'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : undefined
                        }
                      >
                        {PROFILE_STATUS_LABEL[reseller.status]}
                      </Badge>
                    </div>

                    <p className="text-sm break-all text-ink-500">{reseller.email}</p>
                    {reseller.companyName && (
                      <p className="text-sm text-ink-500">{reseller.companyName}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-400">
                      {reseller._count?.orders ?? 0} pedido(s) • {reseller._count?.clients ?? 0}{' '}
                      cliente(s) • desde {formatDate(reseller.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <label className="text-xs text-ink-500" htmlFor={`rate-${reseller.id}`}>
                      Comissão
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`rate-${reseller.id}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        defaultValue={Math.round(reseller.commissionRate * 100)}
                        onBlur={(event) => {
                          const next = Number(event.target.value) / 100;
                          if (next !== reseller.commissionRate) {
                            apply(reseller.id, { commissionRate: next });
                          }
                        }}
                        className="w-20 rounded-lg border border-ink-300 px-2 py-1.5 text-right text-sm dark:border-ink-700 dark:bg-ink-900"
                      />
                      <span className="text-sm text-ink-500">%</span>
                    </div>

                    <div className="mt-1 flex gap-2">
                      {reseller.status !== 'active' && (
                        <Button
                          size="sm"
                          disabled={updateProfile.isPending}
                          onClick={() => apply(reseller.id, { status: 'active' })}
                        >
                          Ativar
                        </Button>
                      )}
                      {reseller.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateProfile.isPending}
                          onClick={() => apply(reseller.id, { status: 'suspended' })}
                        >
                          Suspender
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------------- leads

export function LeadsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useLeads({ search, status, page, pageSize: PAGE_SIZE });
  const updateLead = useUpdateLead();

  return (
    <>
      <PageHeader title="Leads da landing" description="Contatos recebidos pelo site." />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Input
            label="Buscar"
            placeholder="Nome, e-mail, empresa ou telefone"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />

          <Select
            label="Situação"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as LeadStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {LEAD_STATUSES.map((item) => (
              <option key={item} value={item}>
                {LEAD_STATUS_LABEL[item]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={<MessageSquare className="size-6" aria-hidden />}
            title="Nenhum lead ainda"
            description="Os contatos enviados pelo formulário da landing aparecem aqui."
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map((lead) => (
              <Card key={lead.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900 dark:text-ink-100">{lead.name}</p>
                      <Badge>{lead.source}</Badge>
                    </div>

                    <p className="text-sm break-all text-ink-500">{lead.email}</p>
                    <p className="text-sm text-ink-500">{formatPhone(lead.phone)}</p>
                    {lead.company && <p className="text-sm text-ink-500">{lead.company}</p>}
                    {lead.message && (
                      <p className="mt-2 rounded-xl bg-ink-50 p-2.5 text-sm text-ink-700 dark:bg-ink-950/50 dark:text-ink-300">
                        {lead.message}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-ink-400">{formatDateTime(lead.createdAt)}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Select
                      label="Situação"
                      value={lead.status}
                      onChange={(event) =>
                        updateLead.mutate(
                          { id: lead.id, status: event.target.value as LeadStatus },
                          {
                            onSuccess: () => toast.success('Lead atualizado.'),
                            onError: () => toast.error('Falha ao atualizar o lead'),
                          },
                        )
                      }
                    >
                      {LEAD_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {LEAD_STATUS_LABEL[item]}
                        </option>
                      ))}
                    </Select>

                    <div className="flex gap-2">
                      <a
                        href={`https://wa.me/55${lead.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid size-9 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                        aria-label={`Chamar ${lead.name} no WhatsApp`}
                      >
                        <MessageSquare className="size-4" aria-hidden />
                      </a>

                      <a
                        href={`mailto:${lead.email}`}
                        className="grid size-9 place-items-center rounded-lg border border-ink-300 text-ink-600 hover:border-brand-400 dark:border-ink-700 dark:text-ink-300"
                        aria-label={`Enviar e-mail para ${lead.name}`}
                      >
                        <Mail className="size-4" aria-hidden />
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}
