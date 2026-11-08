import { readFileSync } from 'fs';
import { join } from 'path';
import { AppState } from 'react-native';

import { FakeAuthServer, fakeSession } from '@/testing/fakeAuthServer';
import { fakeLocalStorage } from '@/testing/fakeLocalStorage';
import { fakeFs } from '@/testing/fileSystemFake';

import {
  getCurrentUser,
  getSession,
  onSessionChange,
  resetSessionForTests,
  SESSION_TIMEOUT_MS,
  setSessionFromAuth,
  signOut,
  type SessionEvent,
} from '../session';
import { getSupabase, SESSION_STORAGE_KEY as STORAGE_KEY } from '../supabase';

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
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('overlapping sign-ins', () => {
  // CodeRabbit: A's sign-in answering late (beyond our timeout) mustn't flip the account back
  // after B signed in. A sign-out in between still lets the late verify land (deliberate).
  test('a newer sign-in supersedes an older one that answers late', async () => {
    let releaseOld: (result: unknown) => void = () => {};
    const oldAuth = new Promise((resolve) => (releaseOld = resolve));
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    const stale = setSessionFromAuth(oldAuth as Parameters<typeof setSessionFromAuth>[0]);
    const fresh = await setSessionFromAuth(
      Promise.resolve({
        data: { session: fakeSession({ userId: 'u-2', email: 'kim@example.com' }) },
        error: null,
      }) as Parameters<typeof setSessionFromAuth>[0],
    );
    expect(fresh).toMatchObject({ ok: true, value: { id: 'u-2' } });

    releaseOld({
      data: { session: fakeSession({ userId: 'u-1', email: 'sam@example.com' }) },
      error: null,
    });
    expect(await stale).toEqual({ ok: false, error: 'unknown' });
    const ins = events.filter((event) => event.type === 'signed_in');
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ user: { id: 'u-2' } });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'signed_out', reason: 'switched_account' }));
  });
});

