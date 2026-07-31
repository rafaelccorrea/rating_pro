-- ===========================================================================
-- 20260731120000_asaas_integration
-- Cobranca via Asaas com split entre os socios.
--
-- A cobranca do pedido passa a poder nascer no Asaas (PIX, boleto ou cartao),
-- com split configurado por ambiente (ex.: 70% para um socio, 30% para o
-- outro). O banco guarda so o vinculo e os dados de exibicao; quem manda no
-- status continua sendo o webhook + a baixa manual do master.
--
--   - profiles.asaas_customer_id: o revendedor como "customer" na conta Asaas.
--     Criado sob demanda na primeira cobranca e reaproveitado depois.
--   - order_payments.asaas_payment_id: id da cobranca no Asaas. Unico — e a
--     chave de reconciliacao do webhook.
--   - invoice_url / bank_slip_url / pix_payload / due_date: o que a tela de
--     pagamento mostra sem precisar consultar o Asaas de novo.
-- ===========================================================================

alter table public.profiles
  add column asaas_customer_id text unique;

comment on column public.profiles.asaas_customer_id is
  'Id do customer na conta Asaas. Nulo enquanto o revendedor nunca foi cobrado.';

alter table public.order_payments
  add column asaas_payment_id text unique,
  add column invoice_url      text,
  add column bank_slip_url    text,
  add column pix_payload      text,
  add column due_date         date;

comment on column public.order_payments.asaas_payment_id is
  'Id da cobranca no Asaas. Nulo quando a cobranca e manual (sem gateway).';
comment on column public.order_payments.pix_payload is
  'PIX copia e cola devolvido pelo Asaas. So para exibicao.';
