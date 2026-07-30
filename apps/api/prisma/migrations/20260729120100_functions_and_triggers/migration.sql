-- ===========================================================================
-- 20260729120100_functions_and_triggers
-- Funcoes de apoio, regras de negocio no banco e triggers.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger rating_orders_set_updated_at
  before update on public.rating_orders
  for each row execute function public.set_updated_at();

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers de autorizacao
--
-- Ficam no schema `private`, fora dos schemas expostos pelo PostgREST
-- (ver config.toml > [api].schemas), entao nao viram endpoint RPC.
--
-- SECURITY DEFINER de proposito: as policies de `profiles` chamam estas
-- funcoes, e uma leitura sujeita a RLS dentro da propria policy causaria
-- recursao infinita. `search_path` fixo evita sequestro de resolucao de nome,
-- e cada funcao checa `auth.uid()` no corpo — nunca recebe o id por parametro.
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_master()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'master'
      and p.status = 'active'
  );
$$;

create or replace function private.is_active_reseller()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'reseller'
      and p.status = 'active'
  );
$$;

comment on function private.is_master() is
  'True se o usuario autenticado for master ativo. SECURITY DEFINER para nao recursar nas policies de profiles.';

revoke all on function private.is_master()          from public, anon;
revoke all on function private.is_active_reseller() from public, anon;
grant execute on function private.is_master()          to authenticated, service_role;
grant execute on function private.is_active_reseller() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Score -> grade / risco
-- Fonte unica da verdade; o TypeScript espelha esta tabela em @rating-pro/shared.
-- ---------------------------------------------------------------------------
create or replace function public.grade_from_score(p_score integer)
returns public.rating_grade
language sql
immutable
as $$
  select case
    when p_score >= 950 then 'AAA'::public.rating_grade
    when p_score >= 900 then 'AA'::public.rating_grade
    when p_score >= 850 then 'A'::public.rating_grade
    when p_score >= 780 then 'BBB'::public.rating_grade
    when p_score >= 700 then 'BB'::public.rating_grade
    when p_score >= 620 then 'B'::public.rating_grade
    when p_score >= 520 then 'CCC'::public.rating_grade
    when p_score >= 420 then 'CC'::public.rating_grade
    when p_score >= 300 then 'C'::public.rating_grade
    else 'D'::public.rating_grade
  end;
$$;

create or replace function public.risk_from_score(p_score integer)
returns public.risk_level
language sql
immutable
as $$
  select case
    when p_score >= 900 then 'minimo'::public.risk_level
    when p_score >= 780 then 'baixo'::public.risk_level
    when p_score >= 620 then 'moderado'::public.risk_level
    when p_score >= 420 then 'alto'::public.risk_level
    else 'critico'::public.risk_level
  end;
$$;

-- Preenche grade/risco quando o master informa apenas o score.
create or replace function public.ratings_fill_derived()
returns trigger
language plpgsql
as $$
begin
  new.grade := public.grade_from_score(new.score);
  new.risk  := public.risk_from_score(new.score);
  return new;
end;
$$;

create trigger ratings_fill_derived
  before insert or update of score on public.ratings
  for each row execute function public.ratings_fill_derived();

-- O codigo legivel do pedido (RP-2026-000042) vem do DEFAULT da coluna,
-- definido na migration anterior. Sem trigger.

-- ---------------------------------------------------------------------------
-- Comissao: se nao vier informada, deriva de sale_amount * commission_rate
-- ---------------------------------------------------------------------------
create or replace function public.rating_orders_fill_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate numeric(5, 4);
begin
  if new.sale_amount > 0 and coalesce(new.commission_amount, 0) = 0 then
    select p.commission_rate into v_rate
    from public.profiles p
    where p.id = new.reseller_id;

    new.commission_amount := round(new.sale_amount * coalesce(v_rate, 0), 2);
  end if;

  return new;
end;
$$;

create trigger rating_orders_fill_commission
  before insert or update of sale_amount on public.rating_orders
  for each row execute function public.rating_orders_fill_commission();

