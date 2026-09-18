'use client';

import EarthApp from '@/components/earth-app';
import recording from '@/share/recording.json';
import catalog from '@/share/catalog.json';
import { loadRecording } from '@/share/recordings';
import type { Run } from '@/lib/harness-types';

export default function ReplayApp() {
  return <EarthApp replayOnly recording={recording as Run} replayChoices={catalog.recordings} loadRecording={loadRecording} />;
}
