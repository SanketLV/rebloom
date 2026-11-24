// The diagnose function's pure part (supabase/functions/diagnose/kindwise.ts): request checks and the
// Kindwise → app mapping. Static: no network, no Deno (Node 24 strips the types).
//
//   node --test "supabase/tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBody,
  identificationUrl,
  kindwiseStatus,
  mapResult,
  validateBody,
} from '../functions/diagnose/kindwise.ts';

const SCAN = '6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const jpeg = (extra = 'rebloom') => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(extra)]).toString('base64');

// ---- validateBody ----

test('a scan id and one JPEG pass, with or without a data URL prefix', () => {
  const plain = validateBody({ scan_id: SCAN, images: [jpeg()] });
  assert.deepEqual(plain, { ok: true, scanId: SCAN, images: [jpeg()] });
  const prefixed = validateBody({ scan_id: SCAN, images: [`data:image/jpeg;base64,${jpeg()}`] });
  assert.deepEqual(prefixed, { ok: true, scanId: SCAN, images: [jpeg()] });
});

test('1 to 3 images', () => {
  assert.equal(validateBody({ scan_id: SCAN, images: [jpeg(), jpeg(), jpeg()] }).ok, true);
  for (const images of [[], [jpeg(), jpeg(), jpeg(), jpeg()], 'x', null, undefined]) {
    assert.deepEqual(validateBody({ scan_id: SCAN, images }), { ok: false, status: 400, code: 'bad_request' });
  }
});

test('bad bodies → 400 bad_request', () => {
  const bad = [
    null, 'text', 42, [], {},
    { images: [jpeg()] },
    { scan_id: 'not-a-uuid', images: [jpeg()] },
    { scan_id: `${SCAN} `, images: [jpeg()] },
    { scan_id: SCAN, images: [42] },
    { scan_id: SCAN, images: ['not base64!'] },
    { scan_id: SCAN, images: [''] },
    // PNG
    { scan_id: SCAN, images: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString('base64')] },
    { scan_id: SCAN, images: ['data:image/png;base64,' + jpeg()] },
  ];
  for (const body of bad) {
    assert.deepEqual(validateBody(body), { ok: false, status: 400, code: 'bad_request' }, JSON.stringify(body)?.slice(0, 80));
  }
});

test('an image over 2 MB decoded → 413 image_too_large', () => {
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024)]).toString('base64');
  assert.deepEqual(validateBody({ scan_id: SCAN, images: [big] }), { ok: false, status: 413, code: 'image_too_large' });
  const justFits = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 - 3)]).toString('base64');
  assert.equal(validateBody({ scan_id: SCAN, images: [justFits] }).ok, true);
});

// ---- Kindwise request ----

test('the create body asks for species and health, no similar images, and never a location', () => {
  const body = createBody([jpeg()]);
  assert.deepEqual(body, { images: [`data:image/jpeg;base64,${jpeg()}`], health: 'all', similar_images: false });
  assert.ok(!('latitude' in body) && !('longitude' in body));
});

test('the identification URL asks for the details the app shows, in English, async', () => {
  const url = new URL(identificationUrl('https://plant.id'));
  assert.equal(url.origin + url.pathname, 'https://plant.id/api/v3/identification');
  assert.equal(url.searchParams.get('details'), 'common_names,description,treatment,url,is_harmful');
  assert.equal(url.searchParams.get('language'), 'en');
  assert.equal(url.searchParams.get('async'), 'true');
  assert.equal(new URL(identificationUrl('https://plant.id/', 'tok/../x')).pathname, '/api/v3/identification/tok%2F..%2Fx');
});

test('kindwiseStatus: done, running, failed', () => {
  assert.equal(kindwiseStatus({ status: 'COMPLETED', completed: 1.7e9 }), 'done');
  assert.equal(kindwiseStatus({ status: 'CREATED', completed: null }), 'running');
  assert.equal(kindwiseStatus({ status: 'IN_PROGRESS' }), 'running');
  assert.equal(kindwiseStatus({ status: 'FAILED' }), 'failed');
  // Review round 2 #5: one unreadable answer is not a verdict; only an explicit FAILED is.
  assert.equal(kindwiseStatus(null), 'running');
  assert.equal(kindwiseStatus('<html>'), 'running');
});

