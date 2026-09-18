import type { Run } from './harness-types';

export type ReplayBatch = { indices: number[]; arrived: number; ms: number };

// Playback is derived exclusively from recorded batch membership and arrival
// timestamps. Missing provenance disables playback; never synthesize an order.
export function replayTimeline(run: Run) {
  const origin = Date.parse(run.createdAt);
  if (!Number.isFinite(origin)) return null;
  const times = Array<number>(run.cells.length).fill(Infinity);
  const batches: ReplayBatch[] = [];
  let previous = 0, recorded = 0;
  for (const request of run.requests) {
    if (!request.ok) continue;
    const arrived = Date.parse(request.at) - origin;
    if (!Array.isArray(request.indices) || request.indices.length !== request.points || !Number.isFinite(arrived) || arrived < previous) return null;
    for (const index of request.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= times.length || run.cells[index] === null || times[index] !== Infinity) return null;
      times[index] = arrived;
      recorded++;
    }
    previous = arrived;
    batches.push({ indices: request.indices, arrived, ms: request.ms });
  }
  if (!recorded || recorded !== run.cells.filter(p => p !== null).length) return null;
  // Wall-clock timestamps preserve gaps between requests, including pauses.
  return { times, batches, duration: Math.max(previous, 1), exact: true };
}

// Last response available at this instant, including equal-timestamp arrivals.
// Preserve recording order; the inspector must never expose a future response.
export function replayBatchAt(batches: ReplayBatch[], elapsed: number) {
  let low = 0, high = batches.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (batches[middle].arrived <= elapsed) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function replayCells(run: Run, times: number[], elapsed: number) {
  return run.cells.map((p, index) => times[index] <= elapsed ? p : null);
}
