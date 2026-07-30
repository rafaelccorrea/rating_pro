# @rating-pro/web

Landing page pública + painel do revendedor + painel master.
React 19 · TypeScript · Vite · Tailwind CSS 4 · React Query · React Router 7.

## Variáveis de ambiente

Lidas do `.env` da raiz do monorepo (o `vite.config.ts` carrega de lá) ou de um
`.env` local. Só o prefixo `VITE_` chega ao browser.

| Variável               | Default                     | Para quê                           |
| ---------------------- | --------------------------- | ---------------------------------- |
| `VITE_API_URL`         | `http://localhost:3333/api` | backend NestJS                     |
| `VITE_BRAND_NAME`      | `Rating Pro`                | nome exibido em toda a interface   |
| `VITE_BRAND_SHORT`     | `RatingPro`                 | versão curta da marca              |
| `VITE_WHATSAPP_NUMBER` | —                           | botão flutuante e links de contato |
| `VITE_CONTACT_EMAIL`   | —                           | rodapé e recuperação de acesso     |

**Nenhuma é obrigatória**: todas têm default e a aplicação sobe sem `.env`.
Não há credencial de terceiro aqui — a autenticação é feita pela nossa API, e o
token de sessão fica no `localStorage` (ver `src/lib/session.ts`).

## Rodar

```powershell
pnpm --filter @rating-pro/web dev       # http://localhost:5173
pnpm --filter @rating-pro/web build
pnpm --filter @rating-pro/web typecheck
```

## Rotas

| Rota                      | Acesso     | Tela                                        |
| ------------------------- | ---------- | ------------------------------------------- |
| `/`                       | público    | Landing page                                |
| `/entrar`                 | público    | Login                                       |
| `/criar-conta`            | público    | Cadastro de revendedor                      |
| `/recuperar-senha`        | público    | Orienta a pedir redefinição à equipe        |
| `/painel`                 | autenticado| Visão geral (métricas + gráfico)            |
| `/painel/pedidos`         | autenticado| Lista com filtro, busca e paginação         |
| `/painel/pedidos/novo`    | revendedor | Abrir pedido                                |
| `/painel/pedidos/:id`     | autenticado| Detalhe, histórico, laudo, ações            |
| `/painel/clientes`        | autenticado| Carteira + cadastro PF/PJ                   |
| `/painel/perfil`          | autenticado| Dados cadastrais e comissão                 |
| `/master`                 | master     | Fila de análise                             |
| `/master/emitir/:id`      | master     | Emissão/correção do rating                  |
| `/master/revendedores`    | master     | Ativar, suspender, ajustar comissão         |
| `/master/leads`           | master     | Leads da landing                            |

## Notas de arquitetura

- **Contrato com o backend**: os schemas zod de `@rating-pro/shared` validam o
  formulário aqui e a requisição no NestJS. Uma definição, dois usos.
- **Tema**: a classe `.dark` é aplicada no `<html>` por um script inline no
  `index.html`, antes da primeira pintura, para não piscar branco.
  `@custom-variant dark` no CSS redefine a variante do Tailwind 4 para usar essa
  classe em vez de `prefers-color-scheme`.
- **Peso do bundle**: `recharts` entra só por import dinâmico, então não pesa no
  primeiro carregamento da landing. As rotas autenticadas são `React.lazy`.
- **Download do laudo**: a rota do PDF exige header `Authorization`, então um
  `window.open` não serve. O `useReportDownload` busca como blob e dispara o
  download por object URL.
- **Escala do score**: `ScoreGauge` desenha a régua a partir de `SCORE_BANDS` do
  pacote compartilhado — a mesma tabela que o banco e o PDF usam.
