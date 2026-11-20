// /functions/v1/diagnose: the one holder of KINDWISE_API_KEY. Sends the caller's photo to plant.id
// (species + health), counts free scans per user and month, and caps Kindwise credits per day.
// Spec: .planning/specs/kindwise-diagnosis.md; decisions D1-D7 in .planning/plans/kindwise-diagnosis.md.
//
// POST   { scan_id, images: [base64 JPEG] } → 200 result | 202 { status: "pending" } | errors below
// GET    ?scan_id=… → 200 result | 202 pending | 404 (nothing for this caller)   (free: Kindwise GET)
// DELETE ?scan_id=… → 204 (the app has saved the result: delete the Kindwise copy and our row)
//
// Errors: { error: { code, message } }. 400 bad_request · 401 unauthorized · 405 · 409 in_progress ·
// 413 image_too_large · 422 not_a_plant · 429 quota_exceeded (+ resets_at) · 502 upstream_failed ·
// 503 daily_cap | unavailable. Stores no photo and no result; never logs the body.

import { admin, caller } from '../_shared/caller.ts';
import { deleteAtKindwise, kindwise, KINDWISE_BASE, KINDWISE_KEY } from '../_shared/kindwise.ts';
import { createBody, identificationUrl, kindwiseStatus, mapResult, validateBody } from './kindwise.ts';

// 3 photos of 2 MB as base64, plus room for the JSON around them.
const MAX_BODY_BYTES = 3 * Math.ceil((2 * 1024 * 1024) / 3) * 4 + 64 * 1024;
const POLL_EVERY_MS = 1_500;
const POST_POLL_MS = 15_000; // the app waits 20 s in all
const GET_POLL_MS = 5_000;
const SWEEP_LIMIT = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: { code, message, ...extra } });
const pending = () => json(202, { status: 'pending' });

// Kindwise ended the identification (FAILED, or refused the token): it will never finish.
class Upstream extends Error {}

