'use client';

import { useState } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { coordinate } from '@/server/grid.mjs';
import { batchLayout } from '@/lib/batch-layout';
import type { ReplayBatch } from '@/lib/replay';
import type { Run } from '@/lib/harness-types';

export function BatchInspector({ run, batches, position, onStep, disabled }: {
  run: Run; batches: ReplayBatch[]; position: number;
  onStep: (position: number) => void; disabled: boolean;
}) {
  const batch = batches[position];
  const [selected, setSelected] = useState<number | null>(null);
  const index = selected !== null && batch?.indices.includes(selected) ? selected : batch?.indices[0];
  const point = index === undefined ? null : coordinate(index, run.width);
  const probability = index === undefined ? null : run.cells[index];
  // Use actual geographic positions, including holes in older non-tiled batches.
  const layout = batch ? batchLayout(batch.indices, run.width) : null;
  const columns = layout?.columns ?? Math.min(run.width, 2 ** Math.ceil(Math.log2(run.batchSize) / 2));
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(2.1rem, 1fr))`, maxWidth: `${columns * 3.2}rem` };
  const cellStyle = (i: number) => ({ gridColumn: i % run.width - (layout?.left ?? 0) + 1, gridRow: Math.floor(i / run.width) - (layout?.top ?? 0) + 1 });
  const select = (i: number) => setSelected(i);

  return <Card className="min-w-0 gap-0 self-start py-0" aria-label="Recorded batch inspector">
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div><h2 className="text-sm font-medium">Inside a request</h2><p className="mt-1 font-mono text-xs text-muted-foreground">Response {position + 1} / {batches.length}{batch ? ` · +${(batch.arrived / 1000).toFixed(3)}s` : ''}</p></div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous response" disabled={disabled || position <= 0} onClick={() => onStep(position - 1)}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon" aria-label="Next response" disabled={disabled || position >= batches.length - 1} onClick={() => onStep(position + 1)}><ChevronRight /></Button>
      </div>
    </div>
    <CardContent className="space-y-3 p-4">
      <div className="flex justify-between gap-2 text-xs"><span>Input · {batch?.indices.length ?? run.batchSize} coordinates</span><span className="text-muted-foreground">lat / lon (°)</span></div>
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto grid gap-1" style={gridStyle} aria-label="Input coordinate matrix">
          {batch ? batch.indices.map(i => {
            const { lat, lon } = coordinate(i, run.width);
            return <Button key={i} variant="outline" onClick={() => select(i)} aria-pressed={index === i} aria-label={`Coordinate ${i}: latitude ${lat}, longitude ${lon}`} title={`${lat}, ${lon}`} className={`h-10 min-w-0 flex-col gap-0 rounded-sm px-0 font-mono text-[9px] leading-tight sm:text-[10px] ${index === i ? 'border-foreground' : ''}`} style={cellStyle(i)}><span className="sm:hidden">{lat.toFixed(1)}<br /><span className="text-muted-foreground">{lon.toFixed(1)}</span></span><span className="hidden sm:inline">{lat.toFixed(2)}<br /><span className="text-muted-foreground">{lon.toFixed(2)}</span></span></Button>;
          }) : Array.from({ length: run.batchSize }, (_, i) => <div key={i} className="h-10 rounded-sm bg-muted" />)}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 py-1 text-xs">
        <ArrowDown className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">Jev API</span>
        <span className="font-mono text-muted-foreground">{batch ? `${batch.ms.toFixed(1)} ms round trip` : 'Waiting for first response…'}</span>
        <ArrowDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex justify-between gap-2 text-xs"><span>Output · P(land)</span><span className="text-muted-foreground">Green ≥ 0.5 · blue &lt; 0.5</span></div>
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto grid gap-1" style={gridStyle} aria-label="Output probability matrix">
          {batch ? batch.indices.map(i => {
            const p = run.cells[i]!;
            return <Button key={i} variant="ghost" onClick={() => select(i)} aria-pressed={index === i} aria-label={`Coordinate ${i}: probability ${p}, ${p >= .5 ? 'land' : 'water'}`} title={`P(land) = ${p}`} className={`h-8 min-w-0 rounded-sm px-0 font-mono text-[10px] sm:text-xs ${index === i ? 'ring-1 ring-inset ring-white' : ''}`} style={{ ...cellStyle(i), backgroundColor: p >= .5 ? '#a3d283' : '#2868a0', color: p >= .5 ? '#14230c' : '#ffffff' }}>{p.toFixed(3)}</Button>;
          }) : Array.from({ length: run.batchSize }, (_, i) => <div key={i} className="h-8 rounded-sm bg-muted" />)}
        </div>
      </div>
      <div className="min-h-12 border-t pt-3 font-mono text-xs leading-relaxed" aria-label="Exact selected values">
        {point && probability !== null ? <><span className="text-muted-foreground">({point.lat}, {point.lon})</span><br /><span>→ {probability} · {probability >= .5 ? 'land' : 'water'}</span></> : <span className="text-muted-foreground">Answers appear at their recorded arrival time.</span>}
      </div>
    </CardContent>
  </Card>;
}

// A separate overlay keeps the downloaded map free of inspector annotations.
export function BatchOutline({ indices, width, height }: { indices: number[]; width: number; height: number }) {
  const layout = batchLayout(indices, width);
  if (!layout) return null;
  return <svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
    <g fill="none" stroke="white" strokeWidth="1.5">
      {layout.rectangular ? <rect x={layout.left} y={layout.top} width={layout.columns} height={layout.rows} vectorEffect="non-scaling-stroke" /> : indices.map(i => <rect key={i} x={i % width} y={Math.floor(i / width)} width="1" height="1" vectorEffect="non-scaling-stroke" />)}
    </g>
  </svg>;
}
