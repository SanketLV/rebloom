// A plant.id v3 stand-in for the local diagnose tests. The function reaches it through
// KINDWISE_BASE_URL (supabase/functions/.env, see .env.example): the edge runtime runs in Docker, so
// it listens on all interfaces and the function uses host.docker.internal.
//
// What it answers depends on a word in the photo's bytes after the JPEG header (`photo('slow')`):
//   plant (default)  sick Monstera with a follow-up question; completes on the second GET
//   healthy          a healthy plant, no question
//   notplant         is_plant false
//   slow             never completes
//   failed           Kindwise reports the identification FAILED
//   hangcreate       create never answers (the function's 10 s limit runs out)
//   fail             create → 500
//   nocredits        create → 429 (Kindwise out of credits)
// Every request is recorded in `calls` so tests can count Kindwise creates and check what was sent.

import { createServer } from 'node:http';

export const FAKE_KINDWISE_PORT = 54399;
export const FAKE_KINDWISE_KEY = 'local-test-key';

/** Base64 of a tiny "JPEG" carrying `word`. */
export function photo(word = 'plant', padTo = 0) {
  const body = Buffer.from(`${word}:${Math.random()}`);
  const pad = Buffer.alloc(Math.max(0, padTo - body.length - 4));
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), body, pad]).toString('base64');
}

function wordIn(dataUrl) {
  const bytes = Buffer.from(String(dataUrl).replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  return bytes.subarray(4).toString('latin1').split(':')[0];
}

const SICK = {
  is_plant: { probability: 0.98, binary: true, threshold: 0.5 },
  classification: { suggestions: [
    { id: 's1', name: 'Monstera deliciosa', probability: 0.91, details: { common_names: ['Swiss cheese plant'] } },
  ] },
  is_healthy: { probability: 0.12, binary: false, threshold: 0.525 },
  disease: {
    suggestions: [
      { id: 'd1', name: 'water excess or uneven watering', probability: 0.64,
        details: { description: 'Too much water.', is_harmful: true, treatment: { prevention: ['Let the soil dry.'] } } },
      { id: 'd2', name: 'Fungi', probability: 0.21, details: { description: 'A fungus.', is_harmful: true, treatment: { prevention: ['Air flow.'] } } },
    ],
    question: {
      text: 'Is the soil wet a day after watering?',
      options: {
        yes: { suggestion_index: 0, entity_id: 'd1', name: 'water excess or uneven watering' },
        no: { suggestion_index: 1, entity_id: 'd2', name: 'Fungi' },
      },
    },
  },
};

const RESULTS = {
  plant: SICK,
  healthy: { ...SICK, is_healthy: { probability: 0.9, binary: true }, disease: { suggestions: [] } },
  notplant: { is_plant: { probability: 0.03, binary: false, threshold: 0.5 }, classification: { suggestions: [] } },
};

export function startFakeKindwise() {
  const calls = [];
  const identifications = new Map(); // token → { word, gets }
  let next = 0;

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://fake');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        // recorded as null
      }
      calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(payload === undefined ? '' : JSON.stringify(payload));
      };
      if (req.headers['api-key'] !== FAKE_KINDWISE_KEY) return send(401, { error: 'bad key' });

      if (req.method === 'POST' && url.pathname === '/api/v3/identification') {
        const word = wordIn(body?.images?.[0]);
        if (word === 'fail') return send(500, 'boom');
        if (word === 'nocredits') return send(429, 'Client does not have sufficient number of available credits.');
        if (word === 'hangcreate') return;
        const token = `tok-${(next += 1)}-${word}`;
        identifications.set(token, { word, gets: 0 });
        return send(201, { access_token: token, status: 'CREATED', completed: null, result: null });
      }
      const match = url.pathname.match(/^\/api\/v3\/identification\/([^/]+)$/);
      const found = match && identifications.get(decodeURIComponent(match[1]));
      if (!found) return send(404, { error: 'not found' });
      const token = decodeURIComponent(match[1]);
      if (req.method === 'DELETE') {
        identifications.delete(token);
        return send(200, true);
      }
      if (req.method === 'GET') {
        found.gets += 1;
        if (found.word === 'failed') return send(200, { access_token: token, status: 'FAILED', completed: null, result: null });
        if (found.word === 'slow' || found.gets < 2) {
          return send(200, { access_token: token, status: 'IN_PROGRESS', completed: null, result: null });
        }
        return send(200, { access_token: token, status: 'COMPLETED', completed: Date.now() / 1000, result: RESULTS[found.word] ?? SICK });
      }
      return send(405);
    });
  });

  return new Promise((resolve) => {
    server.listen(FAKE_KINDWISE_PORT, '0.0.0.0', () =>
      resolve({
        calls,
        identifications,
        creates: () => calls.filter((c) => c.method === 'POST').length,
        close: () => new Promise((done) => server.close(done)),
      }),
    );
  });
}
