import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Harness } from '../server/harness.mjs';
import { coordinate, sampleOrder, buildRequest, decodeResponse } from '../server/grid.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function fixture(t, fetcher) {
  const directory = await mkdtemp(join(tmpdir(), 'jev-test-'));
  const h = new Harness({ key: 'test-key-never-sent', directory, fetcher }); await h.init();
  t.after(async () => { await h.pause(); await h.workers; await rm(directory, { recursive: true, force: true }); });
  return h;
}
function responseFor(options) { const q = JSON.parse(options.body).questions; return new Response(JSON.stringify({ model: 'test-model', answers: Object.fromEntries(Object.keys(q).map((k,i) => [k, { type: 'noul', noul: i % 2 ? .9 : .1 }])), usage: { input_tokens: 100, output_tokens: 0 } }), { status: 200 }); }

test('grid visits every center exactly once without sampling poles or duplicate meridian', () => {
  for (const width of [32,64,128,256,512]) { const order=sampleOrder(width); assert.equal(new Set(order).size,width*width/2); assert.ok(order.every(i => i >= 0 && i < width*width/2)); }
  assert.deepEqual(coordinate(0,32),{lat:84.375,lon:-174.375});
  assert.deepEqual(coordinate(511,32),{lat:-84.375,lon:174.375});
  assert.match(buildRequest([0],32).questions.p0.instructions,/84.375/);
});
test('every request-sized group covers a compact tile at every supported resolution', () => {
  for (const width of [32,64,128,256,512]) {
    for (const batchSize of [1,8,32,64]) {
      const order = sampleOrder(width, batchSize);
      assert.equal(order.length, width * width / 2);
      assert.equal(new Set(order).size, order.length);
      for (let start = 0; start < order.length; start += batchSize) {
        const indices = order.slice(start, start + batchSize);
        const xs = indices.map(i => i % width), ys = indices.map(i => Math.floor(i / width));
        assert.equal(Math.max(...xs) - Math.min(...xs) + 1, 2 ** Math.ceil(Math.log2(batchSize) / 2));
        assert.equal(Math.max(...ys) - Math.min(...ys) + 1, 2 ** Math.floor(Math.log2(batchSize) / 2));
      }
    }
  }
});
test('invalid or missing probabilities reject the entire batch', () => {
  assert.throws(() => decodeResponse({answers:{p0:{type:'noul',noul:1.1}}},[0]));
  assert.throws(() => decodeResponse({answers:{}},[0]));
  assert.deepEqual(decodeResponse({answers:{p0:{type:'noul',noul:0}}},[0]),[{index:0,probability:0}]);
});
test('bounded workers persist all results and restore without making requests', async t => {
  let active=0,peak=0,calls=0;
  const h=await fixture(t,async (_,options) => { active++; peak=Math.max(peak,active); calls++; await wait(3); active--; return responseFor(options); });
  await h.start({width:32,batchSize:32,concurrency:2}); await h.workers;
  assert.equal(h.run.status,'complete'); assert.equal(h.snapshot().run.completed,512); assert.equal(calls,16); assert.equal(peak,2); assert.equal(h.run.inputTokens,1600);
  const restored=new Harness({key:'test-key-never-sent',directory:h.directory,fetcher:()=>{throw new Error('must not call')}}); await restored.init();
  assert.equal(restored.snapshot().run.completed,512); assert.ok(restored.snapshot().run.elapsedMs>0); assert.equal(restored.run.status,'complete');
  assert.ok(!JSON.stringify(h.snapshot()).includes('test-key-never-sent'));
});
test('pause aborts outstanding work, rejects late answers, and resume fills only missing points', async t => {
  const h=await fixture(t,async (_,options) => { await wait(20); return responseFor(options); });
  await h.start({width:32,batchSize:64,concurrency:2}); await h.pause(); await h.workers;
  assert.equal(h.run.status,'paused'); assert.equal(h.snapshot().run.completed,0); assert.equal(h.controllers.size,0);
  await h.resume(); await h.workers; assert.equal(h.snapshot().run.completed,512);
});
test('rate limits pause rather than silently retrying or filling fake pixels', async t => {
  let calls=0;
  const h=await fixture(t,async()=>{calls++;return new Response('{}',{status:429});});
  await h.start({width:32,batchSize:32,concurrency:1}); await h.workers;
  assert.equal(calls,1); assert.equal(h.run.status,'paused'); assert.equal(h.snapshot().run.completed,0); assert.match(h.run.message,/rate-limiting/);
});
test('invalid settings and overlapping runs are rejected before more requests', async t => {
  const h=await fixture(t,async (_,options)=>{await wait(20);return responseFor(options)});
  await assert.rejects(h.start({width:400,batchSize:32,concurrency:2}),/Invalid/);
  await h.start({width:32,batchSize:32,concurrency:1}); await assert.rejects(h.start({width:32}),/Pause/); await h.pause(); await h.workers;
});
test('new runs preserve previous maps; loading restores answers and timing without billing', async t => {
  let calls = 0;
  const h = await fixture(t, async (_, options) => { calls++; return responseFor(options); });
  await h.start({ width: 32, batchSize: 64, concurrency: 2 }); await h.workers;
  const first = h.snapshot().run;
  const firstFile = await readFile(join(h.directory, `${first.id}.json`), 'utf8');
  await h.start({ width: 64, batchSize: 64, concurrency: 2 }); await h.workers;
  const second = h.snapshot().run;
  const secondFile = await readFile(join(h.directory, `${second.id}.json`), 'utf8');
  assert.equal(await readFile(join(h.directory, `${first.id}.json`), 'utf8'), firstFile);
  const beforeLoad = calls;
  assert.equal((await h.listRuns()).length, 2);
  await h.load(first.id);
  assert.deepEqual(h.snapshot().run, first);
  assert.equal(calls, beforeLoad);
  assert.equal(await readFile(join(h.directory, `${second.id}.json`), 'utf8'), secondFile);
  const restored = new Harness({ directory: h.directory, fetcher: () => { throw new Error('must not call'); } });
  await restored.init();
  assert.deepEqual(restored.snapshot().run, first);
  await h.load(second.id);
  assert.deepEqual(h.snapshot().run, second);
  assert.equal(calls, beforeLoad);
});
test('invalid, missing, or active-run loads cannot replace the current map', async t => {
  const h = await fixture(t, async (_, options) => { await wait(10); return responseFor(options); });
  await h.start({ width: 32, batchSize: 64, concurrency: 1 }); await h.workers;
  const firstId = h.run.id;
  await h.start({ width: 32, batchSize: 64, concurrency: 1, fresh: true });
  const secondId = h.run.id;
  await assert.rejects(h.load(firstId), /Pause/);
  await h.pause(); await h.workers;
  await assert.rejects(h.load('../latest'), /Invalid/);
  await assert.rejects(h.load('00000000-0000-0000-0000-000000000000'), /could not be loaded/);
  assert.equal(h.run.id, secondId);
  await h.load(firstId);
  await h.load(secondId);
  assert.equal(h.run.status, 'paused');
  await h.resume(); await h.workers;
  assert.equal(h.snapshot().run.completed, 512);
});

