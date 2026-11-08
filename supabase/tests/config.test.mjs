// Static checks on supabase/config.toml, the local stack's auth settings (no network).
// Production's dashboard settings are set by the accounts spec; this keeps local close to them.
//
//   node --test "supabase/tests/*.test.mjs"   (static, no network)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const configPath = new URL('supabase/config.toml', ROOT);

// Just enough TOML for flat `key = value` lines under `[section]` headers.
function readToml(text) {
  const sections = {};
  let current = (sections[''] = {});
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      current = sections[header[1]] ??= {};
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    const value = pair[2].replace(/\s+#.*$/, '');
    current[pair[1]] =
      value === 'true' ? true
      : value === 'false' ? false
      : /^-?\d+$/.test(value) ? Number(value)
      : value.startsWith('"') ? JSON.parse(value)
      : value;
  }
  return sections;
}

const config = existsSync(configPath) ? readToml(readFileSync(configPath, 'utf8')) : null;

test('supabase/config.toml exists (supabase init)', () => {
  assert.ok(config, 'run `npx supabase@3 init` in the repo root');
  assert.equal(config[''].project_id, 'rebloom');
});

test('no anonymous accounts, no phone sign-in; email sign-in by code is on', () => {
  assert.equal(config.auth.enable_anonymous_sign_ins, false);
  assert.equal(config.auth.enable_signup, true, 'email-code sign-in creates the account on first use');
  assert.equal(config['auth.sms'].enabled, false);
  assert.equal(config['auth.email'].enabled, true);
});

test('an email address counts only once its owner has confirmed it', () => {
  assert.equal(config['auth.email'].enable_confirmations, true);
});

test('email codes are 6 digits and last 10 minutes', () => {
  assert.equal(config['auth.email'].otp_length, 6);
  assert.equal(config['auth.email'].otp_expiry, 600);
});

for (const name of ['magic_link', 'confirmation']) {
  test(`the ${name} email sends the code and no link`, () => {
    const template = config[`auth.email.template.${name}`];
    assert.ok(template, `missing [auth.email.template.${name}]`);
    assert.match(template.subject, /\{\{ \.Token \}\}/);
    const file = new URL(template.content_path.replace(/^\.\//, ''), ROOT);
    assert.ok(existsSync(file), `template file not found: ${template.content_path}`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /\{\{ \.Token \}\}/);
    assert.doesNotMatch(html, /ConfirmationURL|TokenHash|<a\s|<img\s/i);
  });
}

// The platform's verify_jwt check only understands the legacy JWT keys; delete-account checks the
// caller's token itself (supabase/functions/delete-account/index.ts).
test('delete-account checks its own token: verify_jwt off, and the function exists', () => {
  assert.equal(config?.['functions.delete-account']?.verify_jwt, false);
  assert.ok(existsSync(new URL('supabase/functions/delete-account/index.ts', ROOT)));
});
