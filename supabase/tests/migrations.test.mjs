// Static checks on the migration files (no network). Every migration keeps its version: production
// records versions, so a renamed or re-dated file would be run again (or skipped) by
// `supabase db push --remote`. A new migration is added to EXPECTED on purpose, at the end.
//
//   node --test "supabase/tests/*.test.mjs"   (static, no network)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const TESTS = new URL('./', import.meta.url);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

const EXPECTED = [
  // Recorded on production (task 1 of the supabase-foundation plan).
  '20261031143232_waitlist.sql',
  '20261031144424_waitlist_hardening.sql',
  '20261031173425_waitlist_swarm_fixes.sql',
  '20261031173802_waitlist_trim_order.sql',
  // supabase-foundation, pushed in task 16.
  '20261104050000_ping_grant.sql',
  '20261104060000_default_privileges.sql',
  '20261104070000_no_password_signups.sql',
];

test('every migration is the expected file, in order (none renamed, re-dated or slipped in)', () => {
  assert.deepEqual(files, EXPECTED);
});

test('every migration starts with its own 14-digit version and a snake_case name', () => {
  const versions = files.map((f) => {
    assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, `bad migration file name: ${f}`);
    return f.slice(0, 14);
  });
  assert.equal(new Set(versions).size, versions.length, 'two migrations share a version');
});

function sqlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = new URL(name, dir);
    if (statSync(path).isDirectory()) return sqlFiles(new URL(`${name}/`, dir));
    return name.endsWith('.sql') || name.endsWith('.pg') ? [path] : [];
  });
}

test('every .sql file anywhere under supabase/tests is a pgTAP test (supabase test db runs them all)', () => {
  const notPgTap = sqlFiles(TESTS)
    .filter((url) => {
      const sql = readFileSync(url, 'utf8');
      return !/select plan\(\d+\)/i.test(sql) || !/finish\(\)/i.test(sql) || !/^\s*rollback;/im.test(sql);
    })
    .map((url) => url.pathname.split('/supabase/tests/')[1]);
  assert.deepEqual(notPgTap, [], 'SQL-editor scripts go in supabase/scripts/; pgTAP files need plan(), finish() and rollback');
});
