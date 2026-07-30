-- ===========================================================================
-- 20260730120100_local_auth_error_code
--
-- `create_local_user` levantava o e-mail duplicado com errcode
-- 'unique_violation' (23505). Semanticamente correto, mas o Prisma intercepta
-- esse SQLSTATE e o reescreve como "Unique constraint failed", descartando a
-- mensagem em português que a função escreveu.
--
-- Trocado para 'check_violation' (23514), que o AllExceptionsFilter mapeia para
-- 409 preservando o texto original.
-- ===========================================================================

create or replace function private.create_local_user(
  p_email    text,
  p_password text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid := extensions.gen_random_uuid();
  v_email text := lower(btrim(p_email));
begin
  if v_email = '' or p_password is null or length(p_password) < 8 then
    raise exception 'E-mail e senha (mínimo 8 caracteres) são obrigatórios'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from auth.users u where u.email = v_email) then
    raise exception 'Já existe uma conta com este e-mail'
      using errcode = 'check_violation';
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at,
    updated_at
  )
  values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    private.hash_password(p_password),
    now(),
    coalesce(p_metadata, '{}'::jsonb),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    now(),
    now()
  );

  return v_id;
end;
$$;

revoke all on function private.create_local_user(text, text, jsonb)
  from public, anon, authenticated;
