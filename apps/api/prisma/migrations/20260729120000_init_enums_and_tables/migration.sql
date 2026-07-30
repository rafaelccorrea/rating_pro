-- ===========================================================================
-- 20260729120000_init_enums_and_tables
-- Schema base da plataforma: enums, tabelas de dominio e indices.
-- ===========================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- Emails ficam como text puro (nao citext): o Supabase Auth ja grava
-- normalizado em minusculas, e citext em schema separado atrapalha o
-- mapeamento do Prisma sem trazer ganho real aqui.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Apenas dois papeis: 'master' (operacao interna) e 'reseller' (revendedor).
create type public.user_role as enum ('master', 'reseller');

create type public.profile_status as enum ('pending', 'active', 'suspended');

create type public.person_type as enum ('pf', 'pj');

-- Ciclo de vida do pedido de rating.
--   draft       -> revendedor esta montando o pedido
--   submitted   -> enviado, aguardando triagem do master
--   in_analysis -> master assumiu a analise
--   pending_doc -> master devolveu pedindo documento/correcao
--   approved    -> rating emitido, laudo em geracao/gerado
--   delivered   -> laudo disponivel para download
--   rejected    -> recusado pelo master
--   cancelled   -> cancelado pelo revendedor
create type public.order_status as enum (
  'draft',
  'submitted',
  'in_analysis',
  'pending_doc',
  'approved',
  'delivered',
  'rejected',
  'cancelled'
);

-- Escala de rating adotada (do melhor para o pior).
create type public.rating_grade as enum (
  'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'
);

create type public.risk_level as enum (
  'minimo', 'baixo', 'moderado', 'alto', 'critico'
);

create type public.lead_status as enum (
  'new', 'contacted', 'qualified', 'converted', 'lost'
);

-- ---------------------------------------------------------------------------
-- profiles: espelha auth.users com os dados de negocio
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.user_role       not null default 'reseller',
  status          public.profile_status  not null default 'pending',
  full_name       text                   not null,
  email           text                   not null unique,
  phone           text,
  document        text,                              -- CPF/CNPJ do revendedor
  company_name    text,
  city            text,
  state           char(2),
  -- Percentual repassado ao revendedor sobre o valor da venda (0..1).
  commission_rate numeric(5, 4)          not null default 0.3000,
  notes           text,
  created_at      timestamptz            not null default now(),
  updated_at      timestamptz            not null default now(),

  constraint profiles_commission_rate_range
    check (commission_rate >= 0 and commission_rate <= 1),
  constraint profiles_full_name_not_blank
    check (length(btrim(full_name)) > 0),
  constraint profiles_state_uppercase
    check (state is null or state = upper(state))
);

comment on table public.profiles is
  'Perfil de negocio de cada usuario autenticado. 1:1 com auth.users.';
comment on column public.profiles.commission_rate is
  'Fracao (0..1) do valor da venda que fica com o revendedor.';

create index profiles_role_status_idx on public.profiles (role, status);
create index profiles_created_at_idx  on public.profiles (created_at desc);

-- ---------------------------------------------------------------------------
-- clients: o cliente final, sempre pertencente a um revendedor
-- ---------------------------------------------------------------------------
create table public.clients (
  id           uuid primary key default extensions.gen_random_uuid(),
  reseller_id  uuid                not null references public.profiles (id) on delete cascade,
  person_type  public.person_type  not null,
  -- Somente digitos: 11 para CPF, 14 para CNPJ.
  document     text                not null,
  name         text                not null,
  email        text,
  phone        text,
  birth_date   date,                            -- PF: nascimento | PJ: fundacao
  city         text,
  state        char(2),
  created_at   timestamptz         not null default now(),
  updated_at   timestamptz         not null default now(),

  constraint clients_document_digits
    check (document ~ '^[0-9]+$'),
  constraint clients_document_length
    check (
      (person_type = 'pf' and length(document) = 11) or
      (person_type = 'pj' and length(document) = 14)
    ),
  constraint clients_name_not_blank
    check (length(btrim(name)) > 0),
  -- Um mesmo documento nao se duplica dentro da carteira do mesmo revendedor.
  constraint clients_reseller_document_unique
    unique (reseller_id, document)
);

comment on table public.clients is
  'Cliente final (PF ou PJ) cadastrado por um revendedor.';

create index clients_reseller_idx on public.clients (reseller_id, created_at desc);
create index clients_document_idx on public.clients (document);

-- ---------------------------------------------------------------------------
-- rating_orders: o pedido de rating
-- ---------------------------------------------------------------------------
create sequence public.rating_order_code_seq;

