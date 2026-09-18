import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { replayTimeline } from '../lib/replay.ts';
import { percentile, WIDTHS } from '../server/grid.mjs';

// Keep the explicitly selected 64 × 32 run; choose the latest completed run
// for every other resolution. Preparing public copies never modifies local runs.
const selected64 = process.argv[2] ?? JSON.parse(await readFile('share/recording.json', 'utf8')).id;
if (!/^[a-f0-9-]{36}$/.test(selected64)) throw new Error('Invalid run identifier.');
const sources = [];
for (const file of await readdir('.data/runs')) {
  if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
  const raw = await readFile(resolve('.data/runs', file), 'utf8');
  const source = JSON.parse(raw);
  if (source.status === 'complete') sources.push({ raw, source });
}
const recordings = [], provenance = [];
await mkdir('share/recordings', { recursive: true });
for (const width of WIDTHS) {
  const candidates = sources.filter(({ source }) => source.width === width && (width !== 64 || source.id === selected64));
  candidates.sort((a, b) => Date.parse(b.source.createdAt) - Date.parse(a.source.createdAt));
  if (!candidates.length) throw new Error(`No completed ${width} × ${width / 2} recording.`);
  const { raw, source } = candidates[0];
  if (source.height !== width / 2 || source.cells.length !== width * source.height || source.cells.some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) throw new Error(`Invalid probability grid: ${source.id}`);
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
  if (!replayTimeline(run)) throw new Error(`Cannot faithfully replay ${source.id}; no timing or membership will be reconstructed.`);
  const file = width === 64 ? 'recording.json' : `recordings/${width}.json`;
  recordings.push({ width, height: run.height, id: run.id, batchSize: run.batchSize, concurrency: run.concurrency, file });
  provenance.push({ sourceRunId: run.id, width, sourceSha256: createHash('sha256').update(raw).digest('hex'), promptVersion: source.promptVersion, selection: width === 64 ? 'Explicitly selected 64 × 32 recording.' : 'Most recent completed recording at this resolution.' });
  await writeFile(`share/${file}`, JSON.stringify(run));
}
await writeFile('share/catalog.json', JSON.stringify({ defaultWidth: 64, recordings }, null, 2));
await writeFile('share/provenance.json', JSON.stringify({ preparedAt: new Date().toISOString(), recordings: provenance, replay: 'Original per-batch membership and wall-clock arrival times; no regenerated or reshuffled answers.' }, null, 2));
console.log(JSON.stringify({ recordings, output: 'share/catalog.json' }));
