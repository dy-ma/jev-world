import type { Run } from '../lib/harness-types';
import defaultRecording from './recording.json';

// Separate static chunks keep the larger maps out of the initial 64 × 32 load.
// Imports use script-src 'self'; no API or fetch permission is needed.
const loaders = {
  32: () => import('./recordings/32.json'),
  64: () => Promise.resolve({ default: defaultRecording }),
  128: () => import('./recordings/128.json'),
  256: () => import('./recordings/256.json'),
  512: () => import('./recordings/512.json'),
};

export async function loadRecording(width: number): Promise<Run> {
  const load = loaders[width as keyof typeof loaders];
  if (!load) throw new Error('No recording for this resolution.');
  return (await load()).default as Run;
}
