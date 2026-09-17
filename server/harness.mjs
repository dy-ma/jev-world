import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { WIDTHS, buildRequest, decodeResponse, sampleOrder, percentile } from './grid.mjs';
import { isReplayOnly } from '../lib/mode.mjs';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class Harness {
  constructor({ key, directory, fetcher = fetch, model = 'jev-latest', replayOnly = isReplayOnly() }) {
    this.replayOnly = replayOnly;
    this.key = key; this.directory = directory; this.fetcher = fetcher; this.model = model;
    this.run = null; this.controllers = new Set(); this.claimed = new Set(); this.pendingWrites = Promise.resolve(); this.generation = 0;
  }
  async init() {
    await mkdir(this.directory, { recursive: true });
    try {
      const id = (await readFile(resolve(this.directory, 'latest'), 'utf8')).trim();
      if (!/^[a-f0-9-]+$/.test(id)) throw new Error('Invalid saved run identifier.');
      this.run = JSON.parse(await readFile(resolve(this.directory, `${id}.json`), 'utf8'));
      if (this.run.status === 'running') { this.run.status = 'paused'; this.run.message = 'Server restarted. Resume to continue the saved run.'; }
      this.run.activeSince = null;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  async save() {
    if (!this.run) return;
    const current = this.snapshot();
    const data = JSON.stringify({ ...this.run, activeMs: current.run.elapsedMs, activeSince: null });
    const id = this.run.id;
    this.pendingWrites = this.pendingWrites.catch(() => {}).then(async () => {
      const path = resolve(this.directory, `${id}.json`);
      await writeFile(`${path}.tmp`, data, { mode: 0o600 }); await rename(`${path}.tmp`, path);
      await writeFile(resolve(this.directory, 'latest.tmp'), id); await rename(resolve(this.directory, 'latest.tmp'), resolve(this.directory, 'latest'));
    });
    return this.pendingWrites;
  }
  async listRuns() {
    await this.pendingWrites;
    const files = (await readdir(this.directory)).filter(name => name.endsWith('.json') && RUN_ID.test(name.slice(0, -5)));
    const runs = await Promise.all(files.map(async name => {
      const saved = JSON.parse(await readFile(resolve(this.directory, name), 'utf8'));
      const r = saved.id === this.run?.id ? this.run : saved;
      return { id: r.id, width: r.width, height: r.height, model: r.model, promptVersion: r.promptVersion, createdAt: r.createdAt, status: r.status === 'running' && r !== this.run ? 'paused' : r.status, completed: r.cells.filter(p => p !== null).length };
    }));
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async load(id) {
    if (typeof id !== 'string' || !RUN_ID.test(id)) throw new Error('Invalid saved run identifier.');
    if (this.run?.status === 'running' || this.controllers.size) throw new Error('Pause the current run and wait for active requests to finish.');
    if (id === this.run?.id) return;
    await this.save();
    let saved;
    try { saved = JSON.parse(await readFile(resolve(this.directory, `${id}.json`), 'utf8')); }
    catch { throw new Error('Saved run could not be loaded. The current run is unchanged.'); }
    if (saved.id !== id || !WIDTHS.includes(saved.width) || !Array.isArray(saved.cells) || saved.cells.length !== saved.width * saved.width / 2 || !Array.isArray(saved.requests)) throw new Error('Invalid saved run. The current run is unchanged.');
    if (saved.status === 'running') { saved.status = 'paused'; saved.message = 'Saved run restored. Resume to continue.'; }
    saved.activeSince = null;
    this.generation++;
    this.claimed.clear();
    this.run = saved;
    await this.save();
  }
  snapshot() {
    if (!this.run) return { configured: !!this.key, run: null };
    const r = this.run, elapsedMs = r.activeMs + (r.activeSince ? Date.now() - r.activeSince : 0);
    const timings = r.requests.filter(q => q.ok).map(q => q.ms);
    return { configured: !!this.key, run: { ...r, activeSince: undefined, elapsedMs, inFlight: this.controllers.size, completed: r.cells.filter(p => p !== null).length, p50: percentile(timings, .5), p95: percentile(timings, .95) } };
  }
  async cachedRun(width) {
    const matches = (await this.listRuns()).filter(r => r.width === width && r.model === this.model && r.promptVersion === 1);
    return matches.find(r => r.status === 'complete') ?? matches[0];
  }
  async select(width) {
    if (!WIDTHS.includes(width)) throw new Error('Invalid resolution.');
    if (this.run?.status === 'running' || this.controllers.size) throw new Error('Pause the current run and wait for active requests to finish.');
    const cached = await this.cachedRun(width);
    if (cached) await this.load(cached.id);
    else { await this.save(); this.run = null; }
  }
  async start(config) {
    if (this.replayOnly) throw new Error('Live generation is disabled in replay-only mode.');
    if (this.run?.status === 'running' || this.controllers.size) throw new Error('Pause the current run and wait for active requests to finish.');
    const { width = 64, batchSize = 32, concurrency = 2 } = config;
    if (!WIDTHS.includes(width) || ![1, 8, 32, 64].includes(batchSize) || ![1, 2, 4, 8].includes(concurrency)) throw new Error('Invalid run settings.');
    if (!config.fresh) {
      const cached = await this.cachedRun(width);
      if (cached) { await this.load(cached.id); return; }
    }
    if (!this.key) throw new Error('Add TYPESAFE_API_KEY to .env and restart the server.');
    this.generation++;
    this.run = { id: randomUUID(), width, height: width / 2, batchSize, concurrency, model: this.model, resolvedModel: null, status: 'paused', createdAt: new Date().toISOString(), activeMs: 0, activeSince: null, cells: Array(width * width / 2).fill(null), requests: [], inputTokens: 0, outputTokens: 0, message: null, promptVersion: 1 };
    await this.save(); await this.resume();
  }
  async pause(message = null) {
    if (!this.run) return;
    this.generation++;
    if (this.run.activeSince) this.run.activeMs += Date.now() - this.run.activeSince;
    this.run.activeSince = null;
    if (this.run.status !== 'complete') this.run.status = 'paused';
    this.run.message = message;
    for (const controller of this.controllers) controller.abort();
    await this.save();
  }
  async resume() {
    if (this.replayOnly) throw new Error('Live generation is disabled in replay-only mode.');
    if (!this.run || this.run.status === 'complete') throw new Error('No unfinished run to resume.');
    if (this.run.status === 'running') return;
    if (this.controllers.size) throw new Error('Previous requests are still stopping. Try again shortly.');
    if (!this.key) throw new Error('Add TYPESAFE_API_KEY to .env and restart the server.');
    this.claimed.clear(); this.run.status = 'running'; this.run.message = null; this.run.activeSince = Date.now();
    const generation = ++this.generation;
    await this.save();
    this.workers = Promise.all(Array.from({ length: this.run.concurrency }, () => this.worker(generation))).then(async () => {
      if (generation === this.generation && this.run.status === 'running') {
        this.run.activeMs += Date.now() - this.run.activeSince; this.run.activeSince = null;
        this.run.status = this.run.cells.every(p => p !== null) ? 'complete' : 'paused';
        await this.save();
      }
    }).catch(async () => { await this.pause('Could not save the run. Check available disk space before resuming.').catch(() => {}); });
  }
  async worker(generation) {
    const run = this.run, order = sampleOrder(run.width, run.batchSize);
    while (generation === this.generation && run.status === 'running') {
      const indices = [];
      for (let start = 0; start < order.length; start += run.batchSize) {
        for (const i of order.slice(start, start + run.batchSize)) {
          if (run.cells[i] === null && !this.claimed.has(i)) { this.claimed.add(i); indices.push(i); }
        }
        if (indices.length) break;
      }
      if (!indices.length) return;
      const controller = new AbortController(); this.controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), 30000);
      const started = performance.now();
      const startedAtMs = run.activeMs + Date.now() - run.activeSince;
      try {
        const response = await this.fetcher('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequest(indices, run.width, run.model)), signal: controller.signal });
        if (!response.ok) {
          const error = new Error(response.status === 401 ? 'TypeSafe rejected the API key.' : response.status === 429 || response.status === 529 ? 'TypeSafe is rate-limiting requests. Wait, then resume with a fresh request.' : `TypeSafe returned HTTP ${response.status}.`);
          throw error;
        }
        const body = await response.json();
        const cells = decodeResponse(body, indices);
        if (generation !== this.generation) return;
        cells.forEach(({ index, probability }) => { run.cells[index] = probability; });
        run.resolvedModel = typeof body.model === 'string' ? body.model : run.model;
        run.inputTokens += Number.isSafeInteger(body.usage?.input_tokens) && body.usage.input_tokens >= 0 ? body.usage.input_tokens : 0;
        run.outputTokens += Number.isSafeInteger(body.usage?.output_tokens) && body.usage.output_tokens >= 0 ? body.usage.output_tokens : 0;
        run.requests.push({ ms: performance.now() - started, points: indices.length, indices, startedAtMs, completedAtMs: run.activeMs + Date.now() - run.activeSince, ok: true, at: new Date().toISOString() });
        await this.save();
      } catch (error) {
        if (generation === this.generation) {
          run.requests.push({ ms: performance.now() - started, points: indices.length, ok: false, at: new Date().toISOString() });
          // No automatic retry: retries can be billed and must not form a runaway loop.
          await this.pause(error.name === 'AbortError' || controller.signal.aborted ? 'Request timed out. Resume to retry unfinished blocks.' : error.message.startsWith('TypeSafe') || error.message.startsWith('Jev') ? error.message : 'Could not reach Jev. Check the connection, then resume.');
        }
        return;
      } finally { clearTimeout(timeout); this.controllers.delete(controller); indices.forEach(i => this.claimed.delete(i)); }
    }
  }
}
