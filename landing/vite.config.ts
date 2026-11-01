/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 8 defaults to Safari 16.4 ("baseline-widely-available"); the page supports older iOS in-app browsers.
const target = ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'];

export default defineConfig({
  plugins: [react()],
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
