import { hydrateRoot } from 'react-dom/client';
import './index.css';
import { LandingPage } from './pages/LandingPage';

// The HTML is pre-rendered (build: scripts/prerender.mjs, dev: vite.config.ts); React only attaches to it.
hydrateRoot(document.getElementById('root')!, <LandingPage />);
