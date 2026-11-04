// The one Supabase client, made on first use and never at import, so an app start that doesn't
// use the backend makes no client, opens no session store and sends nothing.
// Setup follows the Expo SDK 58 "Using Supabase" guide, plus PKCE for browser sign-in.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { getBackendConfig } from './config';

/**
 * Where the session lives in localStorage. Set explicitly (supabase-js would derive
 * `sb-<ref>-auth-token`) so signOut can clear it without asking supabase-js, which refreshes
 * first. supabase-js also uses `<key>-code-verifier` (PKCE) and `<key>-user`.
 */
export const SESSION_STORAGE_KEY = 'rebloom-auth';

let client: SupabaseClient | null = null;
let sessionWritesBlocked = false;

/**
 * While the user has signed out, supabase-js may not write the session back (a refresh it had in
 * flight would otherwise save it again, after signOut cleared it). PKCE verifiers still go through,
 * so a browser sign-in can start. session.ts lifts this when a sign-in begins.
 */
export function blockSessionWrites(blocked: boolean): void {
  sessionWritesBlocked = blocked;
}

const isSessionKey = (key: string) =>
  key === SESSION_STORAGE_KEY || key === `${SESSION_STORAGE_KEY}-user`;

// What supabase-js reads and writes: the SQLite-backed localStorage, with the block above.
const sessionStorage = {
  getItem: (key: string) => globalThis.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (sessionWritesBlocked && isSessionKey(key)) return;
    globalThis.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => globalThis.localStorage.removeItem(key),
};
let appStateSubscription: NativeEventSubscription | null = null;

function followAppState(auth: SupabaseClient['auth']) {
  // React Native has no page visibility events, so token refresh runs only while the app is in
  // the foreground (SDK 58 guide). `change` doesn't fire for the state the app is already in.
  const apply = (state: AppStateStatus) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  };
  appStateSubscription = AppState.addEventListener('change', apply);
  if (AppState.currentState === 'active') apply('active');
}

/** The client, or `null` when the backend isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const config = getBackendConfig();
  if (!config.configured) return null;

  // Installs the SQLite-backed `localStorage` only now, on first use.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sqlite/localStorage/install');

  try {
    client = createClient(config.url, config.key, {
      auth: {
        storage: sessionStorage,
        storageKey: SESSION_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
      // Looked up per request, so a fetch swapped in later (tests, polyfills) is used.
      global: { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) },
    });
  } catch (error) {
    // A config readBackendConfig accepted but supabase-js didn't: no backend, never a crash.
    console.error('[backend] could not create the Supabase client', error);
    client = null;
    return null;
  }
  followAppState(client.auth);
  return client;
}

/** Tests only: stop the refresh timer, drop the listener and forget the client. */
export function resetSupabaseForTests(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
  if (client) void client.auth.stopAutoRefresh();
  client = null;
  sessionWritesBlocked = false;
}
