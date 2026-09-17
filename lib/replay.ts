import type { Run } from './harness-types';

// Playback is derived exclusively from recorded batch membership and arrival
// timestamps. Missing provenance disables playback; never synthesize an order.
export function replayTimeline(run: Run) {
  const origin = Date.parse(run.createdAt);
  if (!Number.isFinite(origin)) return null;
  const times = Array<number>(run.cells.length).fill(Infinity);
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
  }
  if (!recorded || recorded !== run.cells.filter(p => p !== null).length) return null;
  // Wall-clock timestamps preserve gaps between requests, including pauses.
  return { times, duration: Math.max(previous, 1), exact: true };
}

export function replayCells(run: Run, times: number[], elapsed: number) {
  return run.cells.map((p, index) => times[index] <= elapsed ? p : null);
}
