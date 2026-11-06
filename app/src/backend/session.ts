// The only module that reads or changes the Supabase session. Sign-in screens (accounts spec)
// hand their results to setSessionFromAuth; everything else reads through here. Nothing here
// touches plants, scans or photos on the phone.

import {
  isAuthApiError,
  isAuthSessionMissingError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type Subscription,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { TimeoutError, withTimeout } from '@/lib/async';

import { getBackendConfig } from './config';
import { toBackendError, type BackendError } from './errors';
import {
  blockSessionWrites,
  getSupabase,
  resetSupabaseForTests,
  SESSION_STORAGE_KEY,
} from './supabase';

export type Result<T> = { ok: true; value: T } | { ok: false; error: BackendError };

export type SessionUser = { id: string; email: string | null; provider: string | null };

export type SessionEvent =
  | { type: 'signed_in'; user: SessionUser }
  | { type: 'refreshed'; user: SessionUser }
  | { type: 'signed_out'; reason: 'user' | 'session_expired' | 'switched_account' };

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
// After signOut(), the phone stays signed out until a sign-in goes through setSessionFromAuth.
// signOut clears storage itself, so supabase-js's own guards don't see it, and supabase-js can still
// bring the old session back (a refresh that was in flight, an event queued while it started):
// such a session is removed again and never announced.
let blockedUntilSignIn = false;

function setBlocked(blocked: boolean) {
  blockedUntilSignIn = blocked;
  blockSessionWrites(blocked);
}

function toUser(session: Session): SessionUser {
  const provider = session.user.app_metadata?.provider;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    provider: typeof provider === 'string' ? provider : null,
  };
}

// Listeners run inside supabase-js's event handling and inside sign-in calls: one that throws must
// not fail the sign-in or keep the others from hearing the event.
function emit(event: SessionEvent) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      console.error('[session] a listener threw', error);
    }
  }
}

function noteSignedIn(user: SessionUser) {
  if (currentUserId && currentUserId !== user.id) {
    // Another account signed in without a sign-out first: end the previous one for listeners.
    currentUserId = null;
    announcedUserId = null;
    emit({ type: 'signed_out', reason: 'switched_account' });
  }
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
  if (blockedUntilSignIn && event !== 'SIGNED_OUT') {
    if (session && hasStoredSession()) removeSessionKeys();
    return;
  }
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
  if (blockedUntilSignIn) {
    if (hasStoredSession()) removeSessionKeys();
    return { ok: true, value: null };
  }
  // Nothing stored: no session, without waiting on supabase-js (which may still be retrying a
  // refresh it started before a sign-out).
  if (!hasStoredSession()) {
    if (currentUserId === undefined) currentUserId = null;
    return { ok: true, value: null };
  }
  let response: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  try {
    response = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, error: error instanceof TimeoutError ? 'offline' : toBackendError(error) };
  }
  const { data, error } = response;
  // A signOut landed while supabase-js was working: the answer is "signed out", whatever it says.
  if (blockedUntilSignIn) return { ok: true, value: null };
  if (error) {
    if (!hasStoredSession()) return { ok: true, value: null };
    return { ok: false, error: toBackendError(error) };
  }
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

/**
 * The one place every sign-in method's result goes, so all of them behave the same. Pass the call
 * itself (`setSessionFromAuth(supabase.auth.verifyOtp(...))`): supabase-js throws, rather than
 * returning an error, when the session can't be stored, and that becomes `unknown` here.
 */
export async function setSessionFromAuth(
  pending: AuthResult | Promise<AuthResult>,
): Promise<Result<SessionUser>> {
  if (!client()) {
    Promise.resolve(pending).catch(() => {});
    return { ok: false, error: 'not_configured' };
  }
  // A sign-in is starting: let its session through (set before awaiting, so the SIGNED_IN that
  // supabase-js sends during the call isn't taken for the old session coming back).
  const wasBlocked = blockedUntilSignIn;
  setBlocked(false);
  const fail = (error: BackendError): Result<SessionUser> => {
    setBlocked(wasBlocked);
    return { ok: false, error };
  };
  let result: AuthResult;
  try {
    result = await pending;
  } catch (error) {
    return fail(toBackendError(error));
  }
  if (result.error) return fail(toBackendError(result.error));
  const session = result.data?.session;
  if (!session) return fail('unknown');
  // supabase-js has already stored it; tell listeners now (its own SIGNED_IN is then a no-op).
  const user = toUser(session);
  noteSignedIn(user);
  return { ok: true, value: user };
}

function hasStoredSession(): boolean {
  try {
    return globalThis.localStorage.getItem(SESSION_STORAGE_KEY) !== null;
  } catch {
    return true; // can't tell: let supabase-js decide (its errors map to a code)
  }
}

type StoredSession = { access_token: string; refresh_token?: string; expires_at?: number };

