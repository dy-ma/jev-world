'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Download, Globe2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BatchInspector, BatchOutline } from '@/components/batch-inspector';
import { replayTimeline, replayCells, replayBatchAt } from '@/lib/replay';
import type { HarnessState, Run } from '@/lib/harness-types';

export default function EarthApp({ replayOnly = false, recording, replayChoices = [], loadRecording }: {
  replayOnly?: boolean; recording?: Run;
  replayChoices?: { width: number; height: number }[];
  loadRecording?: (width: number) => Promise<Run>;
}) {
  const [state, setState] = useState<HarnessState>({ configured: false, run: replayOnly ? recording ?? null : null });
  const [width, setWidth] = useState(String(recording?.width ?? 64)), [batch, setBatch] = useState('32'), [parallel, setParallel] = useState('2');
  const [mode, setMode] = useState('map'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(replayOnly);
  const [hover, setHover] = useState<number | null>(null);
  const [replayMs, setReplayMs] = useState<number | null>(null);
  const [inspection, setInspection] = useState<{ runId: string; position: number } | null>(null);
  const [playRequested, setPlaying] = useState(false), [speed, setSpeed] = useState('1');
  const canvas = useRef<HTMLCanvasElement>(null);
  const initialized = useRef(replayOnly);
  const run = state.run, columns = run?.width ?? Number(width), rows = columns / 2;
  const timeline = useMemo(() => run ? replayTimeline(run) : null, [run]);
  const replayDuration = timeline?.duration;
  const playing = playRequested && replayDuration !== undefined && (replayMs ?? 0) < replayDuration;
  const cells = useMemo(() => run && timeline && replayMs !== null ? replayCells(run, timeline.times, replayMs) : run?.cells, [run, timeline, replayMs]);
  const batchPosition = timeline ? !playing && inspection && inspection.runId === run?.id ? inspection.position : replayBatchAt(timeline.batches, replayMs ?? Infinity) : -1;
  const inspectedBatch = timeline?.batches[batchPosition];
  function stepBatch(position: number) {
    if (!run || !timeline?.batches[position]) return;
    setPlaying(false);
    setInspection({ runId: run.id, position });
    setReplayMs(timeline.batches[position].arrived);
  }
  const observedState = useRef(state);
  useEffect(() => { observedState.current = state; }, [state]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: 'inspect_jev_map', description: 'Read the current map run, completion, and measured performance. Makes no model calls.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: (input: unknown) => {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
        const current = observedState.current.run;
        return current ? { id: current.id, status: current.status, completed: current.completed, total: current.cells.length, p50: current.p50, p95: current.p95, inputTokens: current.inputTokens } : { status: 'ready' };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, []);
  const active = run?.status === 'running', completed = cells?.filter(p => p !== null).length ?? 0, total = columns * rows;
  useEffect(() => {
    if (!playing || replayDuration === undefined) return;
    const duration = replayDuration;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), delta = (now - previous) * Number(speed);
      previous = now;
      setReplayMs(value => Math.min(duration, (value ?? 0) + delta));
    }, 30);
    return () => clearInterval(timer);
  }, [playing, replayDuration, speed]);
  useEffect(() => {
    if (replayOnly) return;
    let live = true; let timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    const poll = async () => { try { const response = await fetch('/api/harness/state', { signal: controller.signal, cache: 'no-store' }); if (!response.ok) throw new Error(); const data: HarnessState = await response.json(); if (live) { setState(data); setConnected(true); if (!initialized.current) { initialized.current = true; if (data.run) { setWidth(String(data.run.width)); setBatch(String(data.run.batchSize)); setParallel(String(data.run.concurrency)); } } } } catch { if (live) setConnected(false); } if (live) timer = setTimeout(poll, 500); };
    void poll(); return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [replayOnly]);
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d'); if (!el || !ctx) return;
    el.width = columns * 4; el.height = rows * 4;
    ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, el.width, el.height);
    for (let i = 0; i < total; i++) {
      const p = cells?.[i];
      if (p === null || p === undefined) ctx.fillStyle = '#242427';
      else if (mode === 'probability') { const water = [40, 104, 160], land = [163, 210, 131]; ctx.fillStyle = `rgb(${water.map((n, j) => Math.round(n + (land[j] - n) * p)).join(',')})`; }
      else ctx.fillStyle = p >= .5 ? '#a3d283' : '#2868a0';
      ctx.fillRect(i % columns * 4, Math.floor(i / columns) * 4, columns <= 64 ? 3.75 : 4, columns <= 64 ? 3.75 : 4);
    }
  }, [cells, columns, rows, total, mode]);
  async function act(action: string, selectedWidth?: string, fresh = false) {
    if (replayOnly) return;
    setBusy(true); setError(''); setPlaying(false); setReplayMs(null); setInspection(null);
    try { const response = await fetch(`/api/harness/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'start' ? { width: Number(width), batchSize: Number(batch), concurrency: Number(parallel), fresh } : action === 'select' ? { width: Number(selectedWidth) } : {}) }); const data = await response.json() as HarnessState & { error?: string }; if (!response.ok) throw new Error(data.error); setState(data); setHover(null); if (action === 'select' && selectedWidth) setWidth(selectedWidth); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); }
  }
  async function selectResolution(value: string) {
    if (!replayOnly) return act('select', value);
    if (!loadRecording) return;
    setBusy(true); setError(''); setPlaying(false); setReplayMs(null); setInspection(null); setHover(null);
    try {
      const selected = await loadRecording(Number(value));
      setState({ configured: false, run: selected });
      setWidth(String(selected.width)); setBatch(String(selected.batchSize)); setParallel(String(selected.concurrency));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load recording.'); }
    finally { setBusy(false); }
  }
  function download(kind: 'png' | 'json') {
    if (!run) return;
    const a = document.createElement('a'); a.download = `jev-earth-${run.width}x${run.height}-${run.id.slice(0, 8)}.${kind}`;
    if (kind === 'png') a.href = canvas.current!.toDataURL('image/png'); else a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
    a.click(); if (kind === 'json') setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const p = hover !== null ? cells?.[hover] : null;
  return <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-8">
    <header className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Globe2 className="size-5 text-muted-foreground" /><h1 className="text-xl font-semibold tracking-tight">Jev draws Earth</h1></div></header>
    <div className="flex flex-wrap items-end gap-4">
      <Setting label="Resolution" value={width} onChange={value => void selectResolution(value)} disabled={active || busy || !connected || !!run?.inFlight} choices={replayOnly ? replayChoices.map(r => [String(r.width), `${r.width} × ${r.height}`]) : [32,64,128,256,512].map(n => [String(n), `${n} × ${n / 2}`])} />
      {timeline && !active && <Setting label="Replay speed" value={speed} onChange={setSpeed} disabled={busy} choices={['0.25', '1', '4'].map(n => [n, `${n}×`])} />}
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {active ? <Button onClick={() => void act('pause')} disabled={busy}><Pause />Pause</Button> : <>
          {timeline && !!run?.completed && <Button onClick={() => { if (playing) setPlaying(false); else { setInspection(null); if (replayMs === null || replayMs >= (timeline?.duration ?? 0)) setReplayMs(0); setPlaying(true); } }} disabled={busy}>{playing ? <Pause /> : <Play />}{playing ? 'Pause replay' : 'Replay'}</Button>}
          {!replayOnly && run?.status === 'paused' && <Button variant="outline" onClick={() => void act('resume')} disabled={busy || !!run.inFlight || !connected || !state.configured}>Resume generation</Button>}
          {!replayOnly && <Button variant={run ? 'outline' : 'default'} onClick={() => void act('start', undefined, true)} disabled={busy || !!run?.inFlight || !state.configured || !connected}><Play />{run ? 'New benchmark' : 'Run benchmark'}</Button>}
        </>}
      </div>
    </div>
    {run && !active && !!run.completed && !timeline && <p className="text-xs text-muted-foreground">Replay unavailable: this recording lacks block arrival data.</p>}
    {!replayOnly && !active && <Collapsible><CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>Generation settings</CollapsibleTrigger><CollapsibleContent><div className="flex flex-wrap gap-4 py-3">
      <Setting label="Blocks per request" value={batch} onChange={setBatch} disabled={busy} choices={[1,8,32,64].map(n => [String(n), String(n)])} />
      <Setting label="Parallel requests" value={parallel} onChange={setParallel} disabled={busy} choices={[1,2,4,8].map(n => [String(n), String(n)])} />
    </div></CollapsibleContent></Collapsible>}
    {(error || run?.message || !connected) && <Alert><AlertDescription>{error || run?.message || 'Connecting to the local harness…'}</AlertDescription></Alert>}
    <div className={`grid items-start gap-4 ${timeline ? 'xl:grid-cols-[minmax(0,1fr)_28rem]' : ''}`}>
    <Card className="min-w-0 gap-0 py-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><Tabs value={mode} onValueChange={v => setMode(String(v))}><TabsList><TabsTrigger value="map">Land / water</TabsTrigger><TabsTrigger value="probability">Probability</TabsTrigger></TabsList></Tabs><div className="flex items-center gap-4 text-xs text-muted-foreground"><span><i className="mr-1.5 inline-block size-2 rounded-sm bg-[#a3d283]" />Land</span><span><i className="mr-1.5 inline-block size-2 rounded-sm bg-[#2868a0]" />Water</span><span><i className="mr-1.5 inline-block size-2 rounded-sm bg-[#55555c]" />Unanswered</span></div></div>
      <CardContent className="px-4 py-4 sm:px-6"><div className="mb-2 flex justify-between font-mono text-xs text-muted-foreground"><span>180° W</span><span>90° N</span><span>180° E</span></div><div className="relative"><canvas ref={canvas} className="aspect-2/1 w-full cursor-crosshair rounded-sm [image-rendering:pixelated]" aria-label={`Map of ${completed} answered geographic coordinates out of ${total}. Land is green, water is blue, unanswered blocks are gray.`} onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.min(columns - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * columns))), y = Math.min(rows - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * rows))); setHover(y * columns + x); }} onPointerLeave={() => setHover(null)} />{inspectedBatch && <BatchOutline indices={inspectedBatch.indices} width={columns} height={rows} />}</div>
      <div className="mt-2 flex min-h-5 justify-between gap-2 font-mono text-xs text-muted-foreground"><span>{hover !== null ? `${(90 - (Math.floor(hover / columns) + .5) * 180 / rows).toFixed(3)}°, ${(-180 + (hover % columns + .5) * 360 / columns).toFixed(3)}°` : 'Coordinates'}</span><span>{hover !== null && p !== null && p !== undefined ? `P(land) ${(p * 100).toFixed(1)}%` : '90° S'}</span></div></CardContent>
      <div className="border-t px-4 py-3"><div className="mb-2 flex justify-between gap-2 text-sm"><span>{completed.toLocaleString()} / {total.toLocaleString()} blocks</span><span className="text-muted-foreground">{timeline && replayMs !== null ? `${playing ? 'Replaying' : replayMs >= (timeline?.duration ?? 0) ? 'Replay complete' : 'Replay paused'} · ${(replayMs / 1000).toFixed(2)}s / ${((timeline?.duration ?? 0) / 1000).toFixed(2)}s` : run?.status === 'complete' ? 'Complete' : active ? 'Drawing…' : run?.status === 'paused' ? 'Paused' : 'Ready'} · {(completed / total * 100).toFixed(1)}%</span></div><Progress value={completed / total * 100} aria-label="Map completion" /></div>
    </Card>
    {run && timeline && <BatchInspector key={run.id} run={run} batches={timeline.batches} position={batchPosition} onStep={stepBatch} disabled={!!active || busy} />}
    </div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Metric label="Blocks / second" value={run?.elapsedMs ? (run.completed / (run.elapsedMs / 1000)).toFixed(1) : '—'} /><Metric label="Request p50 / p95" value={run?.p50 != null ? `${Math.round(run.p50)} / ${Math.round(run.p95!)} ms` : '—'} /><Metric label="Requests" value={run ? `${run.requests.filter(r => r.ok).length} done · ${run.inFlight} active` : '—'} /><Metric label="Input tokens" value={run ? run.inputTokens.toLocaleString() : '—'} /></div>
    <footer className="flex items-center justify-between gap-2"><Button variant="ghost" nativeButton={false} render={<a href="https://github.com/dy-ma/jev-world" target="_blank" rel="noopener noreferrer" />}><Code2 />Source</Button><div className="flex gap-2"><Button variant="outline" onClick={() => download('png')} disabled={!completed}><Download />PNG</Button><Button variant="ghost" onClick={() => download('json')} disabled={!run}>JSON</Button></div></footer>
  </main>;
}
function Setting({ label, value, onChange, choices, disabled }: { label: string; value: string; onChange: (v: string) => void; choices: string[][]; disabled: boolean }) { return <div className="grid gap-2"><Label>{label}</Label><Select value={value} onValueChange={v => { if (v !== null) onChange(v); }} disabled={disabled}><SelectTrigger aria-label={label} className="min-w-32"><SelectValue>{choices.find(c => c[0] === value)?.[1]}</SelectValue></SelectTrigger><SelectContent>{choices.map(([v, name]) => <SelectItem key={v} value={v}>{name}</SelectItem>)}</SelectContent></Select></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="mb-1 text-sm text-muted-foreground">{label}</p><p className="font-mono text-lg tracking-tight">{value}</p></div>; }
