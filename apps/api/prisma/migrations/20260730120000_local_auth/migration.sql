-- ===========================================================================
-- 20260730120000_local_auth
--
-- Autenticação resolvida pela própria aplicação, sem depender do GoTrue
-- (Supabase Auth) e portanto sem precisar de anon key nem service_role key.
--
-- Decisão de compatibilidade: as senhas continuam em bcrypt na mesma coluna
-- `auth.users.encrypted_password` que o Supabase Auth usa. Isso mantém a porta
-- aberta para voltar ao GoTrue depois sem migrar credencial nenhuma, e reaproveita
-- o trigger `on_auth_user_created`, que já cria o profile.
--
-- pgcrypto está no schema `extensions` (convenção do Supabase), daí os prefixos.
-- ===========================================================================

create or replace function private.hash_password(p_password text)
returns text
language sql
volatile              -- gen_salt() é aleatório: não pode ser marcado immutable
as $$
  select extensions.crypt(p_password, extensions.gen_salt('bf', 10));
$$;

comment on function private.hash_password(text) is
  'Hash bcrypt (cost 10) compatível com o formato do Supabase Auth.';

-- ---------------------------------------------------------------------------
-- Criação de usuário
--
-- Preenche os campos que o GoTrue preencheria, para o registro continuar
-- utilizável caso o Supabase Auth volte a ser usado. `email_confirmed_at` já
-- vem preenchido: não há serviço de e-mail no fluxo local.
-- ---------------------------------------------------------------------------
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
      using errcode = 'unique_violation';
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

-- ---------------------------------------------------------------------------
-- Verificação de senha
--
-- Devolve o id do usuário, ou NULL. Retornar NULL tanto para e-mail inexistente
-- quanto para senha errada é intencional: não entrega ao atacante a informação
-- de quais e-mails existem na base.
-- ---------------------------------------------------------------------------
create or replace function private.verify_password(p_email text, p_password text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from auth.users u
  where u.email = lower(btrim(p_email))
    and u.encrypted_password is not null
    and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Troca de senha (o próprio usuário, ou um master redefinindo a de um revendedor)
-- ---------------------------------------------------------------------------
create or replace function private.set_password(p_user_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'A senha precisa de pelo menos 8 caracteres'
      using errcode = 'check_violation';
  end if;

  update auth.users
     set encrypted_password = private.hash_password(p_password),
         updated_at = now()
   where id = p_user_id;

  return found;
end;
$$;

-- Estas funções nunca devem ser chamadas por um cliente: a API conecta como
-- `postgres` (dono) e é a única porta de entrada.
revoke all on function private.hash_password(text)             from public, anon, authenticated;
revoke all on function private.create_local_user(text, text, jsonb) from public, anon, authenticated;
revoke all on function private.verify_password(text, text)      from public, anon, authenticated;
revoke all on function private.set_password(uuid, text)         from public, anon, authenticated;