create table public.rating_orders (
  id                uuid primary key default extensions.gen_random_uuid(),
  -- Codigo legivel: RP-2026-000123. E um DEFAULT de coluna (nao trigger) para
  -- que o Prisma o enxergue como campo opcional no create.
  code              text                not null unique
                      default ('RP-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('public.rating_order_code_seq')::text, 6, '0')),
  reseller_id       uuid                not null references public.profiles (id) on delete restrict,
  client_id         uuid                not null references public.clients (id)  on delete restrict,
  status            public.order_status not null default 'draft',
  -- Master que assumiu a analise.
  assigned_to       uuid                references public.profiles (id) on delete set null,
  sale_amount       numeric(12, 2)      not null default 0,
  commission_amount numeric(12, 2)      not null default 0,
  reseller_notes    text,
  internal_notes    text,                          -- visivel somente para masters
  rejection_reason  text,
  submitted_at      timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now(),

  constraint rating_orders_sale_amount_positive
    check (sale_amount >= 0),
  constraint rating_orders_commission_positive
    check (commission_amount >= 0),
  constraint rating_orders_rejection_reason_required
    check (status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0)
);

comment on table public.rating_orders is
  'Pedido de rating aberto por um revendedor e processado pelos masters.';
comment on column public.rating_orders.internal_notes is
  'Anotacoes internas: RLS impede leitura por revendedores via view segura.';

create index rating_orders_reseller_idx  on public.rating_orders (reseller_id, created_at desc);
create index rating_orders_status_idx    on public.rating_orders (status, created_at desc);
create index rating_orders_assigned_idx  on public.rating_orders (assigned_to)
  where assigned_to is not null;
create index rating_orders_client_idx    on public.rating_orders (client_id);

-- ---------------------------------------------------------------------------
-- ratings: o resultado emitido (1:1 com o pedido)
-- ---------------------------------------------------------------------------
create table public.ratings (
  id           uuid primary key default extensions.gen_random_uuid(),
  order_id     uuid                not null unique references public.rating_orders (id) on delete cascade,
  score        integer             not null,
  -- grade/risk sao sempre reescritos pelo trigger `ratings_fill_derived` a
  -- partir do score. Os defaults existem so para o Prisma nao exigi-los no create.
  grade        public.rating_grade not null default 'D',
  risk         public.risk_level   not null default 'critico',
  summary      text,
  -- Fatores que compuseram a nota:
  -- [{ "label": "Historico de pagamento", "weight": 0.35, "score": 820 }]
  factors      jsonb               not null default '[]'::jsonb,
  valid_until  date                not null,
  issued_by    uuid                not null references public.profiles (id) on delete restrict,
  issued_at    timestamptz         not null default now(),
  -- Caminho no bucket de Storage; nulo enquanto o PDF nao foi gerado.
  report_path  text,
  created_at   timestamptz         not null default now(),
  updated_at   timestamptz         not null default now(),

  constraint ratings_score_range  check (score between 0 and 1000),
  constraint ratings_factors_array check (jsonb_typeof(factors) = 'array')
);

comment on table public.ratings is
  'Rating emitido para um pedido. Score 0-1000 com grade e faixa de risco.';

create index ratings_issued_by_idx on public.ratings (issued_by, issued_at desc);
create index ratings_grade_idx     on public.ratings (grade);

-- ---------------------------------------------------------------------------
-- order_documents: anexos enviados junto ao pedido
-- ---------------------------------------------------------------------------
create table public.order_documents (
  id            uuid primary key default extensions.gen_random_uuid(),
  order_id      uuid        not null references public.rating_orders (id) on delete cascade,
  storage_path  text        not null unique,
  file_name     text        not null,
  mime_type     text        not null,
  size_bytes    bigint      not null,
  uploaded_by   uuid        not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),

  constraint order_documents_size_positive check (size_bytes > 0)
);

create index order_documents_order_idx    on public.order_documents (order_id, created_at desc);
-- FK sem indice torna o ON DELETE RESTRICT um seq scan.
create index order_documents_uploader_idx on public.order_documents (uploaded_by);

-- ---------------------------------------------------------------------------
-- order_events: trilha de auditoria imutavel do pedido
-- ---------------------------------------------------------------------------
create table public.order_events (
  id          uuid primary key default extensions.gen_random_uuid(),
  order_id    uuid                not null references public.rating_orders (id) on delete cascade,
  actor_id    uuid                references public.profiles (id) on delete set null,
  from_status public.order_status,
  to_status   public.order_status,
  event_type  text                not null,
  note        text,
  created_at  timestamptz         not null default now()
);

comment on table public.order_events is
  'Historico append-only de transicoes e acoes sobre o pedido.';

create index order_events_order_idx on public.order_events (order_id, created_at desc);
create index order_events_actor_idx on public.order_events (actor_id)
  where actor_id is not null;

-- ---------------------------------------------------------------------------
-- leads: captura da landing page (insercao publica, leitura so de master)
-- ---------------------------------------------------------------------------
create table public.leads (
  id         uuid primary key default extensions.gen_random_uuid(),
  name       text               not null,
  email      text               not null,
  phone      text               not null,
  company    text,
  message    text,
  -- De onde veio: 'landing-hero', 'landing-cta-final', 'calculadora', ...
  source     text               not null default 'landing',
  utm        jsonb              not null default '{}'::jsonb,
  status     public.lead_status not null default 'new',
  owner_id   uuid               references public.profiles (id) on delete set null,
  created_at timestamptz        not null default now(),
  updated_at timestamptz        not null default now(),

  constraint leads_name_not_blank  check (length(btrim(name)) > 0),
  constraint leads_email_format    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint leads_phone_not_blank check (length(btrim(phone)) > 0)
);

create index leads_status_idx     on public.leads (status, created_at desc);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_owner_idx      on public.leads (owner_id)
  where owner_id is not null;
