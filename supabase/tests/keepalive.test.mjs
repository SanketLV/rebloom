// Swarm finding 1: Supabase wants "a few requests each day" or a free project pauses, and a paused project
// loses every sign-up. Keep the keep-alive schedule at least daily.
//
//   node --test "supabase/tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../../.github/workflows/supabase-keepalive.yml', import.meta.url), 'utf8');

test('keep-alive runs at least once a day', () => {
  const cron = yml.match(/cron:\s*'([^']+)'/)?.[1];
  assert.ok(cron, 'no cron schedule found');
  const [, hour, dom, month, dow] = cron.split(/\s+/);
  assert.equal(dom, '*', `day-of-month must be "*", got ${dom}`);
  assert.equal(month, '*', `month must be "*", got ${month}`);
  assert.equal(dow, '*', `day-of-week must be "*", got ${dow}`);
  assert.ok(hour === '*' || hour.includes('/') || hour.includes(','), `expected several runs a day, got hour field ${hour}`);
});

test('keep-alive job allows for curl retries', () => {
  const minutes = Number(yml.match(/timeout-minutes:\s*(\d+)/)?.[1]);
  assert.ok(minutes >= 5, `timeout-minutes ${minutes} is shorter than curl's retries`);
});
