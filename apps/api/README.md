# @rating-pro/api

Backend da plataforma. NestJS 11 · TypeScript · Prisma 6 · Supabase (Auth + Storage).

## Configuração

O Prisma lê `apps/api/.env` automaticamente; o Nest lê esse arquivo e também o
`.env` da raiz do monorepo (o mais específico vence).

| Variável                    | Obrigatória | Para quê                                      |
| --------------------------- | ----------- | --------------------------------------------- |
| `DATABASE_URL`              | sim         | runtime (pooler transaction mode, 6543)       |
| `DIRECT_URL`                | migrations  | session mode (5432)                           |
| `JWT_SECRET`                | sim         | assina o token de sessão; mínimo 32 caracteres |
| `JWT_EXPIRES_IN`            | não         | default `12h`                                 |
| `API_PORT` / `API_PREFIX`   | não         | default `3333` / `api`                        |
| `CORS_ORIGINS`              | não         | lista separada por vírgula; vazio libera tudo |
| `THROTTLE_TTL` / `_LIMIT`   | não         | default `60`s / `120` req                     |
| `BRAND_NAME`                | não         | nome impresso no laudo                        |
| `MASTER_1_*` / `MASTER_2_*` | seed        | e-mail, senha e nome dos 2 masters            |

Nenhuma chave do Supabase: a autenticação é local e o laudo é gerado pela própria
API. Trocar o `JWT_SECRET` invalida todas as sessões abertas.

As variáveis são validadas com zod no boot: falta alguma, o processo morre na
hora com a lista do que está errado, em vez de falhar na primeira requisição.

## Comandos

```powershell
pnpm --filter @rating-pro/api migrate:deploy   # aplica as migrations
pnpm --filter @rating-pro/api migrate:status   # o que falta aplicar
pnpm --filter @rating-pro/api seed:masters     # cria/reconcilia os 2 masters
pnpm --filter @rating-pro/api seed:demo        # dados de demonstração
pnpm --filter @rating-pro/api dev              # watch em :3333
pnpm --filter @rating-pro/api test             # testes unitários (sem banco)
```

Swagger em `http://localhost:3333/api/docs`.

> Use sempre `migrate:deploy`, nunca `prisma migrate dev`: o `migrate dev` exige
> um shadow database, e estas migrations dependem dos schemas `auth` e `storage`,
> que só existem num Supabase de verdade.

## Rotas

Autenticação por `Authorization: Bearer <access_token>` do Supabase Auth.

| Método | Rota                       | Quem             |
| ------ | -------------------------- | ---------------- |
| GET    | `/api/health`              | público          |
| POST   | `/api/auth/signup`         | público (5/min)  |
| POST   | `/api/auth/login`          | público (10/min) |
| PATCH  | `/api/auth/password`       | autenticado      |
| POST   | `/api/leads`               | público (5/min)  |
| GET    | `/api/me`                  | autenticado      |
| PATCH  | `/api/me`                  | autenticado     |
| GET    | `/api/dashboard/stats`     | autenticado     |
| GET    | `/api/clients`             | autenticado     |
| POST   | `/api/clients`             | revendedor      |
| GET    | `/api/clients/:id`         | dono ou master  |
| PATCH  | `/api/clients/:id`         | dono ou master  |
| GET    | `/api/orders`              | autenticado     |
| POST   | `/api/orders`              | revendedor      |
| GET    | `/api/orders/:id`          | dono ou master  |
| PATCH  | `/api/orders/:id`          | dono ou master  |
| POST   | `/api/orders/:id/status`   | dono ou master  |
| GET    | `/api/orders/:id/events`   | dono ou master  |
| GET    | `/api/orders/:id/report`   | dono ou master (PDF binário) |
| POST   | `/api/orders/:id/rating`   | master           |
| PATCH  | `/api/orders/:id/rating`   | master           |
| GET    | `/api/profiles`            | master           |
| GET    | `/api/profiles/:id`        | master           |
| PATCH  | `/api/profiles/:id`        | master           |
| PATCH  | `/api/profiles/:id/password` | master         |
| GET    | `/api/leads`               | master           |
| PATCH  | `/api/leads/:id`           | master           |

Erros saem sempre no formato `{ statusCode, message, errors? }` — `errors` é o
mapa campo → mensagens quando a validação zod falha.

## ⚠️ RLS não protege as queries daqui

O Prisma conecta como `postgres`, que tem `BYPASSRLS`. As policies do banco
**não filtram nada** nestas queries — elas protegem o acesso direto do frontend
via `supabase-js` com a `anon key`.

Por isso o isolamento por revendedor é explícito em `src/common/scope.ts`:

- `scopeByReseller(user)` / `scopeByOrderOwner(user)` compõem o `where` do Prisma;
- `assertOwnership(user, resellerId)` é a rede de segurança depois de um
  `findUnique`, que por definição ignora o escopo;
- `internalNotes` do pedido é removido antes de responder a um revendedor.

Todo service novo que leia dados de revendedor **precisa** usar esses helpers.
Há testes travando exatamente isso em `src/common/scope.spec.ts`.

## Regras que ficam no banco, não aqui

Máquina de estados do pedido, limite de 2 masters, criação do perfil no signup,
derivação de `grade`/`risk` a partir do score, cálculo da comissão, geração do
código do pedido e a trilha de auditoria são triggers/defaults do Postgres. A API
revalida a transição de status antes de chamar o banco só para devolver uma
mensagem legível em vez de deixar subir o erro cru do Postgres.
