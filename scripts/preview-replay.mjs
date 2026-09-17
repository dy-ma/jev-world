import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.replay.config.ts', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, REPLAY_ONLY: 'true' } });
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
