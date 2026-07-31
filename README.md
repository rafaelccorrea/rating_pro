# Rating Pro

Plataforma de rating de crédito com programa de revenda.

Revendedores abrem pedidos de rating para clientes finais (PF/PJ). Exatamente **2 usuários master**
analisam a fila, emitem o rating (score 0–1000, grade AAA→D) e entregam um laudo em PDF.

> `Rating Pro` é um nome provisório. Está centralizado em `VITE_BRAND_NAME` — troque num lugar só.

## Stack

| Camada   | Escolha                                                     |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 + React Query |
| Backend  | NestJS 11 + TypeScript                                      |
| ORM      | Prisma 6                                                    |
| Banco    | PostgreSQL (hospedado no Supabase)                          |
| Auth     | própria: bcrypt no Postgres + JWT emitido pela API          |
| Laudo    | PDF gerado sob demanda pela API (pdfkit)                    |
| Monorepo | pnpm workspaces                                             |

> O Supabase é usado **apenas como banco Postgres gerenciado**. Não há
> dependência do Supabase Auth nem do Storage, então **nenhuma chave de API é
> necessária** — só a string de conexão. Ver "Autenticação" abaixo.

## Estrutura

```
rating-pro/
├─ apps/
│  ├─ api/                  # NestJS — back-end
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma   # modelos do ORM
│  │  │  └─ migrations/     # SQL versionado (fonte da verdade do schema)
│  │  └─ src/
│  └─ web/                  # React — landing page + painéis
├─ packages/
│  └─ shared/               # @rating-pro/shared: tipos, enums, zod, regras de score
├─ supabase/
│  └─ config.toml           # infra local (Auth, Storage, Studio)
└─ .env                     # config única da raiz (gitignored)
```

`packages/shared` é o contrato entre front e back: os mesmos schemas zod validam o formulário no
React e a requisição no NestJS, e a mesma tabela de faixas define o score nos dois lados.

## Modelo de dados

- **profiles** — 1:1 com `auth.users`. `role` é `master` ou `reseller`; `commission_rate` é a fatia do
  revendedor sobre a venda.
- **clients** — cliente final do revendedor (CPF ou CNPJ, com validação de dígito no banco).
- **rating_orders** — o pedido. Código legível `RP-2026-000042` gerado por `DEFAULT` de coluna.
- **ratings** — o resultado (1:1 com o pedido). `grade` e `risk` são derivados de `score` por trigger.
- **order_documents** — anexos do pedido.
- **order_events** — trilha de auditoria append-only, escrita por trigger a cada mudança de status.
- **leads** — captura da landing page.

### Regras que vivem no banco (não duplicadas na aplicação)

- Máquina de estados do pedido, validada por trigger:
  `draft → submitted → in_analysis → approved → delivered`, com desvios para `pending_doc`,
  `rejected` e `cancelled`. Os três últimos são terminais.
- Limite de **2 masters**, garantido por trigger.
- Perfil criado automaticamente no signup, sempre como `reseller`.
- Um revendedor não consegue alterar o próprio `role`, `status` ou `commission_rate`.
- RLS ativa em todas as tabelas: master vê tudo, revendedor só o que é seu, `anon` só insere lead.

## Pagamentos (Asaas + split entre os sócios)

