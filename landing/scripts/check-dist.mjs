// Build checks from .planning/specs/landing-react-migration.md. Run after `npm run build`: `npm run check`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const JS_BUDGET_KB = 70;
const dist = new URL('../dist/', import.meta.url);
const read = path => readFileSync(new URL(path, dist), 'utf8');
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };
const count = (s, re) => (s.match(re) ?? []).length;

const index = read('index.html');
const privacy = read('privacy.html');

// Content is in the HTML before any JS runs.
check(index.includes('Bring your plant back to life.</h1>'), 'index: headline pre-rendered');
check(count(index, /<article\b[^>]*data-s="/g) === 4, 'index: all 4 symptom entries pre-rendered');
check(count(index, /<article\b(?![^>]*hidden)[^>]*data-s="tips"/g) === 1 && count(index, /<article\b[^>]*hidden/g) === 3,
  'index: only "tips" visible without JS');
check(count(index, /<form\b[^>]*method="post"/g) === 2, 'index: 2 forms with method="post"');
check(/<input\b[^>]*type="range"[^>]*value="7(\.00)?"/.test(index), 'index: slider starts on day 7');
check(privacy.includes('>Privacy</h1>') && privacy.includes('Your rights</h2>'), 'privacy: content pre-rendered');
check(!/<script\b/.test(privacy), 'privacy: ships no JavaScript');

// <head> unchanged from the static page.
for (const tag of [
  '<title>Rebloom: Plant Doctor</title>', 'name="description"', 'property="og:title"', 'property="og:description"',
  'content="/assets/og.png"', 'name="twitter:card"', 'href="/favicon.ico"', 'href="/favicon.svg"',
  'href="/apple-touch-icon.png"', 'href="/site.webmanifest"', 'name="theme-color" content="#2E3D28"',
  'href="https://fonts.googleapis.com" rel="preconnect"', 'https://vhxcgmupopeochwvmwcv.supabase.co',
  'family=Figtree:wght@400;500;600;700&family=Instrument+Serif',
]) check(index.includes(tag) || index.replace(/rel="preconnect" href="([^"]+)"/g, 'href="$1" rel="preconnect"').includes(tag), `index head: ${tag}`);

// Every local URL resolves to a built file.
const cssFiles = readdirSync(new URL('assets/', dist)).filter(f => f.endsWith('.css'));
const css = cssFiles.map(f => read(`assets/${f}`)).join('\n');
const manifest = JSON.parse(read('site.webmanifest'));
const urls = [
  ...[index, privacy].flatMap(h => [...h.matchAll(/\b(?:src|href|content)="([^"]+)"/g)].map(m => m[1])),
  ...[...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, '')),
  ...manifest.icons.map(i => i.src),
].filter(u => /^(\/(?!\/)|[\w-]+\.(html|webp|png|svg|ico|css|js|webmanifest)$)/.test(u));
const missing = [...new Set(urls)].map(u => u.replace(/[?#].*$/, '').replace(/^\//, '') || 'index.html')
  .filter(p => !existsSync(new URL(p, dist)));
check(missing.length === 0, `all ${new Set(urls).size} local URLs resolve${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);

// Old-browser output (iOS 14+ in-app browsers).
check(!css.includes(':has('), 'css: no :has()');
check(!/@layer\b/.test(css), 'css: no @layer');
check(!/\{[^{}]*&[^{}]*\{/.test(css), 'css: no nesting');
const scripts = [...index.matchAll(/<(?:script[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="([^"]+)"/g)].map(m => m[1].replace(/^\//, ''));
const js = scripts.map(read).join('\n');
check(!/\?\?=|\|\|=|&&=/.test(js), 'js: no ES2021+ logical assignment');

// Budget.
const kb = gzipSync(js).length / 1024;
check(kb <= JS_BUDGET_KB, `js budget: ${kb.toFixed(1)} KB gzipped (limit ${JS_BUDGET_KB} KB)`);

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
