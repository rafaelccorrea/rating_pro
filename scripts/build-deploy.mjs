import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Monta `deploy/api/` — a pasta que sobe para a hospedagem.
 *
 * O host roda `npm install` na propria pasta da aplicacao, e npm nao entende
 * `workspace:*` nem enxerga o monorepo. Por isso o bundle leva o
 * `@rating-pro/shared` ja compilado dentro de `vendor/` e o package.json aponta
 * para ele por `file:` — o install no servidor resolve tudo sem pnpm.
 *
 * O Prisma Client NAO vai pronto de proposito: o engine e binario por sistema
 * operacional, e o gerado no Windows nao roda no Linux do host. Quem gera e o
 * `postinstall` la, com o schema que vai junto.
 *
 * Uso: pnpm deploy:build   (depois de buildar shared e api)
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'deploy', 'api');

const apiPkg = JSON.parse(readFileSync(join(root, 'apps/api/package.json'), 'utf8'));
const sharedPkg = JSON.parse(readFileSync(join(root, 'packages/shared/package.json'), 'utf8'));

for (const [label, path] of [
  ['apps/api/dist', 'apps/api/dist'],
  ['packages/shared/dist', 'packages/shared/dist'],
]) {
  if (!existsSync(join(root, path))) {
    throw new Error(
      `Faltou buildar ${label}. Rode: pnpm --filter @rating-pro/shared build && pnpm --filter @rating-pro/api build`,
    );
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// --- Codigo -----------------------------------------------------------------

cpSync(join(root, 'apps/api/dist'), join(out, 'dist'), { recursive: true });
cpSync(join(root, 'apps/api/prisma'), join(out, 'prisma'), { recursive: true });

const vendor = join(out, 'vendor/shared');
mkdirSync(vendor, { recursive: true });
cpSync(join(root, 'packages/shared/dist'), join(vendor, 'dist'), { recursive: true });
writeFileSync(
  join(vendor, 'package.json'),
  `${JSON.stringify(
    {
      name: sharedPkg.name,
      version: sharedPkg.version,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      dependencies: sharedPkg.dependencies,
    },
    null,
    2,
  )}\n`,
);

// --- package.json do bundle -------------------------------------------------

const dependencies = Object.fromEntries(
  Object.entries(apiPkg.dependencies).map(([name, range]) =>
    String(range).startsWith('workspace:') ? [name, 'file:./vendor/shared'] : [name, range],
  ),
);

// `prisma` sai de devDependency para dependency: o postinstall do servidor
// precisa do CLI para gerar o client com o engine do Linux.
dependencies.prisma = apiPkg.devDependencies.prisma;

writeFileSync(
  join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: 'rating-pro-api',
      version: apiPkg.version,
      private: true,
      engines: { node: '>=20' },
      scripts: {
        start: 'node dist/main.js',
        postinstall: 'prisma generate',
        'migrate:deploy': 'prisma migrate deploy',
      },
      dependencies,
    },
    null,
    2,
  )}\n`,
);

// --- Instrucoes -------------------------------------------------------------

writeFileSync(
  join(out, 'LEIA-ME.md'),
  `# Deploy da API

Conteudo desta pasta vai inteiro para a pasta da aplicacao Node no host
(ex.: \`.../nodejs/\`), preservando a estrutura.

1. Suba tudo: \`dist/\`, \`prisma/\`, \`vendor/\` e \`package.json\`.
2. Crie o \`.env\` ao lado do \`package.json\` (veja \`.env.example\` do repositorio).
   Obrigatorios: \`DATABASE_URL\`, \`DIRECT_URL\`, \`JWT_SECRET\`, \`CREDENTIALS_KEY\`.
3. Rode \`npm install\` (no painel da Hostinger, "Run NPM Install"). Ele instala as
   dependencias e gera o Prisma Client com o engine do Linux.
4. Aplique as migrations: \`npm run migrate:deploy\`.
5. Arquivo de entrada da aplicacao: \`dist/main.js\`.

\`UPLOADS_DIR\` precisa apontar para uma pasta gravavel e persistente — os anexos
dos pedidos ficam nela.

Sem o passo 3 o processo morre com \`Cannot find module 'reflect-metadata'\`:
e o sintoma de \`dist/\` no ar sem \`node_modules\` ao lado.
`,
);

console.log(`Bundle pronto em ${out}`);
