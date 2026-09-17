import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { replayTimeline } from '../lib/replay.ts';
import { percentile } from '../server/grid.mjs';

const id = process.argv[2] ?? 'b9144b61-f849-4bd0-979b-080ccf41b4a8';
if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid run identifier.');
const raw = await readFile(resolve('.data/runs', `${id}.json`), 'utf8');
const source = JSON.parse(raw);
if (source.status !== 'complete' || source.width !== 64 || source.height !== 32 || source.cells.some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) throw new Error('Expected a complete 64 × 32 probability grid.');
// Explicit public fields: never copy a directory, environment, or harness state.
const run = {
  id: source.id, width: source.width, height: source.height, batchSize: source.batchSize, concurrency: source.concurrency,
  model: source.model, resolvedModel: source.resolvedModel, status: source.status, createdAt: source.createdAt,
  elapsedMs: source.activeMs, cells: source.cells, completed: source.cells.length, inFlight: 0, message: null,
  inputTokens: source.inputTokens, outputTokens: source.outputTokens,
  p50: percentile(source.requests.filter(r => r.ok).map(r => r.ms), .5),
  p95: percentile(source.requests.filter(r => r.ok).map(r => r.ms), .95),
  requests: source.requests.map(r => ({ ms: r.ms, points: r.points, indices: r.indices, startedAtMs: r.startedAtMs, completedAtMs: r.completedAtMs, ok: r.ok, at: r.at })),
};
if (!replayTimeline(run)) throw new Error('This recording cannot be faithfully replayed.');
await mkdir('share', { recursive: true });
await writeFile('share/recording.json', JSON.stringify(run));
await writeFile('share/provenance.json', JSON.stringify({ sourceRunId: id, sourceSha256: createHash('sha256').update(raw).digest('hex'), promptVersion: source.promptVersion, preparedAt: new Date().toISOString(), selection: 'Most recent completed 64 × 32 run, explicitly selected by the user.', replay: 'Original per-batch membership and wall-clock arrival times; no regenerated or reshuffled answers.' }, null, 2));
console.log(JSON.stringify({ id, elapsedMs: run.elapsedMs, blocks: run.completed, requests: run.requests.length, output: 'share/recording.json' }));
