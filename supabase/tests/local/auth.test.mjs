// Sign-in and access rules through the real Supabase API on the LOCAL stack: Auth (GoTrue),
// the data API (PostgREST) and the local mail catcher (Mailpit). Needs `supabase start`.
//
//   node --test "supabase/tests/local/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { KEY, RUN, URL_, readCode } from './guard.mjs';

const json = { 'Content-Type': 'application/json' };
const anonHeaders = { apikey: KEY, ...json };
const userHeaders = (token) => ({ ...anonHeaders, Authorization: `Bearer ${token}` });
const EMAIL = `rebloom-local-${RUN}@example.com`;

async function post(path, body, headers = anonHeaders) {
  return fetch(`${URL_}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
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

// The app's messages depend on these answers (accounts plan, D1 and task 1): a wrong code and a
// used one can't be told apart, and the identities say which method signed in this time.
test('a wrong code and a used code get the same answer; identities carry last_sign_in_at', async () => {
  const email = `codes-${RUN}@example.com`;
  const sent = await post('/auth/v1/otp', { email, create_user: true });
  assert.equal(sent.status, 200, await sent.text());
  const { code } = await readCode(email);

  const verifyWith = (token) => post('/auth/v1/verify', { type: 'email', email, token });
  const expectInvalid = async (r, what) => {
    const body = await r.json();
    assert.equal(r.status, 403, `${what}: ${JSON.stringify(body)}`);
    assert.equal(body.error_code, 'otp_expired', `${what}: ${JSON.stringify(body)}`);
  };

  await expectInvalid(await verifyWith(code === '000000' ? '111111' : '000000'), 'wrong code');

  const verified = await verifyWith(code);
  const session = await verified.json();
  assert.equal(verified.status, 200, JSON.stringify(session));
  const identities = session.user?.identities ?? [];
  assert.equal(identities.length, 1, JSON.stringify(identities));
  assert.equal(identities[0].provider, 'email');
  assert.ok(!Number.isNaN(Date.parse(identities[0].last_sign_in_at)), 'no last_sign_in_at');

  await expectInvalid(await verifyWith(code), 'used code');
});

test('a second code requested too soon is rate limited', async () => {
  const email = `resend-${RUN}@example.com`;
  const first = await post('/auth/v1/otp', { email, create_user: true });
  assert.equal(first.status, 200, await first.text());
  const again = await post('/auth/v1/otp', { email, create_user: true });
  const body = await again.json();
  assert.equal(again.status, 429, JSON.stringify(body));
  assert.equal(body.error_code, 'over_email_send_rate_limit');
});

test('a password set by someone else before the owner signs up never signs in', async () => {
  const victim = `takeover-${RUN}@example.com`;
  const password = 'Sup3r-secret-pw!';
  const signIn = () => post('/auth/v1/token?grant_type=password', { email: victim, password });

  // The attacker signs up with the victim's address. The account stays unconfirmed...
  await post('/auth/v1/signup', { email: victim, password });
  const early = await signIn();
  assert.ok(!early.ok, `an unconfirmed account must not sign in, got ${early.status} ${await early.text()}`);

  // ...until the owner signs in by code, which confirms it and clears the attacker's password.
  const sent = await post('/auth/v1/otp', { email: victim, create_user: true });
  assert.equal(sent.status, 200, await sent.text());
  const { code } = await readCode(victim);
  const verified = await post('/auth/v1/verify', { type: 'email', email: victim, token: code });
  assert.equal(verified.status, 200, await verified.text());

  const late = await signIn();
  assert.ok(!late.ok, `the attacker's password must not sign in after the owner confirms, got ${late.status}`);
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
