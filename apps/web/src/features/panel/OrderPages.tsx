import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCheck,
  Copy,
  Download,
  FileWarning,
  Link as LinkIcon,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  canTransition,
  createOrderSchema,
  formatBRL,
  formatDate,
  formatDateTime,
  formatDocument,
  formatPhone,
  ORDER_STATUS_LABEL,
  type IntakeInput,
  type OrderStatus,
} from '@rating-pro/shared';
import { ScoreGauge } from '@/components/ScoreGauge';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { maskCurrency, parseCurrency } from '@/lib/masks';
import { PageHeader } from './PanelLayout';
import {
  useChangeOrderStatus,
  useClients,
  useCreateOrder,
  useOrder,
  useReportDownload,
  useRotateTrackingToken,
  useUpdateOrderIntake,
} from './hooks';
import { IntakeForm, IntakeSummary } from './IntakeForm';

/**
 * Card do link público de acompanhamento, para o revendedor mandar ao cliente
 * final. O link usa um token dedicado (não o id do pedido), então dá para
 * revogar sem afetar mais nada.
 */
function TrackingLinkCard({ orderId, token }: { orderId: string; token: string }) {
  const rotate = useRotateTrackingToken(orderId);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/acompanhamento/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Contexto sem permissão de clipboard: o input fica selecionável.
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          <LinkIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
            Link de acompanhamento
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Envie ao cliente para ele ver o andamento sem precisar de conta. Não mostra valores nem
            comissão.
          </p>
        </div>
      </div>

      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        aria-label="Link de acompanhamento"
        className="mt-3 w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs text-ink-600 dark:border-ink-800 dark:bg-ink-950/60 dark:text-ink-300"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant={copied ? 'outline' : 'primary'}
          onClick={() => void copy()}
          icon={
            copied ? (
              <CheckCheck className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )
          }
        >
          {copied ? 'Copiado' : 'Copiar'}
        </Button>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Acompanhe seu rating aqui: ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Enviar
        </a>
      </div>

      <button
        type="button"
        onClick={() =>
          rotate.mutate(undefined, {
            onSuccess: () => toast.success('Link novo gerado. O anterior deixou de funcionar.'),
            onError: () => toast.error('Falha ao gerar um link novo'),
          })
        }
        disabled={rotate.isPending}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
      >
        <RefreshCw className={cn('size-3.5', rotate.isPending && 'animate-spin')} aria-hidden />
        Gerar link novo e invalidar o atual
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------- novo pedido

/** Passo enumerado do formulário: dá leitura e ritmo a um form longo. */
function FormSection({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink-100 py-5 first:border-t-0 first:pt-0 dark:border-ink-800">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function NewOrderPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: clients, isLoading } = useClients({ page: 1, pageSize: 100 });
  const createOrder = useCreateOrder();

  const saleAmount = parseCurrency(amount);
  const commissionRate = profile?.commissionRate ?? 0;

  /**
   * Valida com o mesmo `createOrderSchema` que a API usa. Feito por ação (e não
   * pelo resolver do react-hook-form) porque a regra depende do botão clicado:
   * rascunho aceita valor zerado e sem formulário, enviar para análise não.
   */
  const submit = (sendNow: boolean, intake?: IntakeInput) => {
    const parsed = createOrderSchema.safeParse({
      clientId,
      saleAmount,
      resellerNotes: notes,
      ...(intake ? { intake } : {}),
      submit: sendNow,
    });

    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.') || '_root';
        mapped[field] ??= issue.message;
      }
      setErrors(mapped);
      return;
    }

    setErrors({});

    createOrder.mutate(parsed.data, {
      onSuccess: (order) => {
        toast.success(
          sendNow ? `Pedido ${order.code} enviado para análise.` : `Rascunho ${order.code} salvo.`,
        );
        navigate(`/painel/pedidos/${order.id}`);
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Falha ao criar o pedido'),
    });
  };

  const selected = clients?.items.find((client) => client.id === clientId);

  return (
    <>
      <Link
        to="/painel/pedidos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 dark:hover:text-brand-300"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar aos pedidos
      </Link>

      <PageHeader
        title="Novo pedido de rating"
        description="Escolha o cliente, informe o valor cobrado e envie para análise."
      />

      {isLoading && <Skeleton className="h-72" />}

      {clients && clients.items.length === 0 && (
        <Card>
          <EmptyState
            icon={<Users className="size-6" aria-hidden />}
            title="Cadastre um cliente primeiro"
            description="O pedido de rating é sempre vinculado a um cliente da sua carteira."
            action={<ButtonLink to="/painel/clientes">Cadastrar cliente</ButtonLink>}
          />
        </Card>
      )}

      {clients && clients.items.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
          <Card className="lg:col-span-7 xl:col-span-8">
            <FormSection
              step={1}
              title="Quem será avaliado"
              description="Só aparecem clientes da sua carteira."
            >
              <Select
                label="Cliente"
                value={clientId}
                error={errors.clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setErrors((current) => ({ ...current, clientId: '' }));
                }}
              >
                <option value="">Selecione…</option>
                {clients.items.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} — {formatDocument(client.document)}
                  </option>
                ))}
              </Select>

              {selected && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-sm dark:bg-ink-950/50">
                  <Badge>{selected.personType === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}</Badge>
                  <span className="font-mono text-xs text-ink-600 dark:text-ink-300">
                    {formatDocument(selected.document)}
                  </span>
                  {selected.city && (
                    <span className="text-xs text-ink-500">
                      {selected.city}
                      {selected.state ? `/${selected.state}` : ''}
                    </span>
                  )}
                </div>
              )}

              <p className="text-xs text-ink-500">
                Não achou?{' '}
                <Link
                  to="/painel/clientes"
                  className="font-medium text-brand-700 underline dark:text-brand-300"
                >
                  Cadastrar novo cliente
                </Link>
              </p>
            </FormSection>

            <FormSection
              step={2}
              title="Valor cobrado"
              description="Você define o preço; a comissão é calculada sobre ele."
            >
              <Input
                label="Valor cobrado do cliente"
                inputMode="numeric"
                placeholder="0,00"
                error={errors.saleAmount}
                hint={
                  errors.saleAmount
                    ? undefined
                    : 'Pode ficar em branco se for salvar como rascunho.'
                }
                value={amount}
                onChange={(event) => {
                  setAmount(maskCurrency(event.target.value));
                  setErrors((current) => ({ ...current, saleAmount: '' }));
                }}
              />
            </FormSection>

            <FormSection
              step={3}
              title="Contexto para a análise"
              description="Opcional, mas ajuda quem vai avaliar."
            >
              <Textarea
                label="Observações"
                hint="Ex.: setor de atuação, situação atual, o que motivou o pedido."
                error={errors.resellerNotes}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </FormSection>

            <div className="border-t border-ink-100 pt-5 dark:border-ink-800">
              <Button
                variant="outline"
                disabled={createOrder.isPending || !clientId}
                onClick={() => submit(false)}
              >
                Salvar rascunho
              </Button>
              <p className="mt-2 text-xs text-ink-500">
                O rascunho guarda o pedido sem o formulário de análise. Para enviar, preencha o
                formulário abaixo.
              </p>
              {errors.intake && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errors.intake}</p>
              )}
            </div>
          </Card>

          {/* Prévia da comissão: o número que interessa, calculado ao digitar. */}
          <Card className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
              Sua comissão neste pedido
            </h2>

            <p className="mt-2 text-3xl font-semibold tabular-nums text-brand-700 dark:text-brand-300">
              {formatBRL(saleAmount * commissionRate)}
            </p>

            <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm dark:border-ink-800">
              <div className="flex justify-between">
                <dt className="text-ink-500">Valor cobrado</dt>
                <dd className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                  {formatBRL(saleAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Sua taxa</dt>
                <dd className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                  {Math.round(commissionRate * 100)}%
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              O valor é confirmado pelo banco na criação do pedido, a partir da sua taxa vigente.
            </p>
          </Card>

          {/*
            O formulário depende do tipo do cliente, então só aparece depois da
            escolha — e é ele quem envia o pedido para análise.
          */}
          {selected && (
            <div className="lg:col-span-12">
              <IntakeForm
                personType={selected.personType}
                saving={createOrder.isPending}
                submitLabel="Enviar para análise"
                onSubmit={(intake) => submit(true, intake)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ detalhe pedido

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isMaster } = useAuth();
  const { data: order, isLoading, error, refetch } = useOrder(id);
  const changeStatus = useChangeOrderStatus(id ?? '');
  const reportDownload = useReportDownload();

  const updateIntake = useUpdateOrderIntake(id ?? '');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [editingIntake, setEditingIntake] = useState(false);

  const download = () => {
    if (!id) return;

    reportDownload.mutate(id, {
      onSuccess: ({ fileName }) => toast.success(`${fileName} baixado.`),
      onError: (mutationError) =>
        toast.error(
          mutationError instanceof Error ? mutationError.message : 'Falha ao gerar o laudo',
        ),
    });
  };

  const move = (status: OrderStatus, reason?: string) => {
    changeStatus.mutate(
      { status, reason: reason ?? '', internalNotes: '' },
      {
        onSuccess: () => {
          toast.success(`Pedido movido para ${ORDER_STATUS_LABEL[status].toLowerCase()}.`);
          setShowReject(false);
          setRejectReason('');
          void refetch();
        },
        onError: (mutationError) =>
          toast.error(mutationError instanceof Error ? mutationError.message : 'Transição recusada'),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (error) return <ErrorState message={error.message} retry={() => void refetch()} />;
  if (!order) return null;

  /** Ações do revendedor: só o que a máquina de estados aceita dele. */
  const resellerActions: OrderStatus[] = (['submitted', 'cancelled'] as const).filter((status) =>
    canTransition(order.status, status),
  );

  return (
    <>
      <Link
        to="/painel/pedidos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 dark:hover:text-brand-300"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar aos pedidos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-ink-950 dark:text-white">
              {order.code}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Aberto em {formatDateTime(order.createdAt)}
            {order.assignee && ` • em análise por ${order.assignee.fullName}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {order.rating && (
            <Button
              variant="accent"
              loading={reportDownload.isPending}
              onClick={download}
              icon={<Download className="size-4" aria-hidden />}
            >
              Baixar laudo
            </Button>
          )}

          {isMaster && order.status === 'in_analysis' && (
            <ButtonLink to={`/master/emitir/${order.id}`}>Emitir rating</ButtonLink>
          )}

          {isMaster && order.rating && (
            <ButtonLink
              to={`/master/emitir/${order.id}`}
              className="bg-ink-800 hover:bg-ink-900 dark:bg-ink-700"
            >
              Corrigir rating
            </ButtonLink>
          )}
        </div>
      </div>

      {order.status === 'rejected' && order.rejectionReason && (
        <Card className="mb-5 border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex gap-3">
            <FileWarning className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Pedido recusado</p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{order.rejectionReason}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-5">
          {/* ------------------------------------------------------ cliente */}
          <Card>
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Cliente</h2>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-100">{order.client.name}</p>
                <p className="text-sm text-ink-500">{formatDocument(order.client.document)}</p>
                {order.client.city && (
                  <p className="text-sm text-ink-500">
                    {order.client.city}
                    {order.client.state ? `/${order.client.state}` : ''}
                  </p>
                )}
                {order.client.phone && (
                  <p className="text-xs text-ink-400">{formatPhone(order.client.phone)}</p>
                )}
              </div>

              <Badge>{order.client.personType === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}</Badge>
            </div>

            {isMaster && (
              <p className="mt-4 border-t border-ink-200 pt-3 text-sm text-ink-500 dark:border-ink-800">
                Revendedor: <strong className="text-ink-800 dark:text-ink-200">{order.reseller.fullName}</strong>{' '}
                ({order.reseller.email})
              </p>
            )}

            {order.resellerNotes && (
              <div className="mt-4 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/50">
                <p className="text-xs font-semibold text-ink-500 uppercase">
                  Observações do revendedor
                </p>
                <p className="mt-1 text-sm text-ink-700 dark:text-ink-300">{order.resellerNotes}</p>
              </div>
            )}
          </Card>

          {/* --------------------------------------- formulário de análise */}
          {order.intake ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                  Formulário de análise ·{' '}
                  {order.intake.personType === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}
                </h2>
                {(order.status === 'draft' || order.status === 'pending_doc') && (
                  <button
                    type="button"
                    onClick={() => setEditingIntake((open) => !open)}
                    className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {editingIntake ? 'Cancelar edição' : 'Editar'}
                  </button>
                )}
              </div>

              {editingIntake ? (
                <IntakeForm
                  personType={order.intake.personType}
                  initial={order.intake}
                  saving={updateIntake.isPending}
                  onSubmit={(intake) =>
                    updateIntake.mutate(intake, {
                      onSuccess: () => {
                        toast.success('Formulário atualizado.');
                        setEditingIntake(false);
                        void refetch();
                      },
                      onError: (mutationError) =>
                        toast.error(
                          mutationError instanceof Error
                            ? mutationError.message
                            : 'Falha ao salvar o formulário',
                        ),
                    })
                  }
                />
              ) : (
                <IntakeSummary intake={order.intake} />
              )}
            </Card>
          ) : (
            (order.status === 'draft' || order.status === 'pending_doc') && (
              <IntakeForm
                personType={order.client.personType}
                saving={updateIntake.isPending}
                onSubmit={(intake) =>
                  updateIntake.mutate(intake, {
                    onSuccess: () => {
                      toast.success('Formulário salvo. Já pode enviar para análise.');
                      void refetch();
                    },
                    onError: (mutationError) =>
                      toast.error(
                        mutationError instanceof Error
                          ? mutationError.message
                          : 'Falha ao salvar o formulário',
                      ),
                  })
                }
              />
            )
          )}

          {/* ------------------------------------------------------- rating */}
          {order.rating && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                Rating emitido
              </h2>

              <div className="mt-4 grid gap-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-center">
                <ScoreGauge score={order.rating.score} size={240} />

                <div>
                  {order.rating.summary && (
                    <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-300">
                      {order.rating.summary}
                    </p>
                  )}

                  <p className="mt-3 text-xs text-ink-500">
                    Emitido em {formatDate(order.rating.issuedAt)} • válido até{' '}
                    {formatDate(order.rating.validUntil)}
                  </p>

                  {order.rating.factors.length > 0 && (
                    <table className="mt-4 w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs text-ink-500 uppercase">
                          <th scope="col" className="pb-2 font-medium">
                            Fator
                          </th>
                          <th scope="col" className="pb-2 text-right font-medium">
                            Peso
                          </th>
                          <th scope="col" className="pb-2 text-right font-medium">
                            Nota
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.rating.factors.map((factor) => (
                          <tr
                            key={factor.label}
                            className="border-t border-ink-100 dark:border-ink-800"
                          >
                            <td className="py-2 text-ink-700 dark:text-ink-300">{factor.label}</td>
                            <td className="py-2 text-right tabular-nums text-ink-500">
                              {Math.round(factor.weight * 100)}%
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                              {factor.score}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* ----------------------------------------------------- timeline */}
          <Card>
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Histórico</h2>

            <ol className="mt-4 space-y-4">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-100">
                      {event.toStatus
                        ? `${event.fromStatus ? `${ORDER_STATUS_LABEL[event.fromStatus]} → ` : ''}${ORDER_STATUS_LABEL[event.toStatus]}`
                        : event.eventType}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDateTime(event.createdAt)}
                      {event.actor && ` • ${event.actor.fullName}`}
                    </p>
                    {event.note && (
                      <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">{event.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* --------------------------------------------------- lateral */}
        <div className="space-y-5">
          <TrackingLinkCard orderId={order.id} token={order.trackingToken} />

          <Card>
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Valores</h2>

            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Valor da venda</dt>
                <dd className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {formatBRL(order.saleAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Comissão</dt>
                <dd className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                  {formatBRL(order.commissionAmount)}
                </dd>
              </div>
              {order.submittedAt && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Enviado em</dt>
                  <dd className="text-ink-700 dark:text-ink-300">{formatDate(order.submittedAt)}</dd>
                </div>
              )}
              {order.deliveredAt && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Entregue em</dt>
                  <dd className="text-ink-700 dark:text-ink-300">{formatDate(order.deliveredAt)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Ações do revendedor */}
          {!isMaster && resellerActions.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Ações</h2>

              <div className="mt-3 flex flex-col gap-2">
                {resellerActions.includes('submitted') && (
                  <Button
                    loading={changeStatus.isPending}
                    onClick={() => move('submitted')}
                    icon={<Send className="size-4" aria-hidden />}
                  >
                    Enviar para análise
                  </Button>
                )}

                {resellerActions.includes('cancelled') && (
                  <Button
                    variant="outline"
                    disabled={changeStatus.isPending}
                    onClick={() => move('cancelled')}
                  >
                    Cancelar pedido
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Ações do master */}
          {isMaster && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                Ações da operação
              </h2>

              <div className="mt-3 flex flex-col gap-2">
                {canTransition(order.status, 'in_analysis') && (
                  <Button loading={changeStatus.isPending} onClick={() => move('in_analysis')}>
                    Assumir análise
                  </Button>
                )}

                {canTransition(order.status, 'pending_doc') && (
                  <Button
                    variant="outline"
                    disabled={changeStatus.isPending}
                    onClick={() => move('pending_doc')}
                  >
                    Pedir documento
                  </Button>
                )}

                {canTransition(order.status, 'rejected') && !showReject && (
                  <Button variant="danger" onClick={() => setShowReject(true)}>
                    Recusar pedido
                  </Button>
                )}

                {showReject && (
                  <div className="space-y-2 rounded-xl bg-red-50 p-3 dark:bg-red-950/30">
                    <Textarea
                      label="Motivo da recusa"
                      hint="Obrigatório, mínimo de 5 caracteres."
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={changeStatus.isPending}
                        onClick={() => move('rejected', rejectReason)}
                      >
                        Confirmar recusa
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {order.internalNotes && (
                  <div className="mt-2 rounded-xl bg-ink-100 p-3 dark:bg-ink-800">
                    <p className="text-xs font-semibold text-ink-500 uppercase">Nota interna</p>
                    <p className="mt-1 text-sm text-ink-700 dark:text-ink-300">
                      {order.internalNotes}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
