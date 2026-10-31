// Integration tests for the landing-page waitlist, run against the real project with the public key only
// (the same access a visitor's browser has). No dependencies: Node 18+ built-in test runner.
//
//   node --test "supabase/tests/*.test.mjs"
//
// Test emails use example.com, a reserved domain: join_waitlist() validates them but never stores them,
// so running these tests leaves the live table untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Public by design: the publishable key is what the landing page ships with.
const URL = process.env.SUPABASE_URL ?? 'https://vhxcgmupopeochwvmwcv.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_FsACOB5IUTE3GTxtxbwXsA_DgNlcwzg';
const RUN = Date.now().toString(36);
const headers = { apikey: KEY, 'Content-Type': 'application/json' };

const join = (email, source = 'hero') =>
  fetch(`${URL}/rest/v1/rpc/join_waitlist`, { method: 'POST', headers, body: JSON.stringify({ p_email: email, p_source: source }) });

test('visitors cannot read the waitlist', async () => {
  const r = await fetch(`${URL}/rest/v1/waitlist?select=email`, { headers });
  const body = await r.text();
  // Either refused outright, or (if grants ever change) RLS must still return nothing.
  assert.ok(r.status === 401 || r.status === 403 || (r.ok && JSON.parse(body).length === 0), `${r.status} ${body}`);
});

test('visitors cannot insert into the table directly', async () => {
  const r = await fetch(`${URL}/rest/v1/waitlist`, {
    method: 'POST', headers, body: JSON.stringify({ email: `rebloom-test+direct-${RUN}@example.com`, source: 'hero' }),
  });
  assert.ok(r.status === 401 || r.status === 403, `expected refusal, got ${r.status} ${await r.text()}`);
});

test('a valid email joins', async () => {
  const r = await join(`rebloom-test+${RUN}@example.com`);
  assert.equal(r.status, 204, await r.text());
});

test('the same email again, in another case with invisible characters and spaces, still succeeds', async () => {
  const r = await join(`  \u200BRebloom-Test+${RUN}@Example.COM\uFEFF `, 'final');
  assert.equal(r.status, 204, await r.text());
});

for (const [name, email] of [
  ['empty', ''],
  ['only invisible characters', '\u200B\u200C\uFEFF'],
  ['no @', 'rebloom-test.example.com'],
  ['no domain dot', 'rebloom-test@example'],
  ['spaces inside', 'rebloom test@example.com'],
  ['two @', 'a@b@example.com'],
  ['longer than 254', `rebloom-test+${'x'.repeat(260)}@example.com`],
  // Swarm finding 4: the server accepted anything but @ and whitespace.
  ['control character', 'rebloom\u001b[2Jtest@example.com'],
  ['HTML in the local part', '<img/src=x/onerror=alert(1)>@example.com'],
  ['invisible tag character the old strip list missed', 'rebloom-test\u{E0041}@example.com'],
  ['full-width letter in the domain', 'rebloom-test@\uFF45xample.com'],
  ['empty domain label', 'rebloom-test@example..com'],
]) {
  test(`rejects an invalid email: ${name}`, async () => {
    const r = await join(email);
    const body = await r.text();
    assert.equal(r.status, 400, body);
    assert.match(body, /invalid_email/);
  });
}

test('rejects an unknown source', async () => {
  const r = await join(`rebloom-test+src-${RUN}@example.com`, "hero'; drop table waitlist; --");
  assert.equal(r.status, 400, await r.text());
});

// Free projects pause after a week without traffic; .github/workflows/supabase-keepalive.yml calls this.
test('the keep-alive ping answers', async () => {
  const r = await fetch(`${URL}/rest/v1/rpc/ping`, { method: 'POST', headers, body: '{}' });
  assert.equal(r.status, 200, await r.text());
});

test('a null email is rejected, not stored', async () => {
  const r = await fetch(`${URL}/rest/v1/rpc/join_waitlist`, { method: 'POST', headers, body: JSON.stringify({ p_email: null, p_source: 'hero' }) });
  assert.equal(r.status, 400, await r.text());
});
