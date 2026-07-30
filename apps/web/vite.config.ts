import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],

  /*
   * O .env vive na raiz do monorepo, compartilhado com a API. Apontar `envDir`
   * para lá faz o Vite carregá-lo nativamente — em dev e em build — em vez de
   * depender de um `define` manual, que se comporta de forma diferente nos dois
   * modos e é fonte fácil de "funciona no build, não funciona no dev".
   */
  envDir: monorepoRoot,

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /*
         * Agrupamento por caminho, nao por nome de pacote: um mapa
         * { react: ['react-dom'] } nao captura subcaminhos como
         * `react-dom/client`, e o vendor acabava caindo no bundle da landing.
         *
         * `charts` e alcancado so por import dinamico, entao vira chunk
         * assincrono e nao pesa no primeiro carregamento da landing.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const path = id.replace(/\\/g, '/');

          if (
            /\/(recharts|d3-|victory-vendor|decimal\.js-light|internmap|delaunator|robust-predicates)/.test(
              path,
            )
          ) {
            return 'charts';
          }
          if (/\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)) {
            return 'react';
          }
          if (path.includes('/zod/')) return 'zod';
          if (path.includes('/@tanstack/')) return 'query';

          return 'vendor';
        },
      },
    },
  },
});
