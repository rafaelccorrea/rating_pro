-- ===========================================================================
-- 20260730130000_tracking_token
--
-- Link público de acompanhamento, para o cliente final ver o andamento do
-- próprio pedido sem precisar de conta:
--   /acompanhamento/<tracking_token>
--
-- Por que um token dedicado e não o `id` do pedido na URL:
--   1. o id é chave estrangeira em várias tabelas e aparece em log, métrica e
--      caminho de arquivo — um vazamento daria acesso permanente;
--   2. token é revogável: dá para gerar um novo e invalidar o link antigo sem
--      mexer em nada que referencie o pedido.
-- Visualmente a URL é idêntica (também é um UUID), então não há perda de UX.
-- ===========================================================================

alter table public.rating_orders
  add column tracking_token uuid not null default extensions.gen_random_uuid();

-- Índice único: é por ele que a busca pública entra.
create unique index rating_orders_tracking_token_key
  on public.rating_orders (tracking_token);

comment on column public.rating_orders.tracking_token is
  'Token do link público de acompanhamento. Revogável via UPDATE para gen_random_uuid().';

-- ---------------------------------------------------------------------------
-- A consulta pública NÃO passa por policy: ela entra pela API, que conecta como
-- `postgres`. Mantemos a RLS coerente de todo modo — nenhuma policy nova
-- concede leitura a `anon`, então um cliente PostgREST com anon key continua sem
-- ver pedido nenhum, mesmo tendo o token.
-- ---------------------------------------------------------------------------
