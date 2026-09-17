import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isReplayOnly, buildMode } from '../lib/mode.mjs';
import { Harness } from '../server/harness.mjs';

test('replay flag is explicit and Vercel cannot accidentally build live mode', () => {
  assert.equal(isReplayOnly({}), false);
  assert.equal(isReplayOnly({REPLAY_ONLY:'true'}), true);
  assert.equal(isReplayOnly({REPLAY_ONLY:'false'}), false);
  assert.throws(() => isReplayOnly({REPLAY_ONLY:'ture'}));
  assert.equal(buildMode({}), 'live');
  assert.equal(buildMode({VERCEL:'1',REPLAY_ONLY:'true'}), 'replay');
  assert.throws(() => buildMode({VERCEL:'1'}), /REPLAY_ONLY=true/);
  assert.throws(() => buildMode({VERCEL:'1',REPLAY_ONLY:'false'}), /REPLAY_ONLY=true/);
});

test('replay-only harness rejects generation even with a valid key and direct method access', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-readonly-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const harness = new Harness({ key: 'fake-test-key', directory, replayOnly: true, fetcher: async () => { calls++; throw new Error('Must not fetch'); } });
  await harness.init();
  await assert.rejects(harness.start({width:32,batchSize:32,concurrency:2}), /replay-only/);
  await assert.rejects(harness.resume(), /replay-only/);
  assert.equal(calls, 0);
});
