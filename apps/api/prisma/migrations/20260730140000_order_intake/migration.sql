-- ===========================================================================
-- 20260730140000_order_intake
--
-- Formulário de coleta para a análise: os dados que a equipe precisa para
-- ponderar os fatores do rating. São dois conjuntos distintos (PF e PJ), com
-- pouca sobreposição.
--
-- jsonb, e não colunas: o conteúdo varia por tipo de pessoa e é lido sempre por
-- inteiro. Em colunas seriam ~40 campos, metade sempre nula, e cada ajuste no
-- formulário viraria migration. A forma é garantida na borda pelo
-- `intakeSchema` (zod), compartilhado entre a API e o formulário do React.
-- ===========================================================================

alter table public.rating_orders
  add column intake jsonb;

comment on column public.rating_orders.intake is
  'Formulário de coleta PF ou PJ, discriminado por intake->>''personType''. Validado por zod na aplicação.';

-- ---------------------------------------------------------------------------
-- Coerência entre o tipo declarado no formulário e o do cliente do pedido.
--
-- Sem isto, um formulário de PJ poderia ser gravado num pedido de pessoa
-- física — e o laudo sairia analisando faturamento de quem tem salário.
-- ---------------------------------------------------------------------------
create or replace function public.rating_orders_check_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_type public.person_type;
  v_intake_type text;
begin
  if new.intake is null then
    return new;
  end if;

  if jsonb_typeof(new.intake) <> 'object' then
    raise exception 'O formulário de análise precisa ser um objeto'
      using errcode = 'check_violation';
  end if;

  v_intake_type := new.intake ->> 'personType';

  if v_intake_type is null then
    raise exception 'O formulário de análise precisa declarar personType'
      using errcode = 'check_violation';
  end if;

  select c.person_type into v_client_type
  from public.clients c
  where c.id = new.client_id;

  if v_client_type::text <> v_intake_type then
    raise exception
      'O formulário é de % mas o cliente do pedido é %',
      upper(v_intake_type), upper(v_client_type::text)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger rating_orders_check_intake
  before insert or update of intake, client_id on public.rating_orders
  for each row execute function public.rating_orders_check_intake();

-- ---------------------------------------------------------------------------
-- Não deixa um pedido entrar em análise sem o formulário preenchido: é o
-- insumo da avaliação. A aplicação também barra, mas o banco é a última porta.
-- ---------------------------------------------------------------------------
create or replace function public.rating_orders_require_intake()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('submitted', 'in_analysis', 'approved', 'delivered')
     and new.intake is null then
    raise exception 'Preencha o formulário de análise antes de enviar o pedido'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger rating_orders_require_intake
  before insert or update of status on public.rating_orders
  for each row execute function public.rating_orders_require_intake();

-- Busca por tipo de formulário no painel do master.
create index rating_orders_intake_person_type_idx
  on public.rating_orders ((intake ->> 'personType'))
  where intake is not null;
