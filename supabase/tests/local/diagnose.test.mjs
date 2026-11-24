// The diagnose Edge Function on the LOCAL stack, against a fake plant.id (fakeKindwise.mjs).
// Needs `supabase start`, `supabase/functions/.env` copied from `.env.example`, and the functions
// served (`npx -y supabase@3 functions serve`). The "slow" test waits out the function's 15 s poll.
//
//   node --test "supabase/tests/local/*.test.mjs"

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY, LOCAL_KEYS, RUN, URL_, signInByCode } from './guard.mjs';
import { FAKE_KINDWISE_KEY, photo, startFakeKindwise } from './fakeKindwise.mjs';

const FUNCTION = `${URL_}/functions/v1/diagnose`;
let fake;

// Server-side reads and writes for setting up and checking counters (secret key, local only).
async function admin(path, init = {}) {
  assert.ok(LOCAL_KEYS.secret, 'these tests need the local secret key from `supabase status`');
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: LOCAL_KEYS.secret, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  });
  const text = await r.text();
  assert.ok(r.ok, `${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => `${today().slice(0, 7)}-01`;
const usage = async (userId) =>
  (await admin(`scan_usage?user_id=eq.${userId}&month=eq.${thisMonth()}&select=count`))[0]?.count ?? 0;
const credits = async () => (await admin(`kindwise_daily_usage?day=eq.${today()}&select=credits`))[0]?.credits ?? 0;
const setCredits = (n) =>
  admin('kindwise_daily_usage?on_conflict=day', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ day: today(), credits: n }),
  });

async function anonymous() {
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const session = await r.json();
  assert.equal(r.status, 200, `anonymous sign-in: ${JSON.stringify(session)}`);
  assert.equal(session.user.is_anonymous, true);
  return session;
}

function call({ token, method = 'POST', body, query = '' } = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${FUNCTION}${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const scan = () => crypto.randomUUID();
const diagnose = (token, scanId, word = 'plant') => call({ token, body: { scan_id: scanId, images: [photo(word)] } });

before(async () => {
  fake = await startFakeKindwise();
  await setCredits(0);
});
after(async () => {
  await setCredits(0);
  await fake?.close();
});

// ---- POST ----

test('a sick plant: species, diseases, question; counted once; nothing private sent to Kindwise', async () => {
  const s = await anonymous();
  const id = scan();
  const creditsBefore = await credits();
  const image = photo('plant');
  const r = await call({ token: s.access_token, body: { scan_id: id, images: [image] } });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.equal(body.is_plant.binary, true);
  assert.equal(body.species[0].name, 'Monstera deliciosa');
  assert.equal(body.diseases[0].name, 'water excess or uneven watering');
  assert.deepEqual(body.question.yes, { id: 'd1', name: 'water excess or uneven watering' });
  assert.equal(body.scans_left, 2);
  assert.match(body.resets_at, /^\d{4}-\d{2}-01T00:00:00(\.0+)?(Z|\+00:00)$/);
  assert.equal(await usage(s.user.id), 1);
  assert.equal(await credits(), creditsBefore + 2);

  // This scan's create, picked by its photo (PR #32 review: `includes('')` matched any POST).
  const sent = `data:image/jpeg;base64,${image}`;
  const create = fake.calls.find((c) => c.method === 'POST' && c.body?.images?.[0] === sent);
  assert.ok(create, 'the create call carried this photo');
  assert.equal(create.headers['api-key'], FAKE_KINDWISE_KEY);
  assert.equal(create.query.async, 'true');
  assert.equal(create.body.health, 'all');
  assert.ok(!('latitude' in create.body) && !('longitude' in create.body), 'never a location');
  assert.ok(!JSON.stringify(body).includes(FAKE_KINDWISE_KEY), 'the key never reaches the caller');
  assert.ok(!('access_token' in body), 'the Kindwise token never reaches the caller');
});

test('a retry of a finished scan returns the same answer for free', async () => {
  const s = await anonymous();
  const id = scan();
  const first = await (await diagnose(s.access_token, id)).json();
  const creates = fake.creates();
  const again = await diagnose(s.access_token, id);
  assert.equal(again.status, 200);
  const { scans_left: _a, resets_at: _b, ...rest } = await again.json();
  const { scans_left: _c, resets_at: _d, ...firstRest } = first;
  assert.deepEqual(rest, firstRest);
  assert.equal(fake.creates(), creates, 'no second Kindwise create');
  assert.equal(await usage(s.user.id), 1);
});

test('two calls at once with one scan id: one Kindwise create, counted once', async () => {
  const s = await anonymous();
  const id = scan();
  const creates = fake.creates();
  const statuses = (await Promise.all([diagnose(s.access_token, id), diagnose(s.access_token, id)])).map((r) => r.status);
  assert.ok(statuses.includes(200), String(statuses));
  assert.ok(statuses.every((st) => st === 200 || st === 409), String(statuses));
  assert.equal(fake.creates(), creates + 1);
  assert.equal(await usage(s.user.id), 1);
});

test('not a plant → 422, the scan is given back, the credits stay spent', async () => {
  const s = await anonymous();
  const creditsBefore = await credits();
  const r = await diagnose(s.access_token, scan(), 'notplant');
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, 'not_a_plant');
  assert.equal(await usage(s.user.id), 0);
  assert.equal(await credits(), creditsBefore + 2);
});

test('Kindwise reports FAILED → 502, the scan given back, credits kept; a retry is charged afresh', async () => {
  const s = await anonymous();
  const id = scan();
  const creditsBefore = await credits();
  const r = await diagnose(s.access_token, id, 'failed');
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.code, 'upstream_failed');
  assert.equal(await usage(s.user.id), 0);
  assert.equal(await credits(), creditsBefore + 2);
  assert.deepEqual(await admin(`diagnosis_requests?scan_id=eq.${id}`), []);
});

test('a create that never answers → 502; the scan is given back but its credits stay counted', async () => {
  const s = await anonymous();
  const creditsBefore = await credits();
  const r = await diagnose(s.access_token, scan(), 'hangcreate');
  assert.equal(r.status, 502);
  assert.equal(await usage(s.user.id), 0);
  assert.equal(await credits(), creditsBefore + 2, 'Kindwise may have accepted it');
});

test('a body over the size limit is refused before it is read → 413', async () => {
  const s = await anonymous();
  const r = await fetch(FUNCTION, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: 'x'.repeat(9 * 1024 * 1024),
  });
  assert.equal(r.status, 413);
});

for (const word of ['fail', 'nocredits']) {
  test(`Kindwise create refused (${word}) → 502, scan and credits given back`, async () => {
    const s = await anonymous();
    const creditsBefore = await credits();
    const r = await diagnose(s.access_token, scan(), word);
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error.code, 'upstream_failed');
    assert.equal(await usage(s.user.id), 0);
    assert.equal(await credits(), creditsBefore);
  });
}

test('the 4th scan in a month → 429 with the reset time; not counted', async () => {
  const s = await anonymous();
  await admin('scan_usage', { method: 'POST', body: JSON.stringify({ user_id: s.user.id, month: thisMonth(), count: 3 }) });
  const r = await diagnose(s.access_token, scan());
  const body = await r.json();
  assert.equal(r.status, 429);
  assert.equal(body.error.code, 'quota_exceeded');
  assert.match(body.error.resets_at, /^\d{4}-\d{2}-01T00:00:00/);
  assert.equal(await usage(s.user.id), 3);
});

test('over the daily credit cap → 503 daily_cap; not counted', async () => {
  const s = await anonymous();
  await setCredits(40);
  try {
    const r = await diagnose(s.access_token, scan());
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.code, 'daily_cap');
    assert.equal(await usage(s.user.id), 0);
  } finally {
    await setCredits(0);
  }
});

test('a signed-in email user is accepted too', async () => {
  const s = await signInByCode(`diag-${RUN}@example.com`);
  assert.equal((await diagnose(s.access_token, scan())).status, 200);
});

test('no token, a bad token, or an API key → 401', async () => {
  const body = { scan_id: scan(), images: [photo()] };
  assert.equal((await call({ body })).status, 401);
  assert.equal((await call({ token: 'not-a-token', body })).status, 401);
  assert.equal((await call({ token: KEY, body })).status, 401);
});

test('bad bodies → 400, a 3 MB photo → 413; nothing counted', async () => {
  const s = await anonymous();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64');
  for (const body of [
    { images: [photo()] },
    { scan_id: scan(), images: [photo(), photo(), photo(), photo()] },
    { scan_id: scan(), images: [png] },
  ]) {
    const r = await call({ token: s.access_token, body });
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await r.json()).error.code, 'bad_request');
  }
  const notJson = await fetch(FUNCTION, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(notJson.status, 400);
  const big = await call({ token: s.access_token, body: { scan_id: scan(), images: [photo('plant', 3 * 1024 * 1024)] } });
  assert.equal(big.status, 413);
  assert.equal(await usage(s.user.id), 0);
});

test('deleting an account deletes its Kindwise copies first (delete-account)', async () => {
  const s = await anonymous();
  const id = scan();
  assert.equal((await diagnose(s.access_token, id)).status, 200);
  const token = (await admin(`diagnosis_requests?scan_id=eq.${id}&select=access_token`))[0].access_token;
  assert.ok(fake.identifications.has(token));
  const r = await fetch(`${URL_}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` },
  });
  assert.equal(r.status, 204);
  assert.ok(!fake.identifications.has(token), 'the Kindwise copy is deleted');
  assert.deepEqual(await admin(`diagnosis_requests?scan_id=eq.${id}`), []);
});

test('a Kindwise copy that cannot be deleted with the account stays queued, and a later POST deletes it', async () => {
  const s = await anonymous();
  const id = scan();
  assert.equal((await diagnose(s.access_token, id)).status, 200);
  const token = (await admin(`diagnosis_requests?scan_id=eq.${id}&select=access_token`))[0].access_token;
  fake.state.failDeletes = true;
  try {
    const r = await fetch(`${URL_}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` },
    });
    assert.equal(r.status, 204, 'the account is deleted anyway');
  } finally {
    fake.state.failDeletes = false;
  }
  assert.ok(fake.identifications.has(token), 'Kindwise was down');
  assert.equal((await admin(`kindwise_deletions?access_token=eq.${encodeURIComponent(token)}`)).length, 1,
    'the token outlives the account');

  await drainedBy(await anonymous(), token);
});

// A later POST's sweep retries queued deletions (in the background: poll).
async function drainedBy(session, token) {
  assert.equal((await diagnose(session.access_token, scan())).status, 200);
  for (let i = 0; i < 20 && fake.identifications.has(token); i += 1) await new Promise((r) => setTimeout(r, 250));
  assert.ok(!fake.identifications.has(token), 'deleted at Kindwise on the retry');
  for (let i = 0; i < 20; i += 1) {
    if ((await admin(`kindwise_deletions?access_token=eq.${encodeURIComponent(token)}`)).length === 0) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail('the queued token is gone once Kindwise confirms');
}

test('PUT → 405', async () => {
  const s = await anonymous();
  assert.equal((await call({ token: s.access_token, method: 'PUT', body: {} })).status, 405);
});

// ---- GET and DELETE ----

test('GET returns the caller\'s own result for free; another user\'s scan or an unknown one → 404', async () => {
  const a = await anonymous();
  const b = await anonymous();
  const id = scan();
  assert.equal((await diagnose(a.access_token, id)).status, 200);
  const creates = fake.creates();

  const mine = await call({ token: a.access_token, method: 'GET', query: `?scan_id=${id}` });
  assert.equal(mine.status, 200);
  assert.equal((await mine.json()).species[0].name, 'Monstera deliciosa');
  assert.equal(fake.creates(), creates, 'GET never creates');

  assert.equal((await call({ token: b.access_token, method: 'GET', query: `?scan_id=${id}` })).status, 404);
  assert.equal((await call({ token: a.access_token, method: 'GET', query: `?scan_id=${scan()}` })).status, 404);
  assert.equal((await call({ token: a.access_token, method: 'GET', query: '?scan_id=nope' })).status, 400);
});

test('DELETE removes the Kindwise identification and the request; a repeat is still 204; GET is then 404', async () => {
  const s = await anonymous();
  const id = scan();
  assert.equal((await diagnose(s.access_token, id)).status, 200);
  const token = (await admin(`diagnosis_requests?scan_id=eq.${id}&select=access_token`))[0].access_token;

  assert.equal((await call({ token: s.access_token, method: 'DELETE', query: `?scan_id=${id}` })).status, 204);
  assert.ok(!fake.identifications.has(token), 'deleted at Kindwise');
  assert.deepEqual(await admin(`diagnosis_requests?scan_id=eq.${id}`), []);
  assert.equal(await usage(s.user.id), 1, 'still counted');
  assert.equal((await call({ token: s.access_token, method: 'DELETE', query: `?scan_id=${id}` })).status, 204);
  assert.equal((await call({ token: s.access_token, method: 'GET', query: `?scan_id=${id}` })).status, 404);
});

test('a failed Kindwise delete keeps the token queued; DELETE still answers 204; a later POST retries', async () => {
  const s = await anonymous();
  const id = scan();
  assert.equal((await diagnose(s.access_token, id)).status, 200);
  const token = (await admin(`diagnosis_requests?scan_id=eq.${id}&select=access_token`))[0].access_token;
  fake.state.failDeletes = true;
  try {
    assert.equal((await call({ token: s.access_token, method: 'DELETE', query: `?scan_id=${id}` })).status, 204);
  } finally {
    fake.state.failDeletes = false;
  }
  assert.ok(fake.identifications.has(token));
  assert.deepEqual(await admin(`diagnosis_requests?scan_id=eq.${id}`), []);
  assert.equal((await admin(`kindwise_deletions?access_token=eq.${encodeURIComponent(token)}`)).length, 1);
  await drainedBy(s, token);
});

test('a scan removed while Kindwise creates it: its identification is deleted, and no result comes back', async () => {
  const s = await anonymous();
  const id = scan();
  const before = new Set(fake.identifications.keys());
  const posting = diagnose(s.access_token, id, 'slowcreate');
  for (let i = 0; i < 20 && (await admin(`diagnosis_requests?scan_id=eq.${id}`)).length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await call({ token: s.access_token, method: 'DELETE', query: `?scan_id=${id}` })).status, 204);
  const r = await posting;
  assert.equal(r.status, 404, 'no result for a removed scan');
  const created = [...fake.identifications.keys()].filter((t) => !before.has(t) && t.endsWith('-slowcreate'));
  assert.deepEqual(created, [], 'the identification Kindwise just made is deleted');
});

test('a request row older than 7 days is cleaned up by a later POST', async () => {
  const s = await anonymous();
  const old = scan();
  assert.equal((await diagnose(s.access_token, old)).status, 200);
  const token = (await admin(`diagnosis_requests?scan_id=eq.${old}&select=access_token`))[0].access_token;
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  await admin(`diagnosis_requests?scan_id=eq.${old}`, { method: 'PATCH', body: JSON.stringify({ created_at: eightDaysAgo }) });

  assert.equal((await diagnose(s.access_token, scan())).status, 200);
  for (let i = 0; i < 20 && fake.identifications.has(token); i += 1) await new Promise((r) => setTimeout(r, 250));
  assert.ok(!fake.identifications.has(token), 'expired identification deleted at Kindwise');
  assert.deepEqual(await admin(`diagnosis_requests?scan_id=eq.${old}`), []);
});

test('Kindwise still working after 15 s → 202 pending, still counted; GET answers 202 too', async () => {
  const s = await anonymous();
  const id = scan();
  const r = await diagnose(s.access_token, id, 'slow');
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { status: 'pending' });
  assert.equal(await usage(s.user.id), 1);
  const later = await call({ token: s.access_token, method: 'GET', query: `?scan_id=${id}` });
  assert.equal(later.status, 202);
});
