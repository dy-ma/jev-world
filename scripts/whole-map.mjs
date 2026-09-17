import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { buildRequest, decodeResponse } from '../server/grid.mjs';
import { compareCells } from '../lib/comparison.mjs';
import { isReplayOnly } from '../lib/mode.mjs';
if (isReplayOnly()) throw new Error('Live experiments are disabled in replay-only mode.');

const id = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Provide --baseline=<saved-run-id>.');
const baseline = JSON.parse(await readFile(resolve('.data/runs', `${id}.json`), 'utf8'));
if (baseline.status !== 'complete' || baseline.width !== 64 || baseline.height !== 32 || baseline.promptVersion !== 1) throw new Error('Expected a completed 64 × 32 recording with prompt version 1.');
const model = baseline.resolvedModel;
if (!model || model.endsWith('latest')) throw new Error('A resolved, pinned model version is required.');
const indices = Array.from({ length: 2048 }, (_, i) => i);
const request = buildRequest(indices, baseline.width, model);
const body = JSON.stringify(request);
if (!process.argv.includes('--execute')) {
  console.log(JSON.stringify({ dryRun: true, baselineId: id, model, questions: indices.length, requestBytes: Buffer.byteLength(body) }));
  process.exit(0);
}
const live = await fetch('http://127.0.0.1:8787/state', { signal: AbortSignal.timeout(3000) }).then(r => r.json());
if (live.run?.status === 'running') throw new Error('A benchmark is running. Wait for it to finish before this comparison.');
const key = process.env.TYPESAFE_API_KEY;
if (!key) throw new Error('Missing TYPESAFE_API_KEY.');
const experimentId = randomUUID();
const directory = resolve('.data/experiments', `whole-map-${experimentId}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(resolve(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
await save('request.json', request);
const requestHash = createHash('sha256').update(body).digest('hex');
const createdAt = new Date().toISOString();
await save('attempt.json', { experimentId, baselineId: id, createdAt, model, requestHash, questions: indices.length, attempts: 1, automaticRetries: false, status: 'sending' });
const started = performance.now();
let status;
try {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(120000),
  });
  status = response.status;
  const raw = await response.text();
  const responseReceivedAt = new Date().toISOString();
  const responseBodyMs = performance.now() - started;
  if (!response.ok) {
    await writeFile(resolve(directory, 'response.json'), raw, { mode: 0o600 });
    await save('result.json', { experimentId, baselineId: id, status: 'rejected', httpStatus: status, ms: responseBodyMs, responseReceivedAt, questions: indices.length, attempts: 1 });
    console.log(JSON.stringify({ directory, status: 'rejected', httpStatus: status, ms: responseBodyMs }));
    process.exitCode = 1;
  } else {
    const result = JSON.parse(raw);
    const decoded = decodeResponse(result, indices);
    const cells = decoded.map(p => p.probability);
    const parsedAt = new Date().toISOString();
    const ms = performance.now() - started;
    await writeFile(resolve(directory, 'response.json'), raw, { mode: 0o600 });
    const run = { id: experimentId, width: 64, height: 32, batchSize: 2048, concurrency: 1, model, resolvedModel: result.model, status: 'complete', createdAt, activeMs: ms, elapsedMs: ms, activeSince: null, cells, completed: 2048, p50: ms, p95: ms, inFlight: 0, inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0, message: null, promptVersion: 1, requests: [{ ms, points: 2048, indices, startedAtMs: 0, completedAtMs: ms, ok: true, at: parsedAt }] };
    // Do not change the active benchmark, its cache, or the curated sharing run.
    await save('run.json', run);
    const comparison = { ...compareCells(baseline.cells, cells), baselineId: id, experimentId, baselineModel: baseline.resolvedModel, candidateModel: result.model, sameModel: baseline.resolvedModel === result.model, baselineElapsedMs: baseline.activeMs, candidateMs: ms, responseBodyMs, baselineInputTokens: baseline.inputTokens, candidateInputTokens: run.inputTokens, attempts: 1, limitations: 'One call compared with one historical run; not a repeated-trial estimate or a geographic accuracy measurement.' };
    await save('comparison.json', comparison);
    await save('result.json', { status: 'complete', experimentId, baselineId: id, httpStatus: status, ms, questions: 2048, attempts: 1 });
    const { changedIndices, ...summary } = comparison;
    console.log(JSON.stringify({ directory, ...summary }));
  }
} catch (error) {
  await save('result.json', { experimentId, baselineId: id, status: 'failed', httpStatus: status, ms: performance.now() - started, errorType: error.name, attempts: 1 });
  console.log(JSON.stringify({ directory, status: 'failed', errorType: error.name, automaticRetries: false }));
  process.exitCode = 1;
}
