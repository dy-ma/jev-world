import { createRoot } from 'react-dom/client';
import EarthApp from '../components/earth-app';
import recording from './recording.json';
import type { Run } from '../lib/harness-types';
import '../app/globals.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<EarthApp replayOnly recording={recording as Run} />);
