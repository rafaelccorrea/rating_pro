import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUpdateProfileInput,
  ChangeOrderStatusInput,
  CreateClientInput,
  CreateOrderInput,
  DashboardStats,
  IntakeInput,
  IssueRatingInput,
  LeadStatus,
  OrderStatus,
  Paginated,
  PartnersOverview,
  UpdateProfileInput,
} from '@rating-pro/shared';
import { api, apiFetchBlob } from '@/lib/api';
import type {
  ClientRow,
  LeadRow,
  OrderDetailRow,
  OrderEventRow,
  OrderRow,
  ProfileRow,
} from './types';

/** Chaves centralizadas para a invalidação não depender de string solta. */
export const queryKeys = {
  stats: ['dashboard', 'stats'] as const,
  orders: (filters?: unknown) => ['orders', filters ?? {}] as const,
  order: (id: string) => ['orders', id] as const,
  orderEvents: (id: string) => ['orders', id, 'events'] as const,
  clients: (filters?: unknown) => ['clients', filters ?? {}] as const,
  profiles: (filters?: unknown) => ['profiles', filters ?? {}] as const,
  leads: (filters?: unknown) => ['leads', filters ?? {}] as const,
  partners: (filters?: unknown) => ['partners', 'overview', filters ?? {}] as const,
};

// --- Dashboard --------------------------------------------------------------

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.get<DashboardStats>('/dashboard/stats'),
  });
}

// --- Sócios -----------------------------------------------------------------

export interface PartnersFilters {
  from?: string;
  to?: string;
  months: number;
}

/**
 * Painel de prestação de contas. `staleTime` alto de propósito: é tela de
 * leitura, e o número não muda de minuto a minuto.
 */
export function usePartners(filters: PartnersFilters) {
  return useQuery({
    queryKey: queryKeys.partners(filters),
    queryFn: () =>
      api.get<PartnersOverview>('/partners/overview', {
        from: filters.from || undefined,
        to: filters.to || undefined,
        months: filters.months,
      }),
    staleTime: 5 * 60_000,
  });
}

/** Baixa o extrato do período em CSV, passando pelo header de autorização. */
export function usePartnersCsv() {
  return useMutation({
    mutationFn: async (filters: PartnersFilters) => {
      const params = new URLSearchParams({ months: String(filters.months) });
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const { blob } = await apiFetchBlob(`/partners/ledger.csv?${params.toString()}`);
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `extrato-socios-${filters.from ?? 'inicio'}-a-${filters.to ?? 'hoje'}.csv`;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}

// --- Pedidos ----------------------------------------------------------------

export interface OrderFilters {
  status?: OrderStatus | '';
  search?: string;
  page: number;
  pageSize: number;
}

export function useOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: queryKeys.orders(filters),
    queryFn: () =>
      api.get<Paginated<OrderRow>>('/orders', {
        status: filters.status || undefined,
        search: filters.search || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.order(id ?? 'novo'),
    queryFn: () => api.get<OrderDetailRow>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useOrderEvents(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderEvents(id ?? 'novo'),
    queryFn: () => api.get<OrderEventRow[]>(`/orders/${id}/events`),
    enabled: Boolean(id),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => api.post<OrderRow>('/orders', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useChangeOrderStatus(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChangeOrderStatusInput) =>
      api.post<OrderRow>(`/orders/${orderId}/status`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

/**
 * O laudo vem como PDF binário da própria API. Baixamos como blob e disparamos
 * o download via object URL, porque a rota exige o header Authorization e um
 * `window.open` simples não o carrega.
 */
/** Salva o formulário de coleta PF ou PJ de um pedido já criado. */
export function useUpdateOrderIntake(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (intake: IntakeInput) =>
      api.patch<OrderRow>(`/orders/${orderId}/intake`, { intake }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

/** Gera um token novo, invalidando o link de acompanhamento já compartilhado. */
export function useRotateTrackingToken(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ trackingToken: string }>(`/orders/${orderId}/tracking/rotate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useReportDownload() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { blob, fileName } = await apiFetchBlob(`/orders/${orderId}/report`);
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();

      // Libera a memória do blob depois do navegador iniciar o download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      return { fileName };
    },
  });
}

// --- Clientes ---------------------------------------------------------------

export function useClients(filters: { search?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: queryKeys.clients(filters),
    queryFn: () =>
      api.get<Paginated<ClientRow>>('/clients', {
        search: filters.search || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => api.post<ClientRow>('/clients', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// --- Perfil -----------------------------------------------------------------

export function useUpdateMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<ProfileRow>('/me', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

// --- Master: revendedores ---------------------------------------------------

export function useProfiles(
  filters: { status?: string; search?: string; page: number; pageSize: number },
  /** A rota é só de master; telas de revendedor passam `false` para não chamar. */
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.profiles(filters),
    queryFn: () =>
      api.get<Paginated<ProfileRow>>('/profiles', {
        role: 'reseller',
        status: filters.status || undefined,
        search: filters.search || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
  });
}

export function useAdminUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateProfileInput }) =>
      api.patch<ProfileRow>(`/profiles/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

// --- Master: emissão de rating ---------------------------------------------

export function useIssueRating(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, isCorrection }: { input: IssueRatingInput; isCorrection: boolean }) =>
      isCorrection
        ? api.patch<OrderRow>(`/orders/${orderId}/rating`, input)
        : api.post<OrderRow>(`/orders/${orderId}/rating`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

// --- Master: leads ----------------------------------------------------------

export function useLeads(filters: { status?: string; search?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: queryKeys.leads(filters),
    queryFn: () =>
      api.get<Paginated<LeadRow>>('/leads', {
        status: filters.status || undefined,
        search: filters.search || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.patch<LeadRow>(`/leads/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}