// ---- mapResult ----

// Shaped like the plant.id v3 examples (Postman collection, 2026-11-20).
const FIXTURE = {
  access_token: 'tok',
  status: 'COMPLETED',
  completed: 1732096800.5,
  result: {
    is_plant: { probability: 0.98, binary: true, threshold: 0.5 },
    classification: {
      suggestions: [
        { id: 's1', name: 'Monstera deliciosa', probability: 0.91, details: { common_names: ['Swiss cheese plant', 'Split-leaf philodendron'] } },
        { id: 's2', name: 'Philodendron bipinnatifidum', probability: 0.04, details: { common_names: null } },
        { id: 's3', name: 'Epipremnum aureum', probability: 0.02, details: {} },
        { id: 's4', name: 'Rhaphidophora tetrasperma', probability: 0.01, details: {} },
      ],
    },
    is_healthy: { probability: 0.12, binary: false, threshold: 0.525 },
    disease: {
      suggestions: [
        {
          id: 'd1', name: 'water excess or uneven watering', probability: 0.64,
          details: {
            local_name: 'water excess or uneven watering', description: 'Too much water.', common_names: null, is_harmful: true,
            treatment: { prevention: ['Water only when the top soil is dry.'], biological: 'Repot into fresh soil.' },
          },
        },
        { id: 'd2', name: 'Fungi', probability: 0.21, details: { description: 'A fungus.', treatment: { chemical: ['Fungicide.'], prevention: ['Air flow.'] }, is_harmful: true } },
        { id: 'd3', name: 'flower buds', probability: 0.3, details: { is_harmful: false } },
        { id: 'd4', name: 'Senescence', probability: 0.09, details: { is_harmful: true } },
        { id: 'd5', name: 'Insecta', probability: 0.05, details: { is_harmful: true } },
      ],
      question: {
        text: 'Is the soil wet a day after watering?',
        translation: 'Is the soil wet a day after watering?',
        options: {
          yes: { suggestion_index: 0, entity_id: 'd1', name: 'water excess or uneven watering', translation: '' },
          no: { suggestion_index: 1, entity_id: 'd2', name: 'Fungi', translation: '' },
        },
      },
    },
  },
};

test('maps the example: top 3, harmless classes dropped, treatment as lists, one-suggestion question', () => {
  assert.deepEqual(mapResult(FIXTURE), {
    is_plant: { probability: 0.98, binary: true },
    is_healthy: { probability: 0.12, binary: false },
    species: [
      { name: 'Monstera deliciosa', common_names: ['Swiss cheese plant', 'Split-leaf philodendron'], probability: 0.91 },
      { name: 'Philodendron bipinnatifidum', common_names: [], probability: 0.04 },
      { name: 'Epipremnum aureum', common_names: [], probability: 0.02 },
    ],
    diseases: [
      {
        id: 'd1', name: 'water excess or uneven watering', common_names: [], probability: 0.64, description: 'Too much water.',
        treatment: { prevention: ['Water only when the top soil is dry.'], biological: ['Repot into fresh soil.'], chemical: [] },
      },
      { id: 'd2', name: 'Fungi', common_names: [], probability: 0.21, description: 'A fungus.', treatment: { prevention: ['Air flow.'], biological: [], chemical: ['Fungicide.'] } },
      { id: 'd4', name: 'Senescence', common_names: [], probability: 0.09, description: null, treatment: { prevention: [], biological: [], chemical: [] } },
    ],
    question: {
      text: 'Is the soil wet a day after watering?',
      yes: { id: 'd1', name: 'water excess or uneven watering' },
      no: { id: 'd2', name: 'Fungi' },
    },
  });
});