test('resolution cache ignores execution settings and reopens maps without model calls', async t => {
  let calls = 0;
  const h = await fixture(t, async (_, options) => { calls++; return responseFor(options); });
  await h.start({ width: 32, batchSize: 64, concurrency: 1 }); await h.workers;
  const first = h.snapshot().run;
  const before = calls;
  await h.select(64); assert.equal(h.run, null);
  await h.select(32); assert.deepEqual(h.snapshot().run, first);
  await h.start({ width: 32, batchSize: 1, concurrency: 8 });
  assert.equal(h.run.id, first.id); assert.equal(calls, before);
  assert.equal((await h.listRuns()).length, 1);
  assert.ok(h.run.requests.every(r => r.indices.length === r.points && r.completedAtMs >= r.startedAtMs));
});

test('recorded batches match actual dispatched coordinates even when responses arrive out of order', async t => {
  const sent = [];
  const h = await fixture(t, async (_, options) => {
    const indices = Object.keys(JSON.parse(options.body).questions).map(key => Number(key.slice(1)));
    sent.push(indices);
    await wait(sent.length === 1 ? 40 : 2);
    return responseFor(options);
  });
  await h.start({ width: 32, batchSize: 64, concurrency: 2 }); await h.workers;
  assert.deepEqual(h.run.requests[0].indices, sent[1]);
  assert.deepEqual(h.run.requests.flatMap(r => r.indices).sort((a,b) => a-b), Array.from({length:512}, (_,i) => i));
  for (const request of h.run.requests) assert.ok(sent.some(indices => JSON.stringify(indices) === JSON.stringify(request.indices)));
  const disk = JSON.parse(await readFile(join(h.directory, `${h.run.id}.json`), 'utf8'));
  assert.deepEqual(disk.requests, h.run.requests);
  const { replayTimeline, replayCells } = await import('../lib/replay.ts');
  const run = h.snapshot().run, timeline = replayTimeline(run);
  assert.ok(timeline);
  for (const request of run.requests) {
    const elapsed = Date.parse(request.at) - Date.parse(run.createdAt);
    const visible = replayCells(run, timeline.times, elapsed);
    const arrived = new Set(run.requests.filter(r => Date.parse(r.at) <= Date.parse(request.at)).flatMap(r => r.indices));
    assert.deepEqual(visible, run.cells.map((p,i) => arrived.has(i) ? p : null));
  }
});
