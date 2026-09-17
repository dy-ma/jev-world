import http from 'node:http';
import { resolve } from 'node:path';
import { Harness } from './harness.mjs';
import { isReplayOnly } from '../lib/mode.mjs';
if (isReplayOnly()) throw new Error('The live harness cannot start with REPLAY_ONLY=true.');
const harness = new Harness({ key: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL || 'jev-latest', directory: resolve('.data/runs') });
let changingRun = false;
const server = http.createServer(async (req, res) => {
  const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && req.url === '/state') return reply(200, harness.snapshot());
  if (req.method === 'GET' && req.url === '/runs') {
    try { return reply(200, { runs: await harness.listRuns() }); }
    catch { return reply(500, { error: 'Could not read saved runs. Files have been preserved.' }); }
  }
  if (req.method !== 'POST' || !['/start', '/pause', '/resume', '/load', '/select'].includes(req.url)) return reply(404, { error: 'Not found.' });
  if (req.headers['content-type'] !== 'application/json') return reply(415, { error: 'JSON required.' });
  if (req.headers.origin) return reply(403, { error: 'Use the application interface.' });
  if (changingRun) return reply(409, { error: 'Another run action is finishing. Try again shortly.' });
  changingRun = true;
  try {
    let body = '';
    for await (const part of req) { body += part; if (body.length > 1024) return reply(413, { error: 'Request too large.' }); }
    const config = JSON.parse(body || '{}');
    if (req.url === '/start') await harness.start(config);
    if (req.url === '/pause') await harness.pause();
    if (req.url === '/resume') await harness.resume();
    if (req.url === '/load') await harness.load(config.id);
    if (req.url === '/select') await harness.select(config.width);
    return reply(200, harness.snapshot());
  } catch (error) { return reply(400, { error: error instanceof SyntaxError ? 'Invalid request.' : error.message }); }
  finally { changingRun = false; }
});
server.on('error', () => { console.error('Harness could not start. Port 8787 may already be in use.'); process.exit(1); });
// Bind before opening saved state: only one process can own this local world.
server.listen(8787, '127.0.0.1', async () => {
  try { await harness.init(); console.log(`Jev harness: http://127.0.0.1:8787 (${harness.key ? 'API key configured' : 'API key missing'}). No run starts automatically.`); }
  catch { console.error('Saved run could not be read. Preserving files; stopping.'); server.close(); process.exitCode = 1; }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await harness.pause().catch(() => {}); server.close(); server.closeAllConnections(); process.exit(0); });
