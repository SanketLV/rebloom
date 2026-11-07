// Sign-in, and account deletion, for the account screens. Every sign-in goes through
// setSessionFromAuth, so all of them behave the same. Nothing here touches plants, scans or photos.

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { withTimeout } from '@/lib/async';

import { toBackendError, type BackendError } from './errors';
import { SESSION_TIMEOUT_MS, setSessionFromAuth, signOut, type Result, type SessionUser } from './session';
import { getSupabase } from './supabase';

// Deleting can take longer than a sign-in call (the server removes the user's rows).
const DELETE_TIMEOUT_MS = 20_000;

/** Sends a 6-digit code to `email` (already normalized), creating the account if it's new. */
export async function sendEmailCode(email: string): Promise<Result<null>> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };
  try {
    const { error } = await withTimeout(
      supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }),
      SESSION_TIMEOUT_MS,
    );
    return error ? { ok: false, error: toBackendError(error) } : { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: toBackendError(error) };
  }
}

/**
 * Signs in with the code. A wrong, used or expired code → `invalid_code`. If the answer comes
 * after the timeout and the sign-in went through, listeners still hear `signed_in`.
 */
export async function verifyEmailCode(email: string, code: string): Promise<Result<SessionUser>> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };
  return setSessionFromAuth(
    withTimeout(supabase.auth.verifyOtp({ email, token: code, type: 'email' }), SESSION_TIMEOUT_MS),
  );
}

function functionError(error: unknown): BackendError {
  if (error instanceof FunctionsFetchError) return 'offline';
  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
    const status = (error.context as Response | undefined)?.status;
    if (status === 401) return 'session_expired';
    if (status === 429) return 'rate_limited';
    return 'unknown';
  }
  return toBackendError(error);
}

/**
 * Deletes the signed-in user's account on the server (the `delete-account` function, which reads
 * the user from the token sent with the call), then signs this phone out. On any failure the
 * phone stays signed in and nothing is deleted here.
 *
 * `afterDelete` runs once the server has deleted the account and before the phone is signed out,
 * so a screen can leave before the sign-out changes it. The sign-out's local part is immediate;
 * telling the server isn't waited for (the account is already gone).
 */
export async function deleteAccount(afterDelete?: () => void): Promise<Result<null>> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };
  try {
    const { error } = await withTimeout(
      supabase.functions.invoke('delete-account', { method: 'POST' }),
      DELETE_TIMEOUT_MS,
    );
    if (error) return { ok: false, error: functionError(error) };
  } catch (error) {
    return { ok: false, error: functionError(error) };
  }
  try {
    afterDelete?.();
  } catch (error) {
    console.error('[auth] afterDelete threw', error);
  }
  void signOut();
  return { ok: true, value: null };
}
