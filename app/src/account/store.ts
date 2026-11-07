// Who is signed in, for the Settings card and the account screens. Starts on the first subscribe,
// never at app start (an app start makes no request). It listens before it reads, so a refresh the
// server rejects during that read still arrives as `expired`.
//
// ponytail: `expired` is kept in memory only, so after a restart an expired account shows as a
// guest (who can still sign in). Persist it if that ever confuses anyone.

import { useSyncExternalStore } from 'react';

import { getCurrentUser, onSessionChange, type SessionEvent, type SessionUser } from '@/backend/session';

export type AccountState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'offline' }
  | { status: 'guest'; notice?: 'deleted' }
  | { status: 'expired' }
  | { status: 'signed_in'; user: SessionUser };

const LOADING: AccountState = { status: 'loading' };

let state: AccountState = LOADING;
let started = false;
let stopListening: (() => void) | null = null;
// Bumped by every session event, so a read that started before one can't overwrite it.
let version = 0;
let deletedPending = false;
const listeners = new Set<() => void>();

function set(next: AccountState) {
  state = next;
  for (const listener of [...listeners]) listener();
}

function handle(event: SessionEvent) {
  version += 1;
  if (event.type === 'signed_in' || event.type === 'refreshed') {
    deletedPending = false;
    set({ status: 'signed_in', user: event.user });
  } else if (deletedPending) {
    deletedPending = false;
    set({ status: 'guest', notice: 'deleted' });
  } else if (event.reason === 'session_expired') {
    set({ status: 'expired' });
  } else {
    set({ status: 'guest' });
  }
}

/** Reads the session again; also the "Try again" after `offline`. */
export async function refreshAccount(): Promise<void> {
  const at = version;
  const result = await getCurrentUser();
  if (version !== at) return;
  if (result.ok) {
    if (result.value) set({ status: 'signed_in', user: result.value });
    else if (state.status !== 'expired' && state.status !== 'guest') set({ status: 'guest' });
    return;
  }
  if (result.error === 'not_configured') set({ status: 'unconfigured' });
  else if (result.error === 'session_expired') set({ status: 'expired' });
  else set({ status: 'offline' });
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    stopListening = onSessionChange(handle);
    void refreshAccount();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getAccountState(): AccountState {
  return state;
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribeAccount, getAccountState);
}

/** After a delete, so the Settings card says the account is gone (before or after its sign-out). */
export function noteAccountDeleted(): void {
  // Already signed out (by the delete, or a session that expired meanwhile): say it's deleted.
  if (state.status === 'guest' || state.status === 'expired') set({ status: 'guest', notice: 'deleted' });
  else deletedPending = true;
}

/** Tests only. */
export function resetAccountForTests(): void {
  stopListening?.();
  stopListening = null;
  listeners.clear();
  started = false;
  version = 0;
  deletedPending = false;
  state = LOADING;
}
