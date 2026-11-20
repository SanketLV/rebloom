// Calls to the `diagnose` Edge Function (supabase/functions/diagnose). The Kindwise key lives only
// there. Each call first makes sure there is a session the server trusts: the user's own, or the
// invisible anonymous one (ensureScanSession). Nothing here reads or writes plants, scans or photos.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { ensureScanSession } from './session';
import { getSupabase } from './supabase';

export type DiagnoseOutcome =
  | { kind: 'done'; body: unknown } // the function's 200 body; diagnosis/kindwiseMap reads it
  | { kind: 'pending' } // counted, still running at Kindwise: ask again with getDiagnose
  | { kind: 'not_plant' }
  | { kind: 'quota'; resetsAt: string | null }
  | { kind: 'busy' } // today's credit cap
  | { kind: 'server' } // 502: Kindwise refused or gave up; the scan was given back
  | { kind: 'error' } // anything else: the scan may or may not have been counted
  | { kind: 'offline' }
  | { kind: 'not_found' } // GET: the server has nothing for this scan
  | { kind: 'not_configured' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_PROGRESS_RETRIES = 5;
const IN_PROGRESS_WAIT_MS = 2_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// One call: the function polls Kindwise for up to 15 s. Past this the call counts as offline, so a
// hung request can never block the scan or My Plants' pass.
export const CALL_TIMEOUT_MS = 25_000;

type Call = { status: number; body: unknown } | { status: 'offline' };

async function invoke(path: string, method: 'POST' | 'GET' | 'DELETE', body?: Record<string, unknown>): Promise<Call | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error, response } = await supabase.functions.invoke(path, {
    method,
    body,
    timeout: CALL_TIMEOUT_MS,
  });
  if (error instanceof FunctionsFetchError) return { status: 'offline' };
  if (error instanceof FunctionsHttpError) {
    const context = error.context as Response;
    const parsed = await context.json().catch(() => null);
    return { status: context.status, body: parsed };
  }
  if (error) return { status: 500, body: null };
  return { status: response?.status ?? 200, body: data };
}

function outcome(call: Call): DiagnoseOutcome {
  if (call.status === 'offline') return { kind: 'offline' };
  const error = (call.body as { error?: { code?: unknown; resets_at?: unknown } } | null)?.error;
  switch (call.status) {
    case 200:
      return { kind: 'done', body: call.body };
    case 202:
      return { kind: 'pending' };
    case 404:
      return { kind: 'not_found' };
    case 422:
      return { kind: 'not_plant' };
    case 429: {
      const resetsAt = typeof error?.resets_at === 'string' && !Number.isNaN(Date.parse(error.resets_at))
        ? error.resets_at
        : null;
      return { kind: 'quota', resetsAt };
    }
    case 502:
      return { kind: 'server' };
    case 503:
      return error?.code === 'daily_cap' ? { kind: 'busy' } : { kind: 'error' };
    default:
      return { kind: 'error' };
  }
}

// One request with a session, a 401 retried once (the session may have just been replaced),
// a 409 ("this scan is already being checked") retried every 2 s.
async function send(path: string, method: 'POST' | 'GET', body?: Record<string, unknown>): Promise<DiagnoseOutcome> {
  let retriedAuth = false;
  for (let attempt = 0; ; attempt += 1) {
    const session = await ensureScanSession();
    if (!session.ok) return session.error === 'not_configured' ? { kind: 'not_configured' } : { kind: 'offline' };
    const call = await invoke(path, method, body);
    if (!call) return { kind: 'not_configured' };
    if (call.status === 401) {
      if (retriedAuth) return { kind: 'error' };
      retriedAuth = true;
      continue;
    }
    if (call.status === 409) {
      if (attempt >= IN_PROGRESS_RETRIES) return { kind: 'pending' };
      await wait(IN_PROGRESS_WAIT_MS);
      continue;
    }
    return outcome(call);
  }
}

/** Sends one prepared photo (bare base64 JPEG) for `scanId`. A repeat of the same scan is free. */
export function postDiagnose(scanId: string, imageBase64: string): Promise<DiagnoseOutcome> {
  return send('diagnose', 'POST', { scan_id: scanId, images: [imageBase64] });
}

/** The result of a scan sent earlier (the app was closed mid-call). Free. */
export function getDiagnose(scanId: string): Promise<DiagnoseOutcome> {
  if (!UUID.test(scanId)) return Promise.resolve({ kind: 'not_found' });
  return send(`diagnose?scan_id=${scanId}`, 'GET');
}

/**
 * The result is saved on the phone: the server deletes Kindwise's copy and its own row (plan D1).
 * Best effort: never throws; a lost confirm is cleaned up by the server after 7 days.
 */
export async function confirmDiagnose(scanId: string): Promise<void> {
  if (!UUID.test(scanId)) return;
  try {
    await invoke(`diagnose?scan_id=${scanId}`, 'DELETE');
  } catch {
    // the server sweeps it
  }
}
