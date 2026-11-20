// POST /functions/v1/delete-account: deletes the account of whoever calls it.
//
// The caller comes only from their own access token (Authorization: Bearer …), checked by the
// Auth server (../_shared/caller.ts). The request body is never read, so no one can name another
// user. The user's rows go with them through `on delete cascade` (supabase/README.md).
//
// 204: deleted, or already gone (a retry after a lost reply must succeed). 401: Auth refused the
// token (only that: never an outage). 405: not POST. 503: Auth couldn't be asked. 500: the delete
// failed. Nothing about an error is sent back.

import { admin, caller } from '../_shared/caller.ts';

const reply = (status: number) => new Response(null, { status });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405);

  const who = await caller(request, 'delete-account');
  if (who.kind === 'gone') return reply(204);
  if (who.kind === 'unavailable') return reply(503);
  if (who.kind === 'refused') return reply(401);

  const { error } = await admin.auth.admin.deleteUser(who.user.id);
  if (error && error.code !== 'user_not_found') {
    console.error('[delete-account] delete failed', error.status, error.code);
    return reply(500);
  }
  return reply(204);
});
