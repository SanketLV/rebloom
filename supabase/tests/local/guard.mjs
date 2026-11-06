// Shared setup for the tests that talk to the LOCAL Supabase stack (`supabase start`). They make
// users and send emails, so they must never reach production: anything but a local address stops
// the run before a single request.
//
//   node --test "supabase/tests/local/*.test.mjs"
//
// Values come from SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / MAILPIT_URL when set, otherwise from
// `npx -y supabase@3 status -o json` (run from the repo root).

import { execSync } from 'node:child_process';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function isLocal(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' && LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function stop(message) {
  console.error(`\nsupabase/tests/local: ${message}\n`);
  process.exit(1);
}

function statusFromCli() {
  let out;
  try {
    out = execSync('npx -y supabase@3 status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    stop('could not read `supabase status`. Start the local stack first: npx supabase@3 start');
  }
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  try {
    return JSON.parse(json);
  } catch {
    stop('could not parse `supabase status -o json`. Set SUPABASE_PUBLISHABLE_KEY by hand.');
  }
}

const envUrl = process.env.SUPABASE_URL;
if (envUrl && !isLocal(envUrl)) {
  stop(`refusing to run against ${envUrl}: these tests make users and send email, local stack only.`);
}

let status = null;
if (!envUrl || !process.env.SUPABASE_PUBLISHABLE_KEY) status = statusFromCli();

export const URL_ = envUrl ?? status?.API_URL ?? 'http://127.0.0.1:54321';
export const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? status?.PUBLISHABLE_KEY ?? status?.ANON_KEY;
export const MAILPIT = process.env.MAILPIT_URL ?? status?.MAILPIT_URL ?? status?.INBUCKET_URL ?? 'http://127.0.0.1:54324';

if (!isLocal(URL_)) stop(`refusing to run against ${URL_}: local stack only.`);
if (!isLocal(MAILPIT)) stop(`refusing to read mail from ${MAILPIT}: local stack only.`);
if (!KEY) stop('no publishable key found. Set SUPABASE_PUBLISHABLE_KEY (see `npx supabase@3 status`).');

export const RUN = Date.now().toString(36);
