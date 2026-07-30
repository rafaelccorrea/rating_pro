-- ===========================================================================
-- 20260730120200_password_floor
--
-- Separa piso de política:
--
--   banco (aqui)      -> piso técnico de 6 caracteres, igual ao default do
--                        Supabase Auth. Garante que nada entre abaixo disso,
--                        inclusive por seed ou script.
--   aplicação (zod)   -> política de produto: 8 caracteres no cadastro
--                        self-service e na troca de senha.
--
-- Antes o banco exigia 8, o que quebrava contas provisionadas por seed com
-- senha de 6 escolhida antes desta mudança.
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
  if v_email = '' or p_password is null or length(p_password) < 6 then
    raise exception 'E-mail e senha (mínimo 6 caracteres) são obrigatórios'
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

create or replace function private.set_password(p_user_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'A senha precisa de pelo menos 6 caracteres'
      using errcode = 'check_violation';
  end if;

  update auth.users
     set encrypted_password = private.hash_password(p_password),
         updated_at = now()
   where id = p_user_id;

  return found;
end;
$$;

revoke all on function private.create_local_user(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.set_password(uuid, text)
  from public, anon, authenticated;
