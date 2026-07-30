-- ===========================================================================
-- 20260729120300_storage_buckets
-- Buckets privados para laudos e anexos + policies de acesso.
-- Convencao de caminho em ambos: "<order_id>/<arquivo>"
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('rating-reports', 'rating-reports', false, 20971520, array['application/pdf']),
  ('order-documents', 'order-documents', false, 20971520,
     array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Extrai o order_id do primeiro segmento do caminho e confirma se o pedido
-- pertence ao usuario autenticado. Fica em `private` pelo mesmo motivo dos
-- demais helpers: nao deve virar endpoint RPC.
create or replace function private.owns_order_by_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  begin
    v_order_id := (storage.foldername(p_name))[1]::uuid;
  exception
    when others then
      return false;   -- caminho fora da convencao "<uuid>/arquivo"
  end;

  return exists (
    select 1
    from public.rating_orders o
    where o.id = v_order_id
      and o.reseller_id = (select auth.uid())
  );
end;
$$;

revoke all on function private.owns_order_by_path(text) from public, anon;
grant execute on function private.owns_order_by_path(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rating-reports: master escreve, revendedor so le o laudo do proprio pedido
-- ---------------------------------------------------------------------------
create policy "reports: master gerencia"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'rating-reports' and (select private.is_master()))
  with check (bucket_id = 'rating-reports' and (select private.is_master()));

create policy "reports: revendedor baixa o proprio laudo"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'rating-reports' and (select private.owns_order_by_path(name)));

-- ---------------------------------------------------------------------------
-- order-documents: revendedor envia os anexos do proprio pedido
-- ---------------------------------------------------------------------------
create policy "docs: master gerencia"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'order-documents' and (select private.is_master()))
  with check (bucket_id = 'order-documents' and (select private.is_master()));

create policy "docs: revendedor le os proprios"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-documents' and (select private.owns_order_by_path(name)));

create policy "docs: revendedor envia nos proprios"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'order-documents' and (select private.owns_order_by_path(name)));

create policy "docs: revendedor remove os proprios"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'order-documents' and (select private.owns_order_by_path(name)));
