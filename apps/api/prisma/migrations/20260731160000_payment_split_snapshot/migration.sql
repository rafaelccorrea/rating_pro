-- ===========================================================================
-- 20260731160000_payment_split_snapshot
-- Guarda o rateio que cada cobranca levou para o Asaas.
--
-- O split vive no .env (ASAAS_SPLIT_WALLETS) e pode mudar quando os socios
-- combinarem outra divisao. Sem registrar o que valia na hora da cobranca, o
-- painel dos socios recalcularia o passado inteiro com a regra nova — o
-- historico de quem recebeu o que mudaria sozinho.
--
-- Formato: [{"walletId": "...", "percentualValue": 70}, ...]. Nulo nas
-- cobrancas anteriores a esta migration e nas que nunca foram ao gateway; o
-- painel avisa quando cai nesse caso.
-- ===========================================================================

alter table public.order_payments
  add column split jsonb;

comment on column public.order_payments.split is
  'Rateio enviado ao Asaas nesta cobranca. Historico: nao recalcule com a config atual.';
