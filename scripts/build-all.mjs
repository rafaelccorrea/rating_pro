import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Build dos tres pacotes, na ordem (shared -> api -> web).
 *
 * Nao chamamos `pnpm` pelo nome de proposito. Em hospedagem gerenciada o pnpm
 * costuma ser invocado por caminho absoluto (corepack), e o shell filho de um
 * script npm nao herda esse PATH — o build morria com "pnpm: command not found"
 * mesmo depois de um `pnpm install` bem-sucedido.
 *
 * `npm_execpath` e preenchido pelo proprio gerenciador que esta rodando este
 * script, entao usamos exatamente o mesmo binario que chegou ate aqui.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = ['@rating-pro/shared', '@rating-pro/api', '@rating-pro/web'];

/** Como reinvocar o gerenciador de pacotes neste ambiente. */
function runner() {
  const execPath = process.env.npm_execpath;

  // Caminho de um .js (caso do pnpm via corepack): roda com o mesmo node.
  if (execPath && /\.[cm]?js$/.test(execPath)) {
    return { command: process.execPath, prefix: [execPath] };
  }

  // Um executavel proprio (pnpm.cmd, npm.cmd...): chama direto.
  if (execPath) {
    return { command: execPath, prefix: [] };
  }

  // Rodou sem gerenciador (node scripts/build-all.mjs na mao).
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', prefix: [] };
}

const { command, prefix } = runner();

for (const name of PACKAGES) {
  console.log(`\n▸ build ${name}`);

  const result = spawnSync(command, [...prefix, '--filter', name, 'build'], {
    cwd: root,
    stdio: 'inherit',
    // .cmd no Windows so executa via shell.
    shell: process.platform === 'win32' && !prefix.length,
  });

  if (result.error) {
    console.error(`Falha ao invocar o build de ${name}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nBuild completo: shared, api e web.');
