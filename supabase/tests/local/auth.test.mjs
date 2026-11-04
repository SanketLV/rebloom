// Sign-in and access rules through the real Supabase API on the LOCAL stack: Auth (GoTrue),
// the data API (PostgREST) and the local mail catcher (Mailpit). Needs `supabase start`.
//
//   node --test "supabase/tests/local/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { KEY, MAILPIT, RUN, URL_ } from './guard.mjs';

const json = { 'Content-Type': 'application/json' };
const anonHeaders = { apikey: KEY, ...json };
const userHeaders = (token) => ({ ...anonHeaders, Authorization: `Bearer ${token}` });
const EMAIL = `rebloom-local-${RUN}@example.com`;

async function post(path, body, headers = anonHeaders) {
  return fetch(`${URL_}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

// Waits for the sign-in email in Mailpit and returns { code, html }.
async function readCode(email) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const r = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
    assert.equal(r.status, 200, `Mailpit at ${MAILPIT}: ${r.status}`);
    const { messages = [] } = await r.json();
    const mail = messages.find((m) => (m.To ?? []).some((to) => to.Address?.toLowerCase() === email));
    if (mail) {
      const code = mail.Subject.match(/Your Rebloom code: (\d{6})/)?.[1];
      assert.ok(code, `unexpected subject: ${mail.Subject}`);
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json();
      return { code, html: full.HTML ?? '' };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`no email for ${email} reached Mailpit within 10 s`);
}

test('the guard stops the run, before any request, when pointed at a non-local address', () => {
  const guard = new URL('./guard.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(guard)})`], {
    env: { ...process.env, SUPABASE_URL: 'https://vhxcgmupopeochwvmwcv.supabase.co' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stderr, /refusing to run against https:\/\/vhxcgmupopeochwvmwcv\.supabase\.co/);
});

test('anonymous sign-in is refused', async () => {
  const r = await post('/auth/v1/signup', {});
  const body = await r.text();
  assert.ok(!r.ok, `anonymous sign-in should fail, got ${r.status} ${body}`);
  assert.match(body, /anonymous/i);
});

let token;

test('an email code signs in, and the email holds only the code', async () => {
  const sent = await post('/auth/v1/otp', { email: EMAIL, create_user: true });
  assert.equal(sent.status, 200, await sent.text());

  const { code, html } = await readCode(EMAIL);
  assert.match(html, new RegExp(code));
  assert.doesNotMatch(html, /<a\s|href=/i, 'the sign-in email must not contain a link');

  const verified = await post('/auth/v1/verify', { type: 'email', email: EMAIL, token: code });
  const session = await verified.json();
  assert.equal(verified.status, 200, JSON.stringify(session));
  assert.ok(session.access_token, 'no access token');
  assert.equal(session.user?.email, EMAIL);
  assert.equal(session.user?.is_anonymous, false);
  token = session.access_token;

  const again = await post('/auth/v1/verify', { type: 'email', email: EMAIL, token: code });
  assert.ok(!again.ok, `a used code must not work twice, got ${again.status}`);
});

test('a signed-in user cannot read the waitlist', async (t) => {
  if (!token) return t.skip('sign-in failed');
  const r = await fetch(`${URL_}/rest/v1/waitlist?select=id`, { headers: userHeaders(token) });
  const body = await r.text();
  assert.ok(r.status === 401 || r.status === 403, `expected refusal, got ${r.status} ${body}`);
  assert.match(body, /42501/);
});

test('a signed-in user cannot call ping()', async (t) => {
  if (!token) return t.skip('sign-in failed');
  const r = await post('/rest/v1/rpc/ping', {}, userHeaders(token));
  const body = await r.text();
  assert.ok(r.status === 401 || r.status === 403, `expected refusal, got ${r.status} ${body}`);
});

test('a signed-in user can still join the waitlist (a reserved address, never stored)', async (t) => {
  if (!token) return t.skip('sign-in failed');
  const r = await post('/rest/v1/rpc/join_waitlist', { p_email: `w-${RUN}@example.com`, p_source: 'hero' }, userHeaders(token));
  assert.equal(r.status, 204, await r.text());
});

test('a visitor (publishable key only) can call ping()', async () => {
  const r = await post('/rest/v1/rpc/ping', {});
  const body = await r.text();
  assert.equal(r.status, 200, body);
  assert.equal(JSON.parse(body), true);
});
