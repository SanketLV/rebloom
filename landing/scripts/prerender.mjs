// Runs after `vite build` + `vite build --ssr`: renders each page into its built HTML, then drops the server bundle.
import { readFile, rm, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const { render } = await import(new URL('server/entry-server.js', dist).href);

for (const page of ['index', 'privacy']) {
  const file = new URL(`${page}.html`, dist);
  const html = await readFile(file, 'utf8');
  if (!html.includes('<!--app-->')) throw new Error(`${page}.html has no <!--app--> placeholder`);
  // Function replacer: a string one would treat "$&" etc. in the rendered HTML as patterns.
  await writeFile(file, html.replace('<!--app-->', () => render(page)));
  console.log(`prerendered ${page}.html`);
}

await rm(new URL('server/', dist), { recursive: true });
