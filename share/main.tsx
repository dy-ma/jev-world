import { createRoot } from 'react-dom/client';
import ReplayApp from '../components/replay-app';
import '../app/globals.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<ReplayApp />);
