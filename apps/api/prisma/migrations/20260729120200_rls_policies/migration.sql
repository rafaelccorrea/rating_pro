-- ===========================================================================
-- 20260729120200_rls_policies
-- Row Level Security. Regra geral:
--   master   -> enxerga e opera tudo
--   reseller -> enxerga e opera apenas o que e seu
--   anon     -> so consegue inserir lead na landing
-- A service_role key (usada pelo NestJS) tem BYPASSRLS por definicao.
--
-- Convencao: toda chamada de funcao vai dentro de `(select ...)`. Isso vira um
-- InitPlan avaliado uma unica vez por query, em vez de uma chamada por linha
-- varrida — a diferenca chega a ordens de grandeza em tabela grande.
-- ===========================================================================

alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.rating_orders   enable row level security;
alter table public.ratings         enable row level security;
alter table public.order_documents enable row level security;
alter table public.order_events    enable row level security;
alter table public.leads           enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: le o proprio perfil"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: master le todos"
  on public.profiles for select
  to authenticated
  using ((select private.is_master()));

create policy "profiles: atualiza o proprio perfil"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: master atualiza qualquer perfil"
  on public.profiles for update
  to authenticated
  using ((select private.is_master()))
  with check ((select private.is_master()));

-- Sem policy de INSERT/DELETE: perfis nascem pelo trigger de auth.users e
-- somem por cascade quando o usuario e removido.

-- Impede escalada de privilegio: um revendedor editando o proprio perfil nao
-- pode mexer em role, status nem na comissao. A policy de UPDATE sozinha nao
-- resolve isso porque ela autoriza a linha inteira, nao coluna a coluna.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Sem usuario autenticado no contexto (service_role, seed, trigger interno).
  if (select auth.uid()) is null or (select private.is_master()) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.commission_rate is distinct from old.commission_rate then
    raise exception
      'Somente um master pode alterar role, status ou comissao.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy "clients: revendedor le os proprios"
  on public.clients for select
  to authenticated
  using (reseller_id = (select auth.uid()) or (select private.is_master()));

create policy "clients: revendedor ativo cadastra"
  on public.clients for insert
  to authenticated
  with check (
    reseller_id = (select auth.uid())
    and (select private.is_active_reseller())
  );

create policy "clients: revendedor edita os proprios"
  on public.clients for update
  to authenticated
  using (reseller_id = (select auth.uid()) or (select private.is_master()))
  with check (reseller_id = (select auth.uid()) or (select private.is_master()));

create policy "clients: master remove"
  on public.clients for delete
  to authenticated
  using ((select private.is_master()));

-- ---------------------------------------------------------------------------
-- rating_orders
-- ---------------------------------------------------------------------------
create policy "orders: revendedor le os proprios"
  on public.rating_orders for select
  to authenticated
  using (reseller_id = (select auth.uid()) or (select private.is_master()));

create policy "orders: revendedor ativo abre pedido"
  on public.rating_orders for insert
  to authenticated
  with check (
    reseller_id = (select auth.uid())
    and (select private.is_active_reseller())
    and status in ('draft', 'submitted')
  );

-- O revendedor so mexe no pedido enquanto ele ainda nao entrou em analise.
create policy "orders: revendedor edita rascunho"
  on public.rating_orders for update
  to authenticated
  using (reseller_id = (select auth.uid()) and status in ('draft', 'pending_doc'))
  with check (reseller_id = (select auth.uid()));

create policy "orders: master opera qualquer pedido"
  on public.rating_orders for update
  to authenticated
  using ((select private.is_master()))
  with check ((select private.is_master()));

create policy "orders: master remove"
  on public.rating_orders for delete
  to authenticated
  using ((select private.is_master()));

-- ---------------------------------------------------------------------------
-- ratings  (somente master emite; revendedor apenas le o do proprio pedido)
-- ---------------------------------------------------------------------------
create policy "ratings: le o rating do proprio pedido"
  on public.ratings for select
  to authenticated
  using (
    (select private.is_master())
    or exists (
      select 1 from public.rating_orders o
      where o.id = ratings.order_id
        and o.reseller_id = (select auth.uid())
    )
  );

create policy "ratings: master emite"
  on public.ratings for insert
  to authenticated
  with check ((select private.is_master()) and issued_by = (select auth.uid()));

create policy "ratings: master edita"
  on public.ratings for update
  to authenticated
  using ((select private.is_master()))
  with check ((select private.is_master()));

create policy "ratings: master remove"
  on public.ratings for delete
  to authenticated
  using ((select private.is_master()));

-- ---------------------------------------------------------------------------
-- order_documents
-- ---------------------------------------------------------------------------
create policy "documents: le documentos do proprio pedido"
  on public.order_documents for select
  to authenticated
  using (
    (select private.is_master())
    or exists (
      select 1 from public.rating_orders o
      where o.id = order_documents.order_id
        and o.reseller_id = (select auth.uid())
    )
  );

create policy "documents: anexa ao proprio pedido"
  on public.order_documents for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select private.is_master())
      or exists (
        select 1 from public.rating_orders o
        where o.id = order_documents.order_id
          and o.reseller_id = (select auth.uid())
          and o.status in ('draft', 'submitted', 'pending_doc')
      )
    )
  );

create policy "documents: remove do proprio pedido"
  on public.order_documents for delete
  to authenticated
  using (
    (select private.is_master())
    or exists (
      select 1 from public.rating_orders o
      where o.id = order_documents.order_id
        and o.reseller_id = (select auth.uid())
        and o.status in ('draft', 'pending_doc')
    )
  );

-- ---------------------------------------------------------------------------
-- order_events  (append-only; escrita fica a cargo dos triggers)
-- ---------------------------------------------------------------------------
create policy "events: le a trilha do proprio pedido"
  on public.order_events for select
  to authenticated
  using (
    (select private.is_master())
    or exists (
      select 1 from public.rating_orders o
      where o.id = order_events.order_id
        and o.reseller_id = (select auth.uid())
    )
  );

create policy "events: master registra nota manual"
  on public.order_events for insert
  to authenticated
  with check ((select private.is_master()) and actor_id = (select auth.uid()));

-- Sem UPDATE/DELETE: a trilha de auditoria e imutavel.

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create policy "leads: landing envia lead"
  on public.leads for insert
  to anon, authenticated
  with check (status = 'new' and owner_id is null);

create policy "leads: master le"
  on public.leads for select
  to authenticated
  using ((select private.is_master()));

create policy "leads: master atualiza"
  on public.leads for update
  to authenticated
  using ((select private.is_master()))
  with check ((select private.is_master()));

create policy "leads: master remove"
  on public.leads for delete
  to authenticated
  using ((select private.is_master()));

-- ---------------------------------------------------------------------------
-- Permissoes das funcoes expostas via PostgREST
-- ---------------------------------------------------------------------------
revoke all on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;

grant execute on function public.grade_from_score(integer) to authenticated, anon;
grant execute on function public.risk_from_score(integer)  to authenticated, anon;
