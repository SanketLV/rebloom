// Static checks on the migration files (no network). The first four must keep the version numbers
// production recorded, or `supabase db push --remote` would try to run them again.
//
//   node --test "supabase/tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const TESTS = new URL('./', import.meta.url);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

test('the waitlist migrations keep the versions recorded on production', () => {
  assert.deepEqual(files.slice(0, 4), [
    '20261031143232_waitlist.sql',
    '20261031144424_waitlist_hardening.sql',
    '20261031173425_waitlist_swarm_fixes.sql',
    '20261031173802_waitlist_trim_order.sql',
  ]);
});

test('every migration starts with its own 14-digit version and a snake_case name', () => {
  const versions = files.map((f) => {
    assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, `bad migration file name: ${f}`);
    return f.slice(0, 14);
  });
  assert.equal(new Set(versions).size, versions.length, 'two migrations share a version');
});

test('supabase/tests holds no loose .sql files (supabase test db runs every one as pgTAP)', () => {
  const loose = readdirSync(TESTS).filter((f) => f.endsWith('.sql'));
  assert.deepEqual(loose, [], 'move SQL-editor scripts to supabase/scripts/, pgTAP tests to supabase/tests/database/');
});
