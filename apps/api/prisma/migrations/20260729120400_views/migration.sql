-- ===========================================================================
-- 20260729120400_views
-- Views de leitura para o painel. security_invoker = on faz a view rodar com
-- as permissoes de quem consulta, entao a RLS das tabelas base continua valendo
-- (sem isso a view viraria um bypass de RLS).
-- ===========================================================================

create or replace view public.order_details
with (security_invoker = on) as
select
  o.id,
  o.code,
  o.status,
  o.reseller_id,
  o.client_id,
  o.assigned_to,
  o.sale_amount,
  o.commission_amount,
  o.reseller_notes,
  o.rejection_reason,
  o.submitted_at,
  o.delivered_at,
  o.created_at,
  o.updated_at,

  c.name        as client_name,
  c.document    as client_document,
  c.person_type as client_person_type,
  c.email       as client_email,
  c.phone       as client_phone,
  c.city        as client_city,
  c.state       as client_state,

  p.full_name   as reseller_name,
  p.email       as reseller_email,

  m.full_name   as assigned_to_name,

  r.id          as rating_id,
  r.score       as rating_score,
  r.grade       as rating_grade,
  r.risk        as rating_risk,
  r.summary     as rating_summary,
  r.factors     as rating_factors,
  r.valid_until as rating_valid_until,
  r.issued_at   as rating_issued_at,
  r.report_path as rating_report_path,

  (select count(*) from public.order_documents d where d.order_id = o.id) as documents_count
from public.rating_orders o
join public.clients  c on c.id = o.client_id
join public.profiles p on p.id = o.reseller_id
left join public.profiles m on m.id = o.assigned_to
left join public.ratings  r on r.order_id = o.id;

comment on view public.order_details is
  'Pedido + cliente + revendedor + rating em uma linha. Omite internal_notes de proposito.';

grant select on public.order_details to authenticated;
