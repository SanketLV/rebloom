/// <reference types="vitest/config" />
import { defineConfig, isRunnableDevEnvironment, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 8 defaults to Safari 16.4 ("baseline-widely-available"); the page supports older iOS in-app browsers.
const target = ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'];

// Dev only: server-render each page into <!--app--> so `npm run dev` matches the pre-rendered build
// (scripts/prerender.mjs does the same after `vite build`).
const devPrerender = (): Plugin => ({
  name: 'rebloom-dev-prerender',
  apply: 'serve',
  async transformIndexHtml(html, ctx) {
    const ssr = ctx.server?.environments.ssr;
    if (!ssr || !isRunnableDevEnvironment(ssr)) return html;
    const { render } = await ssr.runner.import('/src/entry-server.tsx');
    return html.replace('<!--app-->', () => render(ctx.path.startsWith('/privacy') ? 'privacy' : 'index'));
  },
});

export default defineConfig({
  plugins: [react(), devPrerender()],
  build: {
    target,
    cssTarget: target,
    rollupOptions: { input: { index: 'index.html', privacy: 'privacy.html' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
