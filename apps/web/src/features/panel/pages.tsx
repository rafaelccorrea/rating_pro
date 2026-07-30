import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Gauge,
  Plus,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  BR_STATES,
  createClientSchema,
  formatBRL,
  formatDate,
  formatDocument,
  formatPhone,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  updateProfileSchema,
  type OrderStatus,
} from '@rating-pro/shared';
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
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { maskDocument, maskPhone } from '@/lib/masks';
import { PageHeader } from './PanelLayout';
import { useClients, useCreateClient, useOrders, useStats, useUpdateMe } from './hooks';

const PAGE_SIZE = 10;

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'brand' | 'positive' | 'warning';
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
    positive: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  } as const;

  return (
    <Card className="flex items-start gap-3.5 p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink-950 dark:text-white">
          {value}
        </p>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
    </Card>
  );
}

/** Lista compacta dos últimos pedidos: ocupa o espaço com algo acionável. */
function RecentOrders({ isMaster }: { isMaster: boolean }) {
  const { data, isLoading } = useOrders({ page: 1, pageSize: 6 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="Nenhum pedido ainda"
        description={
          isMaster
            ? 'Assim que os revendedores enviarem pedidos, eles aparecem aqui.'
            : 'Abra seu primeiro pedido de rating para começar.'
        }
        action={
          !isMaster && (
            <ButtonLink to="/painel/pedidos/novo" icon={<Plus className="size-4" aria-hidden />}>
              Criar pedido
            </ButtonLink>
          )
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
      {data.items.map((order) => (
        <li key={order.id}>
          <Link
            to={`/painel/pedidos/${order.id}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-ink-500">{order.code}</span>
                <StatusBadge status={order.status} />
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                {order.client.name}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                {formatBRL(order.saleAmount)}
              </p>
              <p className="text-xs text-ink-400">{formatDate(order.createdAt)}</p>
            </div>

            <ChevronRight className="size-4 shrink-0 text-ink-300" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- dashboard

export function DashboardPage() {
  const { profile, isMaster } = useAuth();
  const { data, isLoading, error, refetch } = useStats();

  const chartData = data
    ? [
        { label: 'Pendentes', value: data.pendingOrders, color: 'var(--color-accent-500)' },
        { label: 'Entregues', value: data.deliveredOrders, color: 'var(--color-risk-minimo)' },
        { label: 'Recusados', value: data.rejectedOrders, color: 'var(--color-risk-critico)' },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={`Olá, ${profile?.fullName.split(' ')[0] ?? ''}`}
        description={
          isMaster
            ? 'Visão consolidada de toda a operação.'
            : 'Acompanhe seus pedidos e suas comissões.'
        }
        action={
          !isMaster && (
            <ButtonLink to="/painel/pedidos/novo" icon={<Plus className="size-4" aria-hidden />}>
              Novo pedido
            </ButtonLink>
          )
        }
      />

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Linha de indicadores */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Pedidos"
              value={String(data.totalOrders)}
              icon={ClipboardList}
              tone="brand"
            />
            <StatTile
              label="Em andamento"
              value={String(data.pendingOrders)}
              icon={Clock}
              tone="warning"
            />
            <StatTile
              label="Entregues"
              value={String(data.deliveredOrders)}
              icon={CheckCircle2}
              tone="positive"
            />
            <StatTile
              label="Score médio"
              value={data.avgScore === null ? '—' : String(data.avgScore)}
              hint="dos laudos emitidos"
              icon={Gauge}
            />
          </div>

          {/* Gráfico + resumo financeiro dividindo a mesma faixa */}
          <div className="grid gap-5 lg:grid-cols-12">
            {/*
              flex-col + flex-1 no gráfico: o card estica para acompanhar a
              coluna da direita, e sem isso sobrava um vão branco embaixo do
              gráfico em vez de o gráfico crescer.
            */}
            <Card className="flex flex-col lg:col-span-7 xl:col-span-8">
              <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                Pedidos por situação
              </h2>

              {data.totalOrders === 0 ? (
                <div className="grid min-h-56 flex-1 place-items-center">
                  <p className="text-sm text-ink-500">Sem dados para exibir ainda.</p>
                </div>
              ) : (
                <div className="mt-4 min-h-56 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="currentColor"
                        className="text-ink-200 dark:text-ink-800"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        stroke="currentColor"
                        className="text-ink-400"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        stroke="currentColor"
                        className="text-ink-400"
                        width={32}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, fontSize: 12 }}
                        formatter={(value) => [String(value), 'Pedidos']}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell key={entry.label} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <div className="space-y-5 lg:col-span-5 xl:col-span-4">
              <Card className="bg-gradient-to-br from-brand-600 to-brand-800 text-white">
                <p className="text-xs font-semibold tracking-wide text-brand-200 uppercase">
                  {isMaster ? 'Comissões a repassar' : 'Sua comissão acumulada'}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatBRL(data.totalCommission)}
                </p>

                <div className="mt-4 flex items-baseline justify-between border-t border-white/15 pt-4">
                  <span className="text-xs text-brand-200">
                    {isMaster ? 'Faturamento entregue' : 'Vendas entregues'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatBRL(data.totalSales)}
                  </span>
                </div>
              </Card>

              {isMaster ? (
                <Card className="p-4">
                  <h2 className="mb-3 text-sm font-semibold text-ink-800 dark:text-ink-100">
                    Operação
                  </h2>
                  <dl className="space-y-2.5 text-sm">
                    {[
                      { label: 'Revendedores', value: data.totalResellers ?? 0 },
                      { label: 'Ativos', value: data.activeResellers ?? 0 },
                      { label: 'Leads novos', value: data.newLeads ?? 0 },
                    ].map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between">
                        <dt className="text-ink-500">{row.label}</dt>
                        <dd className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <ButtonLink to="/master" className="mt-4 h-10 w-full text-sm">
                    Abrir fila de análise
                  </ButtonLink>
                </Card>
              ) : (
                <Card className="p-4">
                  <h2 className="mb-1 text-sm font-semibold text-ink-800 dark:text-ink-100">
                    Vender mais
                  </h2>
                  <p className="mb-4 text-sm text-ink-500">
                    Cadastre o cliente e abra o pedido em menos de um minuto.
                  </p>

                  <div className="flex flex-col gap-2">
                    <ButtonLink
                      to="/painel/pedidos/novo"
                      className="h-10 w-full text-sm"
                      icon={<Plus className="size-4" aria-hidden />}
                    >
                      Novo pedido
                    </ButtonLink>
                    <Link
                      to="/painel/clientes"
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-ink-300 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 dark:border-ink-700 dark:text-ink-200"
                    >
                      Cadastrar cliente
                    </Link>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* Últimos pedidos: preenche o restante com algo acionável */}
          <Card>
            <div className="mb-1 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                Últimos pedidos
              </h2>
              <Link
                to="/painel/pedidos"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                Ver todos
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            <RecentOrders isMaster={isMaster} />
          </Card>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------- pedidos

export function OrdersPage() {
  const { isMaster } = useAuth();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useOrders({
    status,
    search,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={isMaster ? 'Todos os pedidos da operação.' : 'Seus pedidos de rating.'}
        action={
          !isMaster && (
            <ButtonLink to="/painel/pedidos/novo" icon={<Plus className="size-4" aria-hidden />}>
              Novo pedido
            </ButtonLink>
          )
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Input
            label="Buscar"
            placeholder="Código, nome ou documento do cliente"
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
              setStatus(event.target.value as OrderStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {ORDER_STATUSES.map((item) => (
              <option key={item} value={item}>
                {ORDER_STATUS_LABEL[item]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

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
            icon={<Search className="size-6" aria-hidden />}
            title="Nenhum pedido encontrado"
            description="Ajuste a busca ou o filtro de situação."
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map((order) => (
              <Link
                key={order.id}
                to={`/painel/pedidos/${order.id}`}
                className="block rounded-card border border-ink-200 bg-white p-4 transition-colors hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900/60 dark:hover:border-brand-500"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink-950 dark:text-white">
                        {order.code}
                      </span>
                      <StatusBadge status={order.status} />
                      {order.rating && (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Score {order.rating.score}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1.5 truncate font-medium text-ink-900 dark:text-ink-100">
                      {order.client.name}
                    </p>
                    <p className="text-sm text-ink-500">
                      {formatDocument(order.client.document)}
                      {isMaster && ` • ${order.reseller.fullName}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                      {formatBRL(order.saleAmount)}
                    </p>
                    <p className="text-xs text-ink-500">
                      comissão {formatBRL(order.commissionAmount)}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">{formatDate(order.createdAt)}</p>
                  </div>
                </div>
              </Link>
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

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="mt-4 text-center text-xs text-ink-500">{total} registro(s)</p>;
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>

      <p className="text-sm text-ink-500">
        Página {page} de {totalPages} • {total} registro(s)
      </p>

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ clientes

type ClientFormValues = z.infer<typeof createClientSchema>;

export function ClientsPage() {
  const { isMaster } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error, refetch } = useClients({ search, page, pageSize: PAGE_SIZE });
  const createClient = useCreateClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      personType: 'pj',
      document: '',
      name: '',
      email: '',
      phone: '',
      birthDate: '',
      city: '',
      state: '',
    },
  });

  const personType = watch('personType');

  const onSubmit = (values: ClientFormValues) => {
    createClient.mutate(values, {
      onSuccess: () => {
        toast.success('Cliente cadastrado.');
        reset();
        setShowForm(false);
      },
      onError: (mutationError) =>
        toast.error(mutationError instanceof Error ? mutationError.message : 'Falha ao cadastrar'),
    });
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={isMaster ? 'Todos os clientes cadastrados.' : 'Sua carteira de clientes.'}
        action={
          !isMaster && (
            <Button
              onClick={() => setShowForm((open) => !open)}
              icon={<Plus className="size-4" aria-hidden />}
            >
              {showForm ? 'Fechar' : 'Novo cliente'}
            </Button>
          )
        }
      />

      {showForm && (
        <Card className="mb-5">
          <h2 className="font-semibold text-ink-900 dark:text-ink-100">Cadastrar cliente</h2>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Tipo" error={errors.personType?.message} {...register('personType')}>
                <option value="pj">Pessoa jurídica (CNPJ)</option>
                <option value="pf">Pessoa física (CPF)</option>
              </Select>

              <Input
                label={personType === 'pf' ? 'CPF' : 'CNPJ'}
                inputMode="numeric"
                error={errors.document?.message}
                {...register('document', {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    event.target.value = maskDocument(event.target.value);
                  },
                })}
              />
            </div>

            <Input
              label={personType === 'pf' ? 'Nome completo' : 'Razão social'}
              error={errors.name?.message}
              {...register('name')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="E-mail"
                type="email"
                hint="Opcional"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Telefone"
                hint="Opcional"
                inputMode="numeric"
                error={errors.phone?.message}
                {...register('phone', {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    event.target.value = maskPhone(event.target.value);
                  },
                })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label={personType === 'pf' ? 'Nascimento' : 'Fundação'}
                type="date"
                hint="Opcional"
                error={errors.birthDate?.message}
                {...register('birthDate')}
              />

              <Input label="Cidade" hint="Opcional" error={errors.city?.message} {...register('city')} />

              <Select label="UF" error={errors.state?.message} {...register('state')}>
                <option value="">—</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" loading={createClient.isPending}>
              Cadastrar cliente
            </Button>
          </form>
        </Card>
      )}

      <Card className="mb-4">
        <Input
          label="Buscar"
          placeholder="Nome, documento ou e-mail"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </Card>

      {error && <ErrorState message={error.message} retry={() => void refetch()} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={<Users className="size-6" aria-hidden />}
            title="Nenhum cliente"
            description="Cadastre um cliente para poder abrir pedidos de rating."
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map((client) => (
              <Card key={client.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900 dark:text-ink-100">
                    {client.name}
                  </p>
                  <p className="text-sm text-ink-500">
                    {formatDocument(client.document)}
                    {client.city && ` • ${client.city}${client.state ? `/${client.state}` : ''}`}
                  </p>
                  {client.phone && (
                    <p className="text-xs text-ink-400">{formatPhone(client.phone)}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Badge>{client.personType === 'pf' ? 'PF' : 'PJ'}</Badge>
                  <span className="text-xs text-ink-500">
                    {client._count?.orders ?? 0} pedido(s)
                  </span>
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

// -------------------------------------------------------------------- perfil

type ProfileFormValues = z.infer<typeof updateProfileSchema>;

export function ProfilePage() {
  const { profile } = useAuth();
  const updateMe = useUpdateMe();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile?.fullName ?? '',
      phone: profile?.phone ?? '',
      document: profile?.document ?? '',
      companyName: profile?.companyName ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
    },
  });

  const onSubmit = (values: ProfileFormValues) => {
    updateMe.mutate(values, {
      onSuccess: () => toast.success('Dados atualizados.'),
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Falha ao salvar'),
    });
  };

  return (
    <>
      <PageHeader title="Meu perfil" description="Seus dados cadastrais e condição comercial." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Input label="Nome completo" error={errors.fullName?.message} {...register('fullName')} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="WhatsApp"
                inputMode="numeric"
                error={errors.phone?.message}
                {...register('phone', {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    event.target.value = maskPhone(event.target.value);
                  },
                })}
              />

              <Input
                label="CPF ou CNPJ"
                inputMode="numeric"
                error={errors.document?.message}
                {...register('document', {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    event.target.value = maskDocument(event.target.value);
                  },
                })}
              />
            </div>

            <Input label="Empresa" error={errors.companyName?.message} {...register('companyName')} />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Input label="Cidade" error={errors.city?.message} {...register('city')} />

              <Select label="UF" error={errors.state?.message} {...register('state')}>
                <option value="">—</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" loading={updateMe.isPending} disabled={!isDirty}>
              Salvar alterações
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Sua conta</h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-ink-500">E-mail</dt>
              <dd className="font-medium break-all text-ink-900 dark:text-ink-100">
                {profile?.email}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Papel</dt>
              <dd className="font-medium text-ink-900 dark:text-ink-100">
                {profile?.role === 'master' ? 'Master' : 'Revendedor'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Sua comissão</dt>
              <dd className="text-lg font-bold text-brand-700 dark:text-brand-300">
                {Math.round((profile?.commissionRate ?? 0) * 100)}%
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Cliente desde</dt>
              <dd className="font-medium text-ink-900 dark:text-ink-100">
                {formatDate(profile?.createdAt)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 flex gap-2 border-t border-ink-200 pt-4 text-xs text-ink-500 dark:border-ink-800">
            <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Para alterar sua comissão, fale com a equipe da operação.
          </p>
        </Card>
      </div>
    </>
  );
}
