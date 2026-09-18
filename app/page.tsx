import EarthApp from '@/components/earth-app';
import ReplayApp from '@/components/replay-app';
import { isReplayOnly } from '@/lib/mode.mjs';

export default function Home() {
  return isReplayOnly() ? <ReplayApp /> : <EarthApp />;
}
