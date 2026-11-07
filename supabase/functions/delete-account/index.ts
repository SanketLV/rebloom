// POST /functions/v1/delete-account: deletes the account of whoever calls it.
//
// The caller comes only from their own access token (Authorization: Bearer …), checked by the
// Auth server. The request body is never read, so no one can name another user. The user's rows go
// with them through `on delete cascade` (supabase/README.md, table template).
//
// 204: deleted, or already gone (a retry after a lost reply must succeed). 401: Auth refused the
// token (only that: never an outage). 405: not POST. 503: Auth couldn't be asked. 500: the delete
// failed. Nothing about an error is sent back.
//
// verify_jwt is off in config.toml: the platform check only understands the legacy JWT keys.

import { createClient, isAuthApiError, isAuthSessionMissingError } from 'npm:@supabase/supabase-js@2.118.0';

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = JSON.parse(keys).default;
      if (typeof key === 'string' && key) return key;
    } catch {
      // fall through to the legacy key
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('no secret key in the function environment');
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const reply = (status: number) => new Response(null, { status });

function bearer(request: Request): string | null {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

const isUserGone = (error: { code?: string; status?: number } | null) =>
  error?.code === 'user_not_found';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405);

  const token = bearer(request);
  if (!token) return reply(401);

  // getUser asks the Auth server, so it works with legacy and asymmetric signing keys alike, and
  // refuses keys and tokens without a user (publishable, secret, anon and service_role JWTs).
  const { data, error } = await admin.auth.getUser(token);
  if (isUserGone(error)) return reply(204);
  // 401 only when Auth itself refused the token (an API error below 500, or a revoked session,
  // which supabase-js reports as AuthSessionMissingError). Anything else (network error, 5xx, an
  // unreadable answer) means Auth couldn't be asked: not the caller's fault, and never "signed out".
  const refused =
    isAuthSessionMissingError(error) || (isAuthApiError(error) && (error.status ?? 500) < 500);
  if (error && !refused) {
    console.error('[delete-account] auth check failed', error.status, error.code);
    return reply(503);
  }
  if (error || !data.user || data.user.role !== 'authenticated') return reply(401);

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError && !isUserGone(deleteError)) {
    console.error('[delete-account] delete failed', deleteError.status, deleteError.code);
    return reply(500);
  }
  return reply(204);
});
