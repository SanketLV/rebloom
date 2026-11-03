import { AppState } from 'react-native';

import { FakeAuthServer, fakeSession } from '@/testing/fakeAuthServer';
import { fakeLocalStorage } from '@/testing/fakeLocalStorage';

import {
  getCurrentUser,
  getSession,
  onSessionChange,
  resetSessionForTests,
  setSessionFromAuth,
  signOut,
  type SessionEvent,
} from '../session';
import { getSupabase } from '../supabase';

// The default storage key supabase-js derives from the project URL (sb-<ref>-auth-token).
const STORAGE_KEY = 'sb-abc-auth-token';

let server: FakeAuthServer;

function storeSession(options: Parameters<typeof fakeSession>[0] = {}) {
  fakeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(fakeSession(options)));
}

async function signInWithCode() {
  const client = getSupabase()!;
  return setSessionFromAuth(
    await client.auth.verifyOtp({ email: 'sam@example.com', token: '123456', type: 'email' }),
  );
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  server = new FakeAuthServer();
  globalThis.fetch = server.fetch as unknown as typeof fetch;
});

afterEach(() => {
  resetSessionForTests();
});

describe('reading the session', () => {
  test('nothing stored → null, without a request', async () => {
    expect(await getSession()).toEqual({ ok: true, value: null });
    expect(await getCurrentUser()).toEqual({ ok: true, value: null });
    expect(server.fetch).not.toHaveBeenCalled();
  });

  test('a stored session survives a restart and is read without a request', async () => {
    storeSession({ userId: 'u-1', email: 'sam@example.com', provider: 'google' });

    const user = await getCurrentUser();

    expect(user).toEqual({ ok: true, value: { id: 'u-1', email: 'sam@example.com', provider: 'google' } });
    expect(server.fetch).not.toHaveBeenCalled();
  });

  test('backend not configured → not_configured everywhere', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(await getSession()).toEqual({ ok: false, error: 'not_configured' });
    expect(await getCurrentUser()).toEqual({ ok: false, error: 'not_configured' });
    expect(await signOut()).toEqual({ ok: false, error: 'not_configured' });
    expect(await setSessionFromAuth({ data: { session: null }, error: null })).toEqual({
      ok: false,
      error: 'not_configured',
    });
    const unsubscribe = onSessionChange(jest.fn());
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});

describe('setSessionFromAuth', () => {
  test('a sign-in result is stored, and listeners hear signed_in once', async () => {
    server.sessionOptions = { userId: 'u-2', email: 'kim@example.com', provider: 'email' };
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    const result = await signInWithCode();

    expect(result).toEqual({ ok: true, value: { id: 'u-2', email: 'kim@example.com', provider: 'email' } });
    expect(JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY)!).user.id).toBe('u-2');
    await Promise.resolve();
    expect(events.filter((e) => e.type === 'signed_in')).toEqual([
      { type: 'signed_in', user: { id: 'u-2', email: 'kim@example.com', provider: 'email' } },
    ]);
  });

  test('a failed sign-in maps the error and stores nothing', async () => {
    server.next.verify = 'rate_limited';
    expect(await signInWithCode()).toEqual({ ok: false, error: 'rate_limited' });
    server.next.verify = 'offline';
    expect(await signInWithCode()).toEqual({ ok: false, error: 'offline' });
    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('a result with no session and no error is unknown', async () => {
    expect(await setSessionFromAuth({ data: { session: null }, error: null })).toEqual({
      ok: false,
      error: 'unknown',
    });
  });

  test('unsubscribing stops the calls', async () => {
    const listener = jest.fn();
    const unsubscribe = onSessionChange(listener);
    unsubscribe();

    await signInWithCode();
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });
});
