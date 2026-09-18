import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replayTimeline, replayCells } from '../lib/replay.ts';

test('hosted catalog offers one faithful recording at every resolution', async () => {
  const catalog = JSON.parse(await readFile(new URL('../share/catalog.json', import.meta.url), 'utf8'));
  const provenance = JSON.parse(await readFile(new URL('../share/provenance.json', import.meta.url), 'utf8'));
  assert.equal(catalog.defaultWidth, 64);
  assert.deepEqual(catalog.recordings.map(r => r.width), [32,64,128,256,512]);
  for (const entry of catalog.recordings) {
    const raw = await readFile(new URL(`../share/${entry.file}`, import.meta.url), 'utf8');
    const run = JSON.parse(raw), timeline = replayTimeline(run);
    assert.equal(run.id, entry.id);
    assert.equal(run.width, entry.width); assert.equal(run.height, entry.height);
    assert.equal(run.batchSize, entry.batchSize); assert.equal(run.concurrency, entry.concurrency);
    assert.equal(run.completed, run.width * run.height);
    assert.equal(run.status, 'complete'); assert.equal(run.inFlight, 0);
    assert.ok(timeline);
    assert.equal(timeline.batches.length, run.requests.filter(r => r.ok).length);
    assert.deepEqual(replayCells(run, timeline.times, timeline.duration), run.cells);
    assert.ok(provenance.recordings.some(p => p.sourceRunId === run.id));
    assert.ok(!/TYPESAFE_API_KEY|Authorization|Bearer /.test(raw));
  }
});

test('curated share recording has complete faithful replay data and no runtime credentials', async () => {
  const run = JSON.parse(await readFile(new URL('../share/recording.json', import.meta.url), 'utf8'));
  assert.equal(run.id, 'b9144b61-f849-4bd0-979b-080ccf41b4a8');
  assert.equal(run.width, 64); assert.equal(run.height, 32);
  assert.equal(run.completed, 2048); assert.equal(run.elapsedMs, 5806);
  const timeline = replayTimeline(run);
  assert.ok(timeline); assert.equal(timeline.duration, 5805);
  for (const request of run.requests) {
    const elapsed = Date.parse(request.at) - Date.parse(run.createdAt);
    const expected = new Set(run.requests.filter(r => Date.parse(r.at) <= Date.parse(request.at)).flatMap(r => r.indices));
    assert.deepEqual(replayCells(run, timeline.times, elapsed), run.cells.map((p,i) => expected.has(i) ? p : null));
  }
  assert.ok(!/TYPESAFE_API_KEY|Authorization|Bearer /.test(JSON.stringify(run)));
});
