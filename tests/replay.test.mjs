import test from 'node:test';
import assert from 'node:assert/strict';
import { replayTimeline, replayCells } from '../lib/replay.ts';
const createdAt = '2026-09-17T00:00:00.000Z';
const at = ms => new Date(Date.parse(createdAt) + ms).toISOString();

test('replay uses recorded response membership and arrival order, not dispatch or tile order', () => {
  const run = { createdAt, cells: [.1, .9, .2, .8], elapsedMs: 250, requests: [
    { ok: true, indices: [1,3], at: at(80), points: 2 },
    { ok: true, indices: [0,2], at: at(220), points: 2 },
  ] };
  const timeline = replayTimeline(run);
  assert.equal(timeline.exact, true);
  assert.deepEqual(replayCells(run, timeline.times, 0), [null,null,null,null]);
  assert.deepEqual(replayCells(run, timeline.times, 80), [null,.9,null,.8]);
  assert.deepEqual(replayCells(run, timeline.times, 220), run.cells);
  assert.deepEqual(replayCells(run, timeline.times, 20), [null,null,null,null]);
});

test('old recordings cannot be replayed from request durations alone', () => {
  const run = { createdAt, cells: [.1,.2,.3,.4], elapsedMs: 100, requests: [
    { ok: true, ms: 50, at: at(50), points: 2 },
    { ok: true, ms: 100, at: at(100), points: 2 },
  ] };
  assert.equal(replayTimeline(run), null);
});

test('recorded pause gaps are preserved instead of being compressed', () => {
  const run = { createdAt, cells: [.1,.9], elapsedMs: 100, requests: [
    { ok: true, indices: [0], at: at(50), points: 1 },
    { ok: true, indices: [1], at: at(10100), points: 1 },
  ] };
  const timeline = replayTimeline(run);
  assert.equal(timeline.duration, 10100);
  assert.deepEqual(replayCells(run, timeline.times, 10000), [.1,null]);
  assert.deepEqual(replayCells(run, timeline.times, 10100), run.cells);
});

test('incomplete or inconsistent provenance disables replay', () => {
  const base = { createdAt, cells: [.1,.9], elapsedMs: 100 };
  for (const requests of [
    [{ ok: true, indices: [0], at: at(50), points: 1 }],
    [{ ok: true, indices: [0,0], at: at(50), points: 2 }],
    [{ ok: true, indices: [0,1], at: 'invalid', points: 2 }],
    [{ ok: true, indices: [0,2], at: at(50), points: 2 }],
    [{ ok: true, indices: [0], at: at(60), points: 1 }, { ok: true, indices: [1], at: at(50), points: 1 }],
  ]) assert.equal(replayTimeline({ ...base, requests }), null);
});

test('largest resolution and paused recordings retain unanswered cells', () => {
  const cells = Array(131072).fill(null); cells[131071] = .9;
  const run = { createdAt, cells, elapsedMs: 40, requests: [{ ok: true, indices: [131071], at: at(35), points: 1 }] };
  const timeline = replayTimeline(run);
  assert.equal(timeline.duration, 35);
  assert.deepEqual(replayCells(run, timeline.times, 40), cells);
});
