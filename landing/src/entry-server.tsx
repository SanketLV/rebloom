import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { LandingPage } from './pages/LandingPage';
import { PrivacyPage } from './pages/PrivacyPage';

export type Page = 'index' | 'privacy';

// index hydrates in the browser; privacy ships no JS, so it gets plain markup.
export const render = (page: Page) =>
  page === 'privacy' ? renderToStaticMarkup(<PrivacyPage />) : renderToString(<LandingPage />);
