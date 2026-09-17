import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { isReplayOnly } from '../lib/mode.mjs';
try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const replayOnly = isReplayOnly();
if (replayOnly) {
  const build = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  const code = await new Promise(resolve => { build.on('exit', resolve); build.on('error', () => resolve(1)); });
  if (code !== 0) process.exit(Number(code) || 1);
}
const children = replayOnly ? [
  spawn(process.execPath, ['scripts/preview-replay.mjs', '--port', process.env.JEV_UI_PORT || '5173', '--host', process.env.JEV_UI_HOST || '127.0.0.1', '--strictPort'], { stdio: 'inherit' }),
] : [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--port', process.env.JEV_UI_PORT || '5173', '--hostname', process.env.JEV_UI_HOST || '127.0.0.1'], { stdio: 'inherit' }),
];
let closing = false;
function stop(code = 0) { if (closing) return; closing = true; for (const child of children) child.kill('SIGTERM'); setTimeout(() => process.exit(code), 800); }
for (const child of children) { child.on('exit', code => stop(code || 0)); child.on('error', () => stop(1)); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
