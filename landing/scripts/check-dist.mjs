// Build checks from .planning/specs/landing-react-migration.md. `npm run build` ends with these.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Raised from 70 on 2026-11-01 (user decision): React 19 alone is ~60 KB, the content is pre-rendered, and
// sign-ups tapped before it loads are queued, so the bundle only delays interactivity.
const JS_BUDGET_KB = 75;
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const read = (path, base = dist) => readFileSync(new URL(path, base), 'utf8');
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };
const count = (s, re) => (s.match(re) ?? []).length;
const head = html => html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';

const pages = { index: read('index.html'), privacy: read('privacy.html') };
const { index, privacy } = pages;

// Content is in the HTML before any JS runs.
check(index.includes('Bring your plant back to life.</h1>'), 'index: headline pre-rendered');
check(count(index, /<article\b[^>]*data-s="/g) === 4, 'index: all 4 symptom entries pre-rendered');
check(count(index, /<article\b(?![^>]*\bhidden="")[^>]*data-s="tips"/g) === 1 && count(index, /<article\b[^>]*\bhidden=""/g) === 3,
  'index: only "tips" visible without JS');
check(count(index, /<form\b[^>]*method="post"/g) === 2, 'index: 2 forms with method="post"');
check(/<input\b[^>]*type="range"[^>]*value="7(\.00)?"/.test(index), 'index: slider starts on day 7');
check(privacy.includes('>Privacy</h1>') && privacy.includes('Your rights</h2>'), 'privacy: content pre-rendered');

// Scripts and styles are actually wired up (an empty match would make the syntax and budget checks vacuous).
const external = [...index.matchAll(/<(?:script[^>]*\bsrc|link[^>]*rel="modulepreload"[^>]*\bhref)="([^"]+)"/g)].map(m => m[1]);
const inline = [...index.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check(count(index, /<script type="module"[^>]*\bsrc="\/assets\/[^"]+\.js"/g) === 1, 'index: one module script');
check(inline.length === 1 && /<head>[\s\S]*data-early-submit[\s\S]*<\/head>/.test(index) && inline[0].includes('__rbPending'),
  'index: early-submit guard inlined in <head>');
check(!/<script\b/.test(privacy), 'privacy: ships no JavaScript');
// Outside #root (React would wipe or mismatch it) and present before any change, or VoiceOver won't announce it.
const live = index.indexOf('<div id="rb-early-status" class="sr-only" role="status" aria-live="polite"></div>');
check(live > index.lastIndexOf('</form>') && !index.slice(index.indexOf('<div id="root">'), live).includes('<script'),
  'index: early-submit live region in the static HTML, after #root');
for (const [name, html] of Object.entries(pages))
  check(/<link rel="stylesheet"[^>]*href="\/assets\/[^"]+\.css"/.test(html), `${name}: stylesheet linked`);

// <head> is the source template's, unchanged: only Vite's own asset tags and the guard are added.
const normalize = h => h
  .replace(/<script\b[^>]*data-early-submit[\s\S]*?<\/script>/g, '')
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .replace(/<link rel="(?:modulepreload|stylesheet)"[^>]*href="\/(?:assets|src)\/[^"]+"[^>]*>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\s+/g, ' ').replace(/> </g, '><').trim();
for (const name of Object.keys(pages))
  check(normalize(head(pages[name])) === normalize(head(read(`${name}.html`, root))), `${name}: <head> matches the template`);
for (const tag of [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="preconnect" href="https://vhxcgmupopeochwvmwcv.supabase.co" crossorigin>',
  '<meta property="og:image" content="/assets/og.png">',
  '<link rel="manifest" href="/site.webmanifest">',
]) check(index.includes(tag), `index head: ${tag}`);

// Every local URL resolves to a built file, with exact case (Windows matches case-insensitively, Linux hosts don't).
const css = readdirSync(new URL('assets/', dist)).filter(f => f.endsWith('.css')).map(f => read(`assets/${f}`)).join('\n');
const manifest = JSON.parse(read('site.webmanifest'));
const urls = [...new Set([
  ...Object.values(pages).flatMap(h => [...h.matchAll(/\b(?:src|href|content)="([^"]+)"/g)].map(m => m[1])),
  ...[...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, '')),
  ...manifest.icons.map(i => i.src),
].filter(u => /^(\/(?!\/)|[\w-]+\.(html|webp|png|svg|ico|css|js|webmanifest)$)/.test(u)))];
const exists = path => {
  const parts = path.split('/');
  let dir = dist;
  for (const [i, part] of parts.entries()) {
    let entries;
    try { entries = readdirSync(dir); } catch { return false; }
    if (!entries.includes(part)) return false;
    if (i < parts.length - 1) dir = new URL(`${part}/`, dir);
  }
  return true;
};
const missing = urls.map(u => u.replace(/[?#].*$/, '').replace(/^\//, '') || 'index.html').filter(p => !exists(p));
check(urls.length > 20 && missing.length === 0, `all ${urls.length} local URLs resolve (exact case)${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);

// Old-browser output (iOS 14+ in-app browsers).
const js = [...external.map(u => read(u.replace(/^\//, ''))), ...inline].join('\n');
check(!css.includes(':has('), 'css: no :has()');
check(!/@layer\b/.test(css), 'css: no @layer');
check(!/\{[^{}]*&[^{}]*\{/.test(css), 'css: no nesting');
check(!/\?\?=|\|\|=|&&=/.test(js), 'js: no ES2021+ logical assignment');

// Budget.
const kb = gzipSync(js).length / 1024;
check(kb > 1 && kb <= JS_BUDGET_KB, `js budget: ${kb.toFixed(1)} KB gzipped (limit ${JS_BUDGET_KB} KB)`);

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
