// The delete-account Edge Function on the LOCAL stack. Needs `supabase start` and the function
// served (`npx -y supabase@3 functions serve`, or the edge runtime started by `supabase start`).
//
//   node --test "supabase/tests/local/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY, RUN, URL_, signInByCode } from './guard.mjs';

const FUNCTION = `${URL_}/functions/v1/delete-account`;

function callDelete({ token, body, method = 'POST' } = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(FUNCTION, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

// What Auth says about the account behind a token: 200 while it exists.
function whoIs(token) {
  return fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
}

test('deletes only the caller, whatever the body says; a repeat is still 204', async () => {
  const a = await signInByCode(`del-a-${RUN}@example.com`);
  const b = await signInByCode(`del-b-${RUN}@example.com`);

  const r = await callDelete({ token: a.access_token, body: { user_id: b.user.id, id: b.user.id } });
  assert.equal(r.status, 204, await r.text());

  assert.notEqual((await whoIs(a.access_token)).status, 200, 'A should be gone');
  assert.equal((await whoIs(b.access_token)).status, 200, 'B must not be touched');

  // The first call may have worked while its reply was lost: retrying must succeed too.
  const again = await callDelete({ token: a.access_token });
  assert.equal(again.status, 204, await again.text());
});

test('no token → 401', async () => {
  const r = await callDelete();
  assert.equal(r.status, 401, await r.text());
});

test('the publishable key as the token → 401', async () => {
  const r = await callDelete({ token: KEY });
  assert.equal(r.status, 401, await r.text());
});

test('a token with a changed signature → 401, and nobody is deleted', async () => {
  const c = await signInByCode(`del-c-${RUN}@example.com`);
  const [header, payload, signature] = c.access_token.split('.');
  const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
  const r = await callDelete({ token: [header, payload, flipped].join('.') });
  assert.equal(r.status, 401, await r.text());
  assert.equal((await whoIs(c.access_token)).status, 200, 'C must not be deleted');
});

test('GET → 405', async () => {
  const d = await signInByCode(`del-d-${RUN}@example.com`);
  const r = await callDelete({ token: d.access_token, method: 'GET' });
  assert.equal(r.status, 405, await r.text());
  assert.equal((await whoIs(d.access_token)).status, 200);
});
