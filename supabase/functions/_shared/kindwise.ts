// Calls to plant.id with the Kindwise key (a function secret). Used by diagnose and, to delete a
// user's copies with the account, by delete-account.

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

/** Best effort: never throws. 404 (already gone) counts as done. */
export async function deleteAtKindwise(token: string): Promise<void> {
  if (!KINDWISE_KEY) return;
  const r = await kindwise('DELETE', identificationUrl(KINDWISE_BASE, token)).catch(() => null);
  if (!r) console.error('[kindwise] delete failed: no answer');
  else if (!r.ok && r.status !== 404) console.error('[kindwise] delete failed', r.status);
}