A cobrança do fluxo de contratação pode nascer no [Asaas](https://www.asaas.com) — PIX, boleto ou
cartão — com **split de recebimento entre os sócios** (ex.: 70% para um, 30% para o outro). Toda a
integração é opcional: sem `ASAAS_API_KEY` no `.env`, vale o fluxo manual (chave `PIX_KEY` na tela +
baixa pelo master).

Como funciona com a integração ligada:

1. Ao fechar a contratação, a API cria o *customer* (o revendedor, que precisa de CPF/CNPJ no
   perfil) e a cobrança no Asaas, já com o split. A tela de pagamento mostra a fatura hospedada
   ("Pagar agora"), o PIX copia e cola e o boleto.
2. O webhook (`POST /api/webhooks/asaas`) recebe a confirmação e dá baixa na cobrança — a mesma
   regra da baixa manual do master, com outro disparador.
3. Pedido cancelado ou recusado cancela a cobrança pendente no gateway.
4. Se o gateway estiver fora do ar (ou o perfil sem CPF/CNPJ) na criação, o pedido nasce mesmo
   assim; a próxima visita à tela de pagamento tenta criar a cobrança de novo.

Configuração:

| Variável              | O que é                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `ASAAS_API_KEY`       | Chave de API (painel Asaas → Integrações). Vazio desliga a integração.      |
| `ASAAS_ENV`           | `sandbox` (padrão) ou `production`.                                         |
| `ASAAS_WEBHOOK_TOKEN` | Token conferido no header `asaas-access-token` do webhook. Obrigatório com a chave definida. |
| `ASAAS_SPLIT_WALLETS` | `walletId:percentual` separado por vírgula, ex.: `abc:70,def:30`.           |
| `ASAAS_DUE_DAYS`      | Vencimento em dias corridos (padrão 3).                                     |

Sobre o split: cada sócio pega o próprio `walletId` em *Menu → Integrações → Carteira* **na conta
dele**. O percentual incide sobre o valor líquido da cobrança; o que não for listado fica na conta
que emitiu. Se a conta principal já é de um dos sócios, liste só a carteira do outro (ex.:
`carteira-do-outro:30`).

No painel do Asaas, cadastre o webhook apontando para `https://<sua-api>/api/webhooks/asaas`, com o
mesmo token do `.env` e os eventos de cobrança (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`,
`PAYMENT_REFUNDED`, `PAYMENT_DELETED` — os demais são ignorados com 200).

## Autenticação

Feita pela própria API, sem serviço externo:

- **Senhas** em bcrypt (cost 10) na coluna `auth.users.encrypted_password`, gravadas e verificadas
  por funções `SECURITY DEFINER` no schema `private` (`create_local_user`, `verify_password`,
  `set_password`). O formato é o mesmo que o Supabase Auth usa, então voltar a usá-lo depois não
  exige migrar credencial nenhuma.
- **Sessão** por JWT HS256 assinado com `JWT_SECRET`, validade de 12h e sem refresh token. O
  frontend guarda no `localStorage` e envia no header `Authorization`.
- **Piso e política**: o banco garante o mínimo de 6 caracteres; os schemas zod da aplicação exigem
  8 no cadastro self-service e na troca de senha.
- **Sem enumeração de usuários**: e-mail inexistente e senha errada devolvem a mesma mensagem.
- **Recuperação de senha**: não há provedor de e-mail, então quem redefine é um master, via
  `PATCH /api/profiles/:id/password`.

O `JwtAuthGuard` recarrega o perfil do banco em toda requisição, de propósito: uma suspensão passa a
valer na hora, e não só quando o token expirar.

## RLS × Prisma

A RLS continua ativa em todas as tabelas e protege qualquer acesso que venha com um papel restrito
(por exemplo, se alguém apontar um cliente PostgREST para o banco).

O Prisma conecta como `postgres`, que tem `BYPASSRLS` — **as policies não se aplicam às queries da
API**. Por isso o isolamento por revendedor é responsabilidade explícita da camada de serviço, em
`apps/api/src/common/scope.ts`, com testes que travam o comportamento.

As funções auxiliares (`is_master`, `is_active_reseller`, `verify_password`, …) ficam no schema
`private`, fora dos schemas expostos pelo PostgREST, e portanto não viram endpoint RPC.

## Como rodar

### 1. Configurar o ambiente

```powershell
cp .env.example .env
```

Preencha `apps/api/.env`. São só três coisas:

| Variável       | Onde achar                                                  |
| -------------- | ----------------------------------------------------------- |
| `DATABASE_URL` | Dashboard → Connect → ORMs → Prisma (pooler 6543)           |
| `DIRECT_URL`   | mesmo lugar, porta 5432                                     |
| `JWT_SECRET`   | você gera: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

O `.env` da raiz guarda as `VITE_*` do frontend (marca, WhatsApp, URL da API) — nenhuma é
obrigatória para rodar.

### 2. Instalar

```powershell
pnpm install
```

### 3. Aplicar o schema

```powershell
pnpm --filter @rating-pro/api migrate:deploy
```

> Use sempre `migrate:deploy`, nunca `prisma migrate dev`. O `migrate dev` exige um shadow database,
> e estas migrations dependem dos schemas `auth` e `storage`, que só existem num Supabase de verdade.

### 4. Criar os 2 masters

```powershell
pnpm --filter @rating-pro/api seed:masters
```

Lê `MASTER_1_*` e `MASTER_2_*` do `.env`. É idempotente.

### 5. Subir

```powershell
pnpm dev            # api (3333) + web (5173) juntos
pnpm dev:api        # só o back
pnpm dev:web        # só o front
```

- Landing: http://localhost:5173
- API: http://localhost:3333/api
- Swagger: http://localhost:3333/api/docs

### Alternativa: Supabase local

```powershell
pnpm db:start       # sobe Postgres + Auth + Storage + Studio via Docker
```

Aponte `DATABASE_URL`/`DIRECT_URL` para `postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
copie as chaves que o comando imprime e rode `migrate:deploy`. Studio em http://localhost:54323.

## Scripts

| Comando                                          | O que faz                          |
| ------------------------------------------------ | ---------------------------------- |
| `pnpm dev`                                        | sobe api e web em paralelo         |
| `pnpm build`                                      | compila shared → api → web         |
| `pnpm typecheck`                                  | checagem de tipos em tudo          |
| `pnpm --filter @rating-pro/api migrate:deploy`    | aplica as migrations               |
| `pnpm --filter @rating-pro/api migrate:status`    | mostra o que falta aplicar         |
| `pnpm --filter @rating-pro/api seed:masters`      | cria/atualiza os 2 masters         |
| `pnpm --filter @rating-pro/api seed:demo`         | popula dados de demonstração       |
| `pnpm --filter @rating-pro/api test`              | testes unitários do back           |

## Alterando o schema

1. Crie `apps/api/prisma/migrations/<timestamp>_<nome>/migration.sql` com o SQL.
2. Atualize `apps/api/prisma/schema.prisma` para refletir a mudança.
3. `pnpm --filter @rating-pro/api migrate:deploy && pnpm --filter @rating-pro/api prisma:generate`
4. Se mexeu em enum ou regra de status, atualize `packages/shared/src/domain.ts` — os dois lados
   precisam continuar de acordo.