describe('reading the session', () => {
  test('opening the app with a stored session announces nothing (it is not a new sign-in)', async () => {
    storeSession({ userId: 'u-7' });
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    await getCurrentUser();
    await Promise.resolve();

    expect(events).toEqual([]);
  });

  test('opening the app with nothing stored announces nothing', async () => {
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    await getSession();
    await Promise.resolve();

    expect(events).toEqual([]);
  });

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

  // app_metadata.provider is the first method ever used; the account screen shows this sign-in's.
  test('provider is the identity signed in with most recently', async () => {
    storeSession({
      provider: 'email',
      identities: [
        { provider: 'email', last_sign_in_at: '2026-11-01T10:00:00Z' },
        { provider: 'google', last_sign_in_at: '2026-11-05T10:00:00Z' },
        { provider: 'apple', last_sign_in_at: null },
      ],
    });
    expect(await getCurrentUser()).toMatchObject({ ok: true, value: { provider: 'google' } });
  });

  test('without identities, provider falls back to app_metadata.provider', async () => {
    storeSession({ provider: 'google', identities: [] });
    expect(await getCurrentUser()).toMatchObject({ ok: true, value: { provider: 'google' } });
  });

  test('identities with unreadable dates fall back to app_metadata.provider', async () => {
    storeSession({ provider: 'email', identities: [{ provider: 'google', last_sign_in_at: 'soon' }] });
    expect(await getCurrentUser()).toMatchObject({ ok: true, value: { provider: 'email' } });
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

describe('signOut', () => {
  test('clears the session, and listeners hear signed_out (user)', async () => {
    await signInWithCode();
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    expect(await signOut()).toEqual({ ok: true, value: null });

    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual([{ type: 'signed_out', reason: 'user' }]);
    expect(await getCurrentUser()).toEqual({ ok: true, value: null });
  });

  test('offline: the phone is signed out anyway, and the result says offline', async () => {
    await signInWithCode();
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    server.next.logout = 'offline';

    expect(await signOut()).toEqual({ ok: false, error: 'offline' });

    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await getCurrentUser()).toEqual({ ok: true, value: null });
    expect(events).toEqual([{ type: 'signed_out', reason: 'user' }]);
  });

  test('a server error on logout still signs the phone out', async () => {
    await signInWithCode();
    server.next.logout = 'server_error';

    expect(await signOut()).toEqual({ ok: false, error: 'unknown' });
    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('never touches plants, scans or photos on the phone', async () => {
    const photo = 'file:///document/photos/scan-1.jpg';
    fakeFs.put(photo);
    await signInWithCode();

    await signOut();

    expect(fakeFs.uris()).toEqual([photo]);
    for (const file of ['session.ts', 'supabase.ts', 'config.ts', 'errors.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source).not.toMatch(/from '@\/(storage|photos|scan|plants)/);
      expect(source).not.toMatch(/['"]expo-file-system['"]|['"]expo-sqlite['"]/);
    }
  });
});

describe('when the server ends the session', () => {
  test('a refresh the server rejects → signed out with session_expired, heard once', async () => {
    storeSession({ userId: 'u-3', expiresIn: -60 });
    server.next.refresh = 'rejected';
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    // supabase-js refreshes as the client starts, removes the session when the server says no,
    // and then reports "no session" rather than an error.
    const result = await getSession();
    await getSession();

    expect(result).toEqual({ ok: true, value: null });
    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual([{ type: 'signed_out', reason: 'session_expired' }]);
  });

  test('offline: answers within 10 s with offline, and keeps the session (offline is not expiry)', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    storeSession({ userId: 'u-4', expiresIn: -60 });
    server.next.refresh = 'offline';
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    const pending = getSession();
    await jest.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, error: 'offline' });
    expect(JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY)!).user.id).toBe('u-4');
    expect(events).toEqual([]);
    expect(server.callsTo('/auth/v1/token?grant_type=refresh_token')).toBeGreaterThan(1);
  });

  test('a 429 on the refresh of an expired token signs the phone out (supabase-js behaviour)', async () => {
    // supabase-js only keeps the session for network failures and 5xx; any other refresh error
    // with an expired access token removes it. Reported as session_expired.
    storeSession({ userId: 'u-5', expiresIn: -60 });
    server.next.refresh = 'rate_limited';
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    expect(await getSession()).toEqual({ ok: true, value: null });
    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual([{ type: 'signed_out', reason: 'session_expired' }]);
  });

  test('a successful refresh keeps the user signed in and reports refreshed', async () => {
    storeSession({ userId: 'u-6', expiresIn: -60 });
    server.sessionOptions = { userId: 'u-6' };
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    const result = await getCurrentUser();

    expect(result).toMatchObject({ ok: true, value: { id: 'u-6' } });
    expect(server.callsTo('/auth/v1/token?grant_type=refresh_token')).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['refreshed']);
  });
});

describe('break-test fixes', () => {
  // Finding 1: supabase-js refreshes before signing out, so offline with an expired token it used
  // to wait ~40 s and leave the session stored.
  test('signOut offline with an expired token signs the phone out within 10 s', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    storeSession({ userId: 'u-9', expiresIn: -60 });
    server.next.refresh = 'offline';
    server.next.logout = 'offline';
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    let result: unknown = 'pending';
    void signOut().then((r) => (result = r));
    await jest.advanceTimersByTimeAsync(0);

    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual([{ type: 'signed_out', reason: 'user' }]);
    await jest.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect(result).toEqual({ ok: false, error: 'offline' });
    expect(await getCurrentUser()).toEqual({ ok: true, value: null });
  });

  test('signOut removes the PKCE verifier too, and asks the server to end only this session', async () => {
    await signInWithCode();
    fakeLocalStorage.setItem(`${STORAGE_KEY}-code-verifier`, 'verifier');

    expect(await signOut()).toEqual({ ok: true, value: null });

    expect(fakeLocalStorage.getItem(`${STORAGE_KEY}-code-verifier`)).toBeNull();
    const logout = server.fetch.mock.calls.find(([url]) => String(url).includes('/auth/v1/logout'));
    expect(String(logout?.[0])).toContain('scope=local');
  });

  // Finding 3: a listener that throws used to make sign-in throw and starve later listeners.
  test('a listener that throws neither breaks sign-in nor stops the other listeners', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const later = jest.fn();
    onSessionChange(() => {
      throw new Error('listener bug');
    });
    onSessionChange(later);

    const result = await signInWithCode();

    expect(result).toMatchObject({ ok: true });
    expect(later).toHaveBeenCalledWith(expect.objectContaining({ type: 'signed_in' }));
    expect(logged).toHaveBeenCalled();
  });

  // Finding 4: storage failures used to throw out of the Result-returning functions.
  test("a sign-in whose session can't be stored returns unknown instead of throwing", async () => {
    jest.spyOn(fakeLocalStorage, 'setItem').mockImplementation(() => {
      throw new Error('disk full');
    });
    const client = getSupabase()!;

    const result = await setSessionFromAuth(
      client.auth.verifyOtp({ email: 'sam@example.com', token: '123456', type: 'email' }),
    );

    expect(result).toEqual({ ok: false, error: 'unknown' });
  });

  test("signOut when storage can't be cleared returns unknown and says nothing to listeners", async () => {
    await signInWithCode();
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    jest.spyOn(fakeLocalStorage, 'removeItem').mockImplementation(() => {
      throw new Error('disk error');
    });

    expect(await signOut()).toEqual({ ok: false, error: 'unknown' });
    expect(events).toEqual([]);
  });

  // Finding 6: switching accounts used to announce the new user without signing out the old one.
  test('signing in as someone else first signs out the previous user', async () => {
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    server.sessionOptions = { userId: 'u-a', email: 'a@example.com' };
    await signInWithCode();
    server.sessionOptions = { userId: 'u-b', email: 'b@example.com' };
    await signInWithCode();

    expect(events.map((e) => (e.type === 'signed_out' ? `out:${e.reason}` : `${e.type}:${'user' in e ? e.user.id : ''}`))).toEqual([
      'signed_in:u-a',
      'out:switched_account',
      'signed_in:u-b',
    ]);
  });
});