test('an empty or broken answer maps to safe defaults: not a plant, not healthy, nothing listed', () => {
  const empty = {
    is_plant: { probability: 0, binary: false },
    is_healthy: { probability: 0, binary: false },
    species: [],
    diseases: [],
    question: null,
  };
  for (const raw of [null, undefined, 'x', 42, {}, { result: null }, { result: { is_plant: 'yes' } }]) {
    assert.deepEqual(mapResult(raw), empty, JSON.stringify(raw));
  }
});

test('probabilities are clamped to 0..1, NaN and strings become 0, list sorted by probability', () => {
  const mapped = mapResult({
    result: {
      is_plant: { probability: 7, binary: true },
      classification: { suggestions: [
        { name: 'B', probability: 'high' },
        { name: 'A', probability: 0.3 },
        { name: 'C', probability: -1 },
        { probability: 0.9 },
      ] },
    },
  });
  assert.equal(mapped.is_plant.probability, 1);
  assert.deepEqual(mapped.species.map((s) => [s.name, s.probability]), [['A', 0.3], ['B', 0], ['C', 0]]);
});

test('a question missing an option is dropped; text stays plain text', () => {
  const q = structuredClone(FIXTURE);
  delete q.result.disease.question.options.no;
  assert.equal(mapResult(q).question, null);
  const html = structuredClone(FIXTURE);
  html.result.disease.question.text = '<b>Wet?</b>';
  assert.equal(mapResult(html).question.text, '<b>Wet?</b>');
});

test('very long Kindwise text is cut, never dropped whole', () => {
  const long = structuredClone(FIXTURE);
  long.result.disease.suggestions[0].details.description = 'x'.repeat(10_000);
  assert.equal(mapResult(long).diseases[0].description.length, 2000);
});

// Mass check (review.md, high risk): thousands of random, half-broken Kindwise answers and bodies.
// Seeded, so a failure repeats.
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function junk(r, depth = 0) {
  const pick = Math.floor(r() * 10);
  if (depth > 3 || pick < 4) {
    return [null, undefined, true, 0, -1, 1.5, Number.NaN, '', 'x', '<b>', 'é​'][Math.floor(r() * 11)];
  }
  if (pick < 7) return Array.from({ length: Math.floor(r() * 5) }, () => junk(r, depth + 1));
  const keys = ['result', 'is_plant', 'is_healthy', 'classification', 'disease', 'suggestions', 'question', 'options',
    'yes', 'no', 'id', 'name', 'probability', 'binary', 'details', 'treatment', 'prevention', 'description', 'text',
    'entity_id', 'common_names', 'is_harmful', 'scan_id', 'images'];
  return Object.fromEntries(Array.from({ length: Math.floor(r() * 6) }, () => [keys[Math.floor(r() * keys.length)], junk(r, depth + 1)]));
}

test('5000 random answers: mapResult never throws and always gives the safe shape', () => {
  const r = rng(42);
  for (let i = 0; i < 5000; i += 1) {
    const raw = junk(r);
    const m = mapResult(raw);
    assert.equal(typeof m.is_plant.binary, 'boolean');
    assert.ok(m.species.length <= 3 && m.diseases.length <= 3);
    for (const p of [m.is_plant.probability, m.is_healthy.probability, ...m.species.map((s) => s.probability), ...m.diseases.map((d) => d.probability)]) {
      assert.ok(p >= 0 && p <= 1, `probability ${p} for ${JSON.stringify(raw)}`);
    }
    for (const d of m.diseases) {
      for (const list of Object.values(d.treatment)) assert.ok(list.every((t) => typeof t === 'string'));
    }
  }
});

test('5000 random bodies: validateBody never throws and only accepts a UUID with 1-3 JPEGs', () => {
  const r = rng(7);
  for (let i = 0; i < 5000; i += 1) {
    const raw = junk(r);
    const v = validateBody(raw);
    if (v.ok) {
      assert.match(v.scanId, /^[0-9a-f-]{36}$/i);
      assert.ok(v.images.length >= 1 && v.images.length <= 3);
    } else {
      assert.ok(v.status === 400 || v.status === 413);
    }
  }
});