/** Polls until done or out of time: the finished identification, or null (still running). */
async function poll(token: string, budgetMs: number): Promise<unknown | null> {
  const until = Date.now() + budgetMs;
  for (;;) {
    const r = await kindwise('GET', identificationUrl(KINDWISE_BASE, token)).catch(() => null);
    if (r?.ok) {
      const raw = await r.json().catch(() => null);
      const status = kindwiseStatus(raw);
      if (status === 'done') return raw;
      if (status === 'failed') throw new Upstream('identification failed');
    } else if (r && r.status !== 429 && r.status < 500) {
      throw new Upstream(`identification ${r.status}`);
    }
    if (Date.now() + POLL_EVERY_MS > until) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.code} ${error.message}`);
  return data as T;
}

/** Plan D7: rows older than 7 days (the app never confirmed). Best effort, never fails a request. */
async function sweep() {
  try {
    const rows = await rpc<{ user_id: string; scan_id: string; access_token: string | null }[]>(
      'expired_diagnoses', { p_limit: SWEEP_LIMIT },
    );
    for (const row of rows ?? []) {
      if (row.access_token) await deleteAtKindwise(row.access_token);
      await rpc('end_diagnosis', { p_user: row.user_id, p_scan: row.scan_id });
    }
  } catch (error) {
    console.error('[diagnose] sweep failed', String(error));
  }
}

function background(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
}

// Polls a token and answers: the result, 202 while Kindwise works, or 502 once it has failed for
// good (the scan is given back, the credits stay spent: plan D3).
async function answer(
  userId: string,
  scanId: string,
  token: string,
  budgetMs: number,
  extra: Record<string, unknown>,
) {
  let done: unknown | null;
  try {
    done = await poll(token, budgetMs);
  } catch (error) {
    if (!(error instanceof Upstream)) throw error;
    console.error('[diagnose] kindwise gave up', error.message);
    await deleteAtKindwise(token);
    await rpc('fail_diagnosis', { p_user: userId, p_scan: scanId, p_release_credits: false });
    return fail(502, 'upstream_failed', "We couldn't check this photo.");
  }
  return done ? finish(userId, scanId, token, done, extra) : pending();
}

/** A finished identification → the answer for the app (not-a-plant gives the scan back). */
async function finish(userId: string, scanId: string, token: string, raw: unknown, extra: Record<string, unknown>) {
  const mapped = mapResult(raw);
  if (!mapped.is_plant.binary) {
    await deleteAtKindwise(token);
    await rpc('fail_diagnosis', { p_user: userId, p_scan: scanId, p_release_credits: false });
    return fail(422, 'not_a_plant', "This doesn't look like a plant.");
  }
  return json(200, { ...mapped, ...extra });
}

// The body as text, or null once it passes `max` bytes: never holds more than that in memory
// (anyone can make an anonymous account). The gateway may drop Content-Length, so count.
async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function post(request: Request, userId: string) {
  const text = await readLimited(request, MAX_BODY_BYTES);
  if (text === null) return fail(413, 'image_too_large', 'Each photo must be 2 MB or less.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, 'bad_request', 'The body must be JSON.');
  }
  const body = validateBody(raw);
  if (!body.ok) {
    return body.status === 413
      ? fail(413, 'image_too_large', 'Each photo must be 2 MB or less.')
      : fail(400, 'bad_request', 'Send a scan_id and 1 to 3 JPEG photos.');
  }
  const { scanId, images } = body;

  const begun = await rpc<{ outcome: string; access_token?: string; scans_left?: number; resets_at?: string }>(
    'begin_diagnosis', { p_user: userId, p_scan: scanId },
  );
  const left = { scans_left: begun.scans_left, resets_at: begun.resets_at };
  switch (begun.outcome) {
    case 'running':
      return fail(409, 'in_progress', 'This scan is still being checked.');
    case 'quota':
      return fail(429, 'quota_exceeded', "You've used your free scans this month.", { resets_at: begun.resets_at });
    case 'daily_cap':
      return fail(503, 'daily_cap', 'Diagnosis is busy today. Try again tomorrow.');
    case 'has_token':
      return answer(userId, scanId, begun.access_token!, POST_POLL_MS, left);
  }

  background(sweep());

  // Kindwise create. No token: the user's scan is given back; the credits only when Kindwise
  // answered with a refusal (no answer at all: it may have accepted, and charged, it).
  let token: string | null = null;
  let refused = false;
  try {
    const r = await kindwise('POST', identificationUrl(KINDWISE_BASE), createBody(images));
    const created = r.ok ? await r.json().catch(() => null) : null;
    if (!r.ok) {
      refused = true;
      console.error('[diagnose] kindwise create failed', r.status);
    }
    token = typeof created?.access_token === 'string' && created.access_token ? created.access_token : null;
  } catch (error) {
    console.error('[diagnose] kindwise create failed', String(error));
  }
  if (!token) {
    await rpc('fail_diagnosis', { p_user: userId, p_scan: scanId, p_release_credits: refused });
    return fail(502, 'upstream_failed', "We couldn't check this photo.");
  }
  await rpc('attach_token', { p_user: userId, p_scan: scanId, p_token: token });

  // Kindwise has accepted (and charged) it: from here only not-a-plant or a FAILED identification
  // gives the scan back (plan D2, D3).
  return answer(userId, scanId, token, POST_POLL_MS, left);
}

async function requestRow(userId: string, scanId: string) {
  const { data, error } = await admin
    .from('diagnosis_requests')
    .select('access_token')
    .eq('user_id', userId)
    .eq('scan_id', scanId)
    .maybeSingle();
  if (error) throw new Error(`diagnosis_requests: ${error.code}`);
  return data as { access_token: string | null } | null;
}

async function get(userId: string, scanId: string) {
  const row = await requestRow(userId, scanId);
  if (!row) return fail(404, 'not_found', 'Nothing found for this scan.');
  if (!row.access_token) return pending();
  return answer(userId, scanId, row.access_token, GET_POLL_MS, {});
}

async function remove(userId: string, scanId: string) {
  const row = await requestRow(userId, scanId);
  if (row?.access_token) await deleteAtKindwise(row.access_token);
  if (row) await rpc('end_diagnosis', { p_user: userId, p_scan: scanId });
  return new Response(null, { status: 204 });
}

Deno.serve(async (request) => {
  if (!['POST', 'GET', 'DELETE'].includes(request.method)) return new Response(null, { status: 405 });
  if (!KINDWISE_KEY) {
    console.error('[diagnose] KINDWISE_API_KEY is not set');
    return fail(503, 'unavailable', 'Diagnosis is not available right now.');
  }

  const who = await caller(request, 'diagnose');
  if (who.kind === 'unavailable') return fail(503, 'unavailable', 'Diagnosis is not available right now.');
  if (who.kind !== 'user') return fail(401, 'unauthorized', 'Sign-in needed.');
  const userId = who.user.id;

  try {
    if (request.method === 'POST') return await post(request, userId);
    const scanId = new URL(request.url).searchParams.get('scan_id') ?? '';
    if (!UUID.test(scanId)) return fail(400, 'bad_request', 'Send a scan_id.');
    return request.method === 'GET' ? await get(userId, scanId) : await remove(userId, scanId);
  } catch (error) {
    console.error('[diagnose] failed', String(error));
    return fail(503, 'unavailable', 'Diagnosis is not available right now.');
  }
});
