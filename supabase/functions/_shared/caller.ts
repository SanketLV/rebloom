// Who is calling, from their own access token only (Authorization: Bearer …), checked by the Auth
// server. Shared by every function that acts for a user (delete-account, diagnose).
//
// verify_jwt is off in config.toml: the platform check only understands the legacy JWT keys.

import {
  createClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from 'npm:@supabase/supabase-js@2.118.0';

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

/** The client with the secret key. Never send anything it returns to a caller unchecked. */
export const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function bearer(request: Request): string | null {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * - `user`: the token belongs to this user (anonymous users included: their role is `authenticated`).
 * - `gone`: the token was fine but its user no longer exists.
 * - `refused`: no token, or Auth refused it (an API error below 500, a revoked session, an API key,
 *   a token without a user). Answer 401.
 * - `unavailable`: Auth couldn't be asked (network error, 5xx, unreadable answer). Answer 503, never
 *   401: an outage must not read as "signed out".
 */
export type Caller =
  | { kind: 'user'; user: User }
  | { kind: 'gone' }
  | { kind: 'refused' }
  | { kind: 'unavailable' };

export async function caller(request: Request, name: string): Promise<Caller> {
  const token = bearer(request);
  if (!token) return { kind: 'refused' };
  // getUser asks the Auth server, so it works with legacy and asymmetric signing keys alike, and
  // refuses keys and tokens without a user (publishable, secret, anon and service_role JWTs).
  const { data, error } = await admin.auth.getUser(token);
  if (error?.code === 'user_not_found') return { kind: 'gone' };
  const refused =
    isAuthSessionMissingError(error) || (isAuthApiError(error) && (error.status ?? 500) < 500);
  if (error && !refused) {
    console.error(`[${name}] auth check failed`, error.status, error.code);
    return { kind: 'unavailable' };
  }
  if (error || !data.user || data.user.role !== 'authenticated') return { kind: 'refused' };
  return { kind: 'user', user: data.user };
}
