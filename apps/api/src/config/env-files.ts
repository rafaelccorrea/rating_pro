import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Caminhos dos arquivos `.env`, do mais especifico para o mais generico.
 * Resolvidos a partir do `__dirname` para funcionar igual rodando de `src/`
 * (ts-node) e de `dist/` (build), onde este arquivo fica sempre dois niveis
 * abaixo da raiz de `apps/api`.
 */
export function envFilePaths(): string[] {
  const candidates = [
    resolve(__dirname, '../../.env'), // apps/api/.env
    resolve(__dirname, '../../../../.env'), // raiz do monorepo
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  return [...new Set(candidates)].filter((path) => existsSync(path));
}

/**
 * Leitor minimo de `.env` para os scripts de seed: eles rodam fora do Nest e o
 * `dotenv` nao esta acessivel a partir de `apps/api` no layout do pnpm.
 * Nao sobrescreve variaveis ja presentes no ambiente.
 */
export function loadEnvFiles(): void {
  for (const path of envFilePaths()) {
    const content = readFileSync(path, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator <= 0) continue;

      const key = line.slice(0, separator).trim();
      if (key.length === 0 || process.env[key] !== undefined) continue;

      let value = line.slice(separator + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));

      if (quoted && value.length >= 2) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
