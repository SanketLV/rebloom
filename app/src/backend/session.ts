// The only module that reads or changes the Supabase session. Sign-in screens (accounts spec)
// hand their results to setSessionFromAuth; everything else reads through here. Nothing here
// touches plants, scans or photos on the phone.

import type { AuthChangeEvent, Session, Subscription, SupabaseClient } from '@supabase/supabase-js';

import { TimeoutError, withTimeout } from '@/lib/async';

import { toBackendError, type BackendError } from './errors';
import { getSupabase, resetSupabaseForTests } from './supabase';

export type Result<T> = { ok: true; value: T } | { ok: false; error: BackendError };

export type SessionUser = { id: string; email: string | null; provider: string | null };

export type SessionEvent =
  | { type: 'signed_in'; user: SessionUser }
  | { type: 'refreshed'; user: SessionUser }
  | { type: 'signed_out'; reason: 'user' | 'session_expired' };

type SessionListener = (event: SessionEvent) => void;

/** What every supabase-js sign-in method returns (verifyOtp, exchangeCodeForSession, …). */
type AuthResult = { data: { session: Session | null } | null; error: unknown };

// supabase-js retries a refresh for up to ~30 s while offline; never make a caller wait that long.
export const SESSION_TIMEOUT_MS = 10_000;

const listeners = new Set<SessionListener>();
let subscription: Subscription | null = null;
// Who is signed in, as far as we know: a user id, null (signed out), undefined (not known yet).
let currentUserId: string | null | undefined;
// The user listeners last heard `signed_in` for. A session restored at start-up isn't announced.
let announcedUserId: string | null = null;
// Set only while signOut() runs, to tell a sign-out the user asked for from one the server forced.
let signingOut = false;

function toUser(session: Session): SessionUser {
  const provider = session.user.app_metadata?.provider;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    provider: typeof provider === 'string' ? provider : null,
  };
}

function emit(event: SessionEvent) {
  for (const listener of [...listeners]) listener(event);
}

function noteSignedIn(user: SessionUser) {
  currentUserId = user.id;
  if (announcedUserId === user.id) return;
  announcedUserId = user.id;
  emit({ type: 'signed_in', user });
}

function noteSignedOut() {
  if (currentUserId === null) return;
  currentUserId = null;
  announcedUserId = null;
  emit({ type: 'signed_out', reason: signingOut ? 'user' : 'session_expired' });
}

function handleAuthChange(event: AuthChangeEvent, session: Session | null) {
  if (event === 'SIGNED_OUT') return noteSignedOut();
  if (event === 'INITIAL_SESSION') {
    if (currentUserId === undefined) currentUserId = session ? session.user.id : null;
    return;
  }
  if (!session) return;
  const user = toUser(session);
  if (currentUserId === undefined) {
    // supabase-js restoring the stored session as the client starts: not a new sign-in.
    currentUserId = user.id;
    if (event === 'TOKEN_REFRESHED') emit({ type: 'refreshed', user });
    return;
  }
  if (currentUserId !== user.id) return noteSignedIn(user);
  if (event === 'TOKEN_REFRESHED') emit({ type: 'refreshed', user });
}

/** The client with our auth listener attached, or null when the backend isn't configured. */
function client(): SupabaseClient | null {
  const supabase = getSupabase();
  if (supabase && !subscription) {
    // Never call other auth methods inside this callback (supabase-js holds a lock while it runs).
    subscription = supabase.auth.onAuthStateChange(handleAuthChange).data.subscription;
  }
  return supabase;
}

/**
 * The stored session, or null. Makes a request only when the stored token has expired, and
 * answers within SESSION_TIMEOUT_MS (`offline`, session kept) if that refresh can't get through.
 */
export async function getSession(): Promise<Result<Session | null>> {
  const supabase = client();
  if (!supabase) return { ok: false, error: 'not_configured' };
  let response: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  try {
    response = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, error: error instanceof TimeoutError ? 'offline' : toBackendError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: toBackendError(error) };
  if (data.session && currentUserId === undefined) currentUserId = data.session.user.id;
  if (!data.session && currentUserId === undefined) currentUserId = null;
  return { ok: true, value: data.session };
}

export async function getCurrentUser(): Promise<Result<SessionUser | null>> {
  const result = await getSession();
  if (!result.ok) return result;
  return { ok: true, value: result.value ? toUser(result.value) : null };
}

/** Called on sign-in, refresh, sign-out and expiry. Returns an unsubscribe function. */
export function onSessionChange(listener: SessionListener): () => void {
  client();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The one place every sign-in method's result goes, so all of them behave the same. */
export async function setSessionFromAuth(result: AuthResult): Promise<Result<SessionUser>> {
  if (!client()) return { ok: false, error: 'not_configured' };
  if (result.error) return { ok: false, error: toBackendError(result.error) };
  const session = result.data?.session;
  if (!session) return { ok: false, error: 'unknown' };
  // supabase-js has already stored it; tell listeners now (its own SIGNED_IN is then a no-op).
  const user = toUser(session);
  noteSignedIn(user);
  return { ok: true, value: user };
}

export async function signOut(): Promise<Result<null>> {
  const supabase = client();
  if (!supabase) return { ok: false, error: 'not_configured' };
  signingOut = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // The phone must end up signed out even when the server can't be told. supabase-js 2.118
      // already clears the session here; this covers a version that doesn't.
      await supabase.auth.signOut({ scope: 'local' });
      return { ok: false, error: toBackendError(error) };
    }
    return { ok: true, value: null };
  } finally {
    signingOut = false;
  }
}

/** Tests only. */
export function resetSessionForTests(): void {
  subscription?.unsubscribe();
  subscription = null;
  listeners.clear();
  currentUserId = undefined;
  announcedUserId = null;
  signingOut = false;
  resetSupabaseForTests();
}
