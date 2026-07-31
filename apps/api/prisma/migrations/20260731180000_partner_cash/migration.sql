-- ===========================================================================
-- 20260731180000_partner_cash
-- O que o painel dos socios precisa para ser confiavel.
--
-- 1. `refunded_at` + correcao do gatilho. Hoje `order_payments_stamp_paid`
--    zera `paid_at` sempre que o status sai de 'paid' — um estorno em agosto
--    apagaria a data de um pagamento de julho, e o mes fechado mudaria
--    sozinho. Estorno passa a ser um evento com data propria, e a data em que
--    o dinheiro entrou fica onde estava.
--
-- 2. Dois indices parciais. As consultas do painel filtram por `paid_at` de
--    cobranca paga e por `due_date` de cobranca pendente; os indices que
--    existiam eram por (order_id, created_at) e (status, created_at).
-- ===========================================================================

alter table public.order_payments
  add column refunded_at timestamptz;

comment on column public.order_payments.refunded_at is
  'Quando o estorno aconteceu. paid_at continua marcando a entrada do dinheiro.';

create or replace function public.order_payments_stamp_paid()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status = 'refunded' then
    -- Preserva paid_at de proposito: o dinheiro entrou mesmo, e o mes em que
    -- ele entrou nao pode mudar por causa de um evento posterior.
    new.refunded_at := coalesce(new.refunded_at, now());
  elsif new.status <> 'paid' then
    new.paid_at := null;
  end if;

  return new;
end;
$$;

create index order_payments_paid_at_idx
  on public.order_payments (paid_at desc)
  where status = 'paid';

create index order_payments_due_date_idx
  on public.order_payments (due_date)
  where status = 'pending';
