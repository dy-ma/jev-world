import { spawn } from 'node:child_process';
import { buildMode } from '../lib/mode.mjs';
if (process.argv.includes('--replay-only')) process.env.REPLAY_ONLY = 'true';
const mode = buildMode();
const args = mode === 'replay'
  ? ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.replay.config.ts']
  : ['node_modules/vinext/dist/cli.js', 'build'];
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { process.exitCode = 1; });
