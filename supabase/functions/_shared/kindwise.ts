// Calls to plant.id with the Kindwise key (a function secret). Used by diagnose and, to delete a
// user's copies with the account, by delete-account.
//
// Deleting a copy at Kindwise can fail (Kindwise down, a timeout). The token is then kept in
// `kindwise_deletions` (the database queues it when its request row goes) until a delete goes
// through: the diagnose sweep retries what is left (PR #32 review).

import { admin } from './caller.ts';
import { identificationUrl } from '../diagnose/kindwise.ts';

export const KINDWISE_KEY = Deno.env.get('KINDWISE_API_KEY') ?? '';
export const KINDWISE_BASE = Deno.env.get('KINDWISE_BASE_URL') ?? 'https://plant.id';
const REQUEST_MS = 10_000; // one Kindwise HTTP call

export function kindwise(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { 'Api-Key': KINDWISE_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_MS),
  });
}

/** Never throws. True once Kindwise no longer has it (deleted, or 404: already gone). */
export async function deleteAtKindwise(token: string): Promise<boolean> {
  if (!KINDWISE_KEY) return false;
  const r = await kindwise('DELETE', identificationUrl(KINDWISE_BASE, token)).catch(() => null);
  if (!r) console.error('[kindwise] delete failed: no answer');
  else if (!r.ok && r.status !== 404) console.error('[kindwise] delete failed', r.status);
  return !!r && (r.ok || r.status === 404);
}

/** Deletes a queued token's copy at Kindwise, then the token. Never throws; on failure it stays queued. */
export async function forget(token: string): Promise<void> {
  if (!(await deleteAtKindwise(token))) return;
  const { error } = await admin.from('kindwise_deletions').delete().eq('access_token', token);
  if (error) console.error('[kindwise] could not unqueue a deleted token', error.code);
}

/** A token no request row holds (the scan went while Kindwise worked): queue it, then forget it. */
export async function discard(token: string): Promise<void> {
  const { error } = await admin
    .from('kindwise_deletions')
    .upsert({ access_token: token }, { ignoreDuplicates: true });
  if (error) console.error('[kindwise] could not queue a token', error.code);
  await forget(token);
}

/** Retries up to `limit` queued deletions, oldest first. Never throws. */
export async function drainDeletions(limit: number): Promise<void> {
  const { data, error } = await admin
    .from('kindwise_deletions')
    .select('access_token')
    .order('created_at')
    .limit(limit);
  if (error) return console.error('[kindwise] could not read the deletion queue', error.code);
  for (const row of (data ?? []) as { access_token: string }[]) await forget(row.access_token);
}
