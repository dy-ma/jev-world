import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const project = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: `${project}share`,
  base: './',
  envDir: false,
  publicDir: false,
  plugins: [react(), {
    name: 'bundled-font-licenses',
    generateBundle() {
      for (const name of ['OFL-geist.txt', 'OFL-geist-mono.txt']) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: readFileSync(`${project}share/fonts/${name}`, 'utf8') });
      }
    },
  }],
  resolve: { alias: { '@': project } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: `${project}dist/replay`, emptyOutDir: true, sourcemap: false },
});