-- ---------------------------------------------------------------------------
-- Maquina de estados do pedido
--
-- Bloqueia transicoes invalidas no proprio banco: a API nao e a unica porta
-- (Studio, scripts e psql tambem escrevem aqui).
-- ---------------------------------------------------------------------------
create or replace function public.rating_orders_guard_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed public.order_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'draft'       then array['submitted', 'cancelled']::public.order_status[]
    when 'submitted'   then array['in_analysis', 'pending_doc', 'rejected', 'cancelled']::public.order_status[]
    when 'in_analysis' then array['pending_doc', 'approved', 'rejected']::public.order_status[]
    when 'pending_doc' then array['submitted', 'in_analysis', 'rejected', 'cancelled']::public.order_status[]
    when 'approved'    then array['delivered', 'rejected']::public.order_status[]
    when 'delivered'   then array[]::public.order_status[]
    when 'rejected'    then array[]::public.order_status[]
    when 'cancelled'   then array[]::public.order_status[]
  end;

  if not (new.status = any (v_allowed)) then
    raise exception
      'Transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Carimbos de tempo do ciclo de vida.
  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := now();
  end if;

  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;

  return new;
end;
$$;

create trigger rating_orders_guard_transition
  before update of status on public.rating_orders
  for each row execute function public.rating_orders_guard_transition();

-- Registra cada transicao na trilha de auditoria.
create or replace function public.rating_orders_log_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, to_status, event_type, note)
    values (new.id, (select auth.uid()), new.status, 'order.created', null);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, from_status, to_status, event_type, note)
    values (
      new.id,
      (select auth.uid()),
      old.status,
      new.status,
      'order.status_changed',
      case when new.status = 'rejected' then new.rejection_reason else null end
    );
  end if;

  return new;
end;
$$;

create trigger rating_orders_log_event
  after insert or update of status on public.rating_orders
  for each row execute function public.rating_orders_log_event();

-- ---------------------------------------------------------------------------
-- Provisionamento de perfil no signup
--
-- Roda como SECURITY DEFINER no contexto do trigger de auth.users, entao
-- ignora RLS de proposito: e o unico caminho que cria a linha em profiles.
-- Todo signup publico nasce como 'reseller'. Master so via seed/servico.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, status, full_name, email, phone, document, company_name)
  values (
    new.id,
    'reseller',
    -- Troque para 'pending' se quiser aprovacao manual de cada revendedor.
    'active',
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'document', ''), '\D', '', 'g'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'company_name'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantem profiles.email em sincronia com auth.users.email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Trava de negocio: no maximo 2 masters
-- ---------------------------------------------------------------------------
create or replace function public.enforce_master_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  if new.role <> 'master' then
    return new;
  end if;

  select count(*) into v_count
  from public.profiles p
  where p.role = 'master'
    and p.id <> new.id;

  if v_count >= 2 then
    raise exception
      'Limite de 2 usuarios master atingido. Rebaixe um master antes de promover outro.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger profiles_enforce_master_limit
  before insert or update of role on public.profiles
  for each row execute function public.enforce_master_limit();

-- ---------------------------------------------------------------------------
-- Metricas agregadas do painel
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_master boolean := private.is_master();
  v_uid       uuid    := (select auth.uid());
  v_result    jsonb;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_orders',      count(*),
    'pending_orders',    count(*) filter (where o.status in ('submitted', 'in_analysis', 'pending_doc')),
    'delivered_orders',  count(*) filter (where o.status = 'delivered'),
    'rejected_orders',   count(*) filter (where o.status = 'rejected'),
    'total_sales',       coalesce(sum(o.sale_amount)       filter (where o.status = 'delivered'), 0),
    'total_commission',  coalesce(sum(o.commission_amount) filter (where o.status = 'delivered'), 0),
    'avg_score',         (
      select round(avg(r.score))
      from public.ratings r
      join public.rating_orders ro on ro.id = r.order_id
      where v_is_master or ro.reseller_id = v_uid
    )
  )
  into v_result
  from public.rating_orders o
  where v_is_master or o.reseller_id = v_uid;

  if v_is_master then
    v_result := v_result || jsonb_build_object(
      'total_resellers',  (select count(*) from public.profiles where role = 'reseller'),
      'active_resellers', (select count(*) from public.profiles where role = 'reseller' and status = 'active'),
      'new_leads',        (select count(*) from public.leads where status = 'new')
    );
  end if;

  return v_result;
end;
$$;

comment on function public.dashboard_stats() is
  'Metricas do painel, com escopo automatico: master ve tudo, revendedor ve so o proprio.';
