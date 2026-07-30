-- ===========================================================================
-- 20260730150000_rating_requests
-- Fluxo de contratacao em 4 etapas: cadastro, perfil, documentos e pagamento.
--
-- O pedido continua sendo `rating_orders`. Esta migration acrescenta o que o
-- fluxo novo precisa e que nao cabia la:
--   - order_applications: quem preencheu (estado civil, escolaridade, profissao)
--     e a senha Serasa CIFRADA;
--   - order_payments: a cobranca do pedido;
--   - order_documents.slot: a que item do checklist o anexo responde.
-- ===========================================================================

create type public.payment_method as enum ('pix', 'card', 'boleto');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');

-- --- Dados do solicitante ---------------------------------------------------

create table public.order_applications (
  order_id            uuid primary key references public.rating_orders (id) on delete cascade,
  -- Texto e nao enum: o vocabulario vive no zod compartilhado, igual ao resto
  -- do formulario de coleta, e mudar a lista nao deve custar uma migration.
  marital_status      text not null,
  education           text not null,
  occupation          text not null,
  -- AES-256-GCM, formato "iv:tag:ciphertext" em base64url. A chave vive no
  -- ambiente da API (CREDENTIALS_KEY); o banco nunca ve o texto claro.
  serasa_password_enc text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.order_applications.serasa_password_enc is
  'Credencial de terceiro cifrada. Nunca exponha por API nem em log.';

create trigger order_applications_set_updated_at
  before update on public.order_applications
  for each row execute function public.set_updated_at();

-- --- Cobranca ---------------------------------------------------------------

create table public.order_payments (
  id         uuid primary key default extensions.gen_random_uuid(),
  order_id   uuid not null references public.rating_orders (id) on delete cascade,
  method     public.payment_method not null,
  status     public.payment_status not null default 'pending',
  amount     numeric(12, 2) not null check (amount >= 0),
  -- Identificador no provedor (txid do PIX, id da transacao do cartao...).
  reference  text,
  note       text,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma cobranca aberta por pedido: evita duas tentativas concorrentes virarem
-- duas cobrancas pagas.
create unique index order_payments_open_unique
  on public.order_payments (order_id)
  where status = 'pending';

create index order_payments_order_idx on public.order_payments (order_id, created_at desc);
create index order_payments_status_idx on public.order_payments (status, created_at desc);

create trigger order_payments_set_updated_at
  before update on public.order_payments
  for each row execute function public.set_updated_at();

-- `paid_at` acompanha o status sem depender de quem escreve.
create or replace function public.order_payments_stamp_paid()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status <> 'paid' then
    new.paid_at := null;
  end if;

  return new;
end;
$$;

create trigger order_payments_stamp_paid
  before insert or update on public.order_payments
  for each row execute function public.order_payments_stamp_paid();

-- --- Anexos por item do checklist ------------------------------------------

alter table public.order_documents
  add column if not exists slot text;

-- Um arquivo por item; reenviar substitui (o service apaga o anterior).
create unique index if not exists order_documents_order_slot_unique
  on public.order_documents (order_id, slot)
  where slot is not null;

-- --- RLS --------------------------------------------------------------------
-- Mesmo padrao das demais: leitura do dono do pedido ou de master. A API usa
-- `postgres` (BYPASSRLS), entao isto protege so o acesso direto via anon key.

alter table public.order_applications enable row level security;
alter table public.order_payments enable row level security;

-- Nota: order_applications NAO tem policy de select para o revendedor. A tabela
-- guarda a senha do Serasa cifrada; so master (e a API, que ignora RLS) leem.
create policy order_applications_select_master on public.order_applications
  for select using ((select private.is_master()));

create policy order_payments_select on public.order_payments
  for select
  using (
    (select private.is_master())
    or exists (
      select 1
      from public.rating_orders o
      where o.id = order_payments.order_id
        and o.reseller_id = (select auth.uid())
    )
  );
