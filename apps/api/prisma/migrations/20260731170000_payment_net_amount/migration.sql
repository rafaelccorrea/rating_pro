-- ===========================================================================
-- 20260731170000_payment_net_amount
-- Valor liquido e status da cobranca no gateway.
--
-- O split do Asaas reparte o LIQUIDO (bruto menos a taxa da cobranca), mas o
-- banco so tinha o bruto. Ratear o bruto entrega a cada socio um numero maior
-- do que caiu na carteira dele — exatamente a diferenca que obrigaria os dois
-- a conferir no painel do Asaas.
--
--   - net_amount: `netValue` devolvido pelo Asaas. Estimado na criacao da
--     cobranca e reescrito com o valor real quando o pagamento e confirmado.
--     A taxa e a diferenca para `amount`; nao guardamos as duas.
--   - asaas_status: status no gateway. Separa CONFIRMED (cartao aprovado,
--     repasse em ~30 dias) de RECEIVED (dinheiro liquidado) — os dois viram
--     `paid` aqui, porque os dois liberam a analise, mas so o segundo e caixa.
-- ===========================================================================

alter table public.order_payments
  add column net_amount   numeric(12, 2),
  add column asaas_status text;

comment on column public.order_payments.net_amount is
  'Liquido do Asaas (bruto menos taxa). Base real do split. Nulo sem gateway.';
comment on column public.order_payments.asaas_status is
  'Status no Asaas. CONFIRMED = aprovado mas ainda em liquidacao; RECEIVED = caixa.';