describe('adversarial review fixes (sign-out)', () => {
  const settle = async () => {
    for (let i = 0; i < 300; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 300; i += 1) await Promise.resolve();
  };
  const tag = (e: SessionEvent) => (e.type === 'signed_out' ? `out:${e.reason}` : e.type);
  const sessionKeys = () => fakeLocalStorage.keys().filter((k) => k.startsWith(STORAGE_KEY));

  // Finding 3: a refresh finishing during signOut could save the session again or announce
  // signed_in (supabase-js's own guard only sees its own removal).
  test.each(Array.from({ length: 41 }, (_, n) => n))(
    'a refresh landing %i microtasks around signOut never signs the phone back in',
    async (hops) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      storeSession({ userId: 'u-a', expiresIn: -60 });
      server.sessionOptions = { userId: 'u-a' };
      const release = server.hold('refresh');
      const events: SessionEvent[] = [];
      onSessionChange((event) => events.push(event));
      void getSession();
      await settle();

      release();
      for (let i = 0; i < hops; i += 1) await Promise.resolve();
      await signOut();
      await settle();

      expect(sessionKeys()).toEqual([]);
      expect(await getCurrentUser()).toEqual({ ok: true, value: null });
      const afterOut = events.slice(events.findIndex((e) => e.type === 'signed_out') + 1);
      expect(afterOut.map(tag)).not.toContain('signed_in');
    },
  );

  test('signOut in the same tick the client starts: no signed_in afterwards, and the next sign-in is announced', async () => {
    storeSession({ userId: 'u-a' });
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    await signOut();
    await settle();

    expect(events.map(tag)).toEqual(['out:user']);
    expect(sessionKeys()).toEqual([]);

    server.sessionOptions = { userId: 'u-a' };
    await signInWithCode();
    expect(events.map(tag)).toEqual(['out:user', 'signed_in']);
  });

  test('a real sign-in right after signOut is kept (passing the call to setSessionFromAuth)', async () => {
    await signInWithCode();
    await signOut();
    server.sessionOptions = { userId: 'u-b' };
    const client = getSupabase()!;

    const result = await setSessionFromAuth(
      client.auth.verifyOtp({ email: 'b@example.com', token: '123456', type: 'email' }),
    );
    await settle();

    expect(result).toMatchObject({ ok: true, value: { id: 'u-b' } });
    expect(JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY)!).user.id).toBe('u-b');
  });

  // Finding 14: getSession returned unknown when a signOut landed during its own refresh.
  test('getSession during a concurrent signOut answers no session', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await getSession();
    storeSession({ userId: 'u-a', expiresIn: -60 });
    const release = server.hold('refresh');
    const pending = getSession();
    await settle();
    const out = signOut();
    release();

    expect(await pending).toEqual({ ok: true, value: null });
    await out;
    expect(sessionKeys()).toEqual([]);
  });

  // Finding 4: the server's answer to logout was read wrongly in both directions.
  test('the server already ended the session → ok', async () => {
    await signInWithCode();
    server.next.logout = 'session_gone';
    expect(await signOut()).toEqual({ ok: true, value: null });
  });

  test('expired access token: refreshes once, then ends the session on the server', async () => {
    storeSession({ userId: 'u-a', expiresIn: -60 });
    server.sessionOptions = { userId: 'u-a' };

    expect(await signOut()).toEqual({ ok: true, value: null });
    expect(server.callsTo('/auth/v1/token?grant_type=refresh_token')).toBeGreaterThanOrEqual(1);
    const logout = server.fetch.mock.calls.find(([url]) => String(url).includes('/auth/v1/logout'));
    expect(String(logout?.[0])).toContain('scope=local');
    expect(sessionKeys()).toEqual([]);
  });

  test('the server says the token is bad: refreshes once and retries the logout', async () => {
    await signInWithCode();
    server.next.logout = 'bad_jwt';
    const logoutCalls = () => server.callsTo('/auth/v1/logout');

    const result = await signOut();

    expect(logoutCalls()).toBe(2);
    expect(result).toEqual({ ok: false, error: 'unknown' });
    expect(server.callsTo('/auth/v1/token?grant_type=refresh_token')).toBeGreaterThanOrEqual(1);
    expect(sessionKeys()).toEqual([]);
  });

  test('expired access token and the refresh fails on the network → offline, phone signed out', async () => {
    storeSession({ userId: 'u-a', expiresIn: -60 });
    server.next.refresh = 'offline';
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await signOut()).toEqual({ ok: false, error: 'offline' });
    expect(sessionKeys()).toEqual([]);
  });

  // Finding 11: supabase-js 2.118 keeps PKCE verifiers under per-flow keys.
  test('signOut removes every rebloom-auth key, including per-flow PKCE verifiers', async () => {
    await signInWithCode();
    const client = getSupabase()!;
    await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'rebloom://auth/callback', skipBrowserRedirect: true },
    });
    expect(sessionKeys().length).toBeGreaterThan(1);

    await signOut();

    expect(sessionKeys()).toEqual([]);
  });

  // Finding 12: a failure removing a side key was reported as nothing removed.
  test('a side key that cannot be removed does not stop the sign-out', async () => {
    await signInWithCode();
    fakeLocalStorage.setItem(`${STORAGE_KEY}-code-verifier`, 'verifier');
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    const realRemove = fakeLocalStorage.removeItem.bind(fakeLocalStorage);
    jest.spyOn(fakeLocalStorage, 'removeItem').mockImplementation((key: string) => {
      if (key.endsWith('-code-verifier')) throw new Error('disk error');
      realRemove(key);
    });

    expect(await signOut()).toEqual({ ok: true, value: null });
    expect(fakeLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events.map(tag)).toEqual(['out:user']);
  });

  // Finding 13: signOut with nobody signed in announced signed_out.
  test('signOut with nobody signed in announces nothing', async () => {
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    expect(await signOut()).toEqual({ ok: true, value: null });
    await settle();
    expect(events).toEqual([]);
  });
});
