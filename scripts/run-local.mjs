import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
process.env.JEV_UI_HOST = process.argv[2] || '127.0.0.1';
await import('./dev.mjs');