function storedSession(): StoredSession | null {
  try {
    const raw = globalThis.localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    return parsed && typeof parsed.access_token === 'string' ? (parsed as StoredSession) : null;
  } catch {
    return null;
  }
}

/**
 * Removes every key supabase-js keeps under our storage key (the session, `-user`, PKCE
 * verifiers, whose layout changes between versions), the session itself last. Returns false only
 * if the session itself is still stored.
 */
function removeSessionKeys(): boolean {
  const storage = globalThis.localStorage;
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key !== SESSION_STORAGE_KEY && key.startsWith(`${SESSION_STORAGE_KEY}-`)) {
        keys.push(key);
      }
    }
  } catch {
    keys.push(`${SESSION_STORAGE_KEY}-code-verifier`, `${SESSION_STORAGE_KEY}-user`);
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // A side key left behind holds no session; keep going.
    }
  }
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

const isBadJwt = (error: AuthError) =>
  isAuthApiError(error) && (error.code === 'bad_jwt' || error.status === 401);

const serverSessionGone = (error: AuthError) =>
  isAuthSessionMissingError(error) ||
  (isAuthApiError(error) && (error.code === 'user_not_found' || error.status === 404));

/**
 * A fresh access token for the logout call, straight from the token endpoint so supabase-js's
 * state isn't touched. `null` value: the server no longer knows this refresh token (nothing to end).
 */
async function freshAccessToken(refreshToken: string | undefined): Promise<Result<string | null>> {
  const config = getBackendConfig();
  if (!config.configured || !refreshToken) return { ok: true, value: null };
  const response = await globalThis.fetch(
    `${config.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (response.status === 429) return { ok: false, error: 'rate_limited' };
  if (response.status >= 500) return { ok: false, error: 'unknown' };
  if (!response.ok) return { ok: true, value: null };
  const body = (await response.json()) as { access_token?: unknown };
  return typeof body.access_token === 'string'
    ? { ok: true, value: body.access_token }
    : { ok: false, error: 'unknown' };
}

/** Tells the server to end this session only. The phone is already signed out. */
async function endServerSession(
  supabase: SupabaseClient,
  stored: StoredSession,
): Promise<Result<null>> {
  const done: Result<null> = { ok: true, value: null };
  const expired =
    typeof stored.expires_at === 'number' && stored.expires_at * 1000 <= Date.now() + 30_000;
  let token: string | null = stored.access_token;
  if (expired) {
    const fresh = await freshAccessToken(stored.refresh_token);
    if (!fresh.ok) return fresh;
    if (!fresh.value) return done;
    token = fresh.value;
  }
  let { error } = await supabase.auth.admin.signOut(token, 'local');
  if (error && isBadJwt(error) && !expired) {
    const fresh = await freshAccessToken(stored.refresh_token);
    if (!fresh.ok) return fresh;
    if (!fresh.value) return done;
    ({ error } = await supabase.auth.admin.signOut(fresh.value, 'local'));
  }
  if (!error || serverSessionGone(error)) return done;
  return { ok: false, error: toBackendError(error) };
}

/**
 * Signs this phone out at once, even offline: the stored session is removed here, not by
 * supabase-js (which refreshes an expired token first and, offline, keeps the session). Then the
 * server is told to end this session only, within SESSION_TIMEOUT_MS, refreshing an expired access
 * token once to do it; if it can't be told the result says so, but the phone is signed out either
 * way. Plants, scans and photos are untouched.
 */
export async function signOut(): Promise<Result<null>> {
  const supabase = client();
  if (!supabase) return { ok: false, error: 'not_configured' };
  const stored = storedSession();
  const wasSignedIn = stored !== null || typeof currentUserId === 'string';

  setBlocked(true);
  if (!removeSessionKeys()) {
    // The session is still on the phone: say so, and don't tell listeners it's gone.
    setBlocked(false);
    return { ok: false, error: 'unknown' };
  }
  signingOut = true;
  if (wasSignedIn) noteSignedOut();
  else currentUserId = null;
  signingOut = false;

  if (!stored) return { ok: true, value: null };
  let result: Result<null>;
  try {
    result = await withTimeout(endServerSession(supabase, stored), SESSION_TIMEOUT_MS);
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof TimeoutError ? 'offline' : toBackendError(error),
    };
  }
  // A refresh supabase-js had in flight may have saved the session again meanwhile (its event,
  // when it comes, is ignored): remove it before returning, so a restart can't restore it.
  if (blockedUntilSignIn && hasStoredSession()) removeSessionKeys();
  return result;
}

/** Tests only. */
export function resetSessionForTests(): void {
  subscription?.unsubscribe();
  subscription = null;
  listeners.clear();
  currentUserId = undefined;
  announcedUserId = null;
  signingOut = false;
  setBlocked(false);
  resetSupabaseForTests();
}
