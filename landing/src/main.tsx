import { hydrateRoot } from 'react-dom/client';
import './index.css';
import { RootBoundary } from './components/RootBoundary';
import { LandingPage } from './pages/LandingPage';

// The HTML is pre-rendered (build: scripts/prerender.mjs, dev: vite.config.ts); React only attaches to it.
// The boundary adds no markup, so server and client trees still match; its fallback is this same HTML.
const root = document.getElementById('root')!;
hydrateRoot(root, <RootBoundary fallbackHtml={root.innerHTML}><LandingPage /></RootBoundary>);
