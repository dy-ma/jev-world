import EarthApp from '@/components/earth-app';
import { isReplayOnly } from '@/lib/mode.mjs';
import recording from '@/share/recording.json';
import type { Run } from '@/lib/harness-types';

export default function Home() {
  const replayOnly = isReplayOnly();
  return <EarthApp replayOnly={replayOnly} recording={replayOnly ? recording as Run : undefined} />;
}
