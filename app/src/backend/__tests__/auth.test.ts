import { readFileSync } from 'fs';
import { join } from 'path';
import { AppState } from 'react-native';

import { FakeAuthServer, fakeSession } from '@/testing/fakeAuthServer';
import { fakeLocalStorage } from '@/testing/fakeLocalStorage';
import { fakeFs } from '@/testing/fileSystemFake';

import { deleteAccount, sendEmailCode, verifyEmailCode } from '../auth';
import { getCurrentUser, onSessionChange, resetSessionForTests, type SessionEvent } from '../session';
import { SESSION_STORAGE_KEY } from '../supabase';

let server: FakeAuthServer;

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

const otpCalls = () => server.calls.filter((c) => c.path === '/auth/v1/otp');
const deleteCalls = () => server.calls.filter((c) => c.path === '/functions/v1/delete-account');

describe('sendEmailCode', () => {
  test('asks for a code once, creating the account if needed', async () => {
    expect(await sendEmailCode('sam@example.com')).toEqual({ ok: true, value: null });
    expect(otpCalls()).toHaveLength(1);
    expect(otpCalls()[0].body).toMatchObject({ email: 'sam@example.com', create_user: true });
  });

  test('too many sends → rate_limited', async () => {
    server.next.otp = 'rate_limited';
    expect(await sendEmailCode('sam@example.com')).toEqual({ ok: false, error: 'rate_limited' });
  });

  test('no network → offline', async () => {
    server.next.otp = 'offline';
    expect(await sendEmailCode('sam@example.com')).toEqual({ ok: false, error: 'offline' });
  });

  test('an address the server refuses → unknown, never the server text', async () => {
    server.next.otp = 'rejected';
    expect(await sendEmailCode('sam@example.com')).toEqual({ ok: false, error: 'unknown' });
  });

  test('a send that never answers → offline after the timeout, not an endless spinner', async () => {
    jest.useFakeTimers();
    server.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const pending = sendEmailCode('sam@example.com');
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, error: 'offline' });
  });

  test('backend not configured → not_configured, no request', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(await sendEmailCode('sam@example.com')).toEqual({ ok: false, error: 'not_configured' });
    expect(server.fetch).not.toHaveBeenCalled();
  });
});

describe('verifyEmailCode', () => {
  test('a right code signs in with type email, and listeners hear it', async () => {
    server.sessionOptions = { userId: 'u-1', email: 'sam@example.com' };
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));

    const result = await verifyEmailCode('sam@example.com', '123456');

    expect(result).toEqual({ ok: true, value: { id: 'u-1', email: 'sam@example.com', provider: 'email' } });
    const verify = server.calls.find((c) => c.path === '/auth/v1/verify');
    expect(verify?.body).toMatchObject({ email: 'sam@example.com', token: '123456', type: 'email' });
    expect(events.filter((e) => e.type === 'signed_in')).toHaveLength(1);
  });

  test('a wrong or used code → invalid_code, still signed out', async () => {
    server.next.verify = 'rejected';
    expect(await verifyEmailCode('sam@example.com', '000000')).toEqual({
      ok: false,
      error: 'invalid_code',
    });
    expect(await getCurrentUser()).toEqual({ ok: true, value: null });
  });

  test('too many tries → rate_limited; offline → offline', async () => {
    server.next.verify = 'rate_limited';
    expect(await verifyEmailCode('sam@example.com', '123456')).toEqual({ ok: false, error: 'rate_limited' });
    server.next.verify = 'offline';
    expect(await verifyEmailCode('sam@example.com', '123456')).toEqual({ ok: false, error: 'offline' });
  });

  test('a verify that never answers → offline after the timeout', async () => {
    jest.useFakeTimers();
    server.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const pending = verifyEmailCode('sam@example.com', '123456');
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, error: 'offline' });
  });

  test('backend not configured → not_configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(await verifyEmailCode('sam@example.com', '123456')).toEqual({
      ok: false,
      error: 'not_configured',
    });
  });
});

describe('deleteAccount', () => {
  function signedIn() {
    fakeLocalStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fakeSession({ userId: 'u-1' })));
  }

  test('calls the function with the user token, then signs this phone out', async () => {
    signedIn();
    const token = JSON.parse(fakeLocalStorage.getItem(SESSION_STORAGE_KEY)!).access_token;
    const events: SessionEvent[] = [];
    onSessionChange((event) => events.push(event));
    await getCurrentUser();

    expect(await deleteAccount()).toEqual({ ok: true, value: null });

    expect(deleteCalls()).toHaveLength(1);
    expect(deleteCalls()[0].method).toBe('POST');
    expect(deleteCalls()[0].authorization).toBe(`Bearer ${token}`);
    expect(fakeLocalStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(events).toContainEqual({ type: 'signed_out', reason: 'user' });
  });

  test('never touches plants or photos on the phone', async () => {
    signedIn();
    const photo = 'file:///document/photos/scan-1.jpg';
    fakeFs.put(photo);
    await deleteAccount();
    expect(fakeFs.uris()).toEqual([photo]);
    const source = readFileSync(join(__dirname, '..', 'auth.ts'), 'utf8');
    expect(source).not.toMatch(/from '@\/(storage|photos|scan|plants)/);
    expect(source).not.toMatch(/['"]expo-file-system['"]|['"]expo-sqlite['"]/);
  });

  test.each([
    ['server_error', 'unknown'],
    ['offline', 'offline'],
    ['rate_limited', 'rate_limited'],
    ['unauthorized', 'session_expired'],
  ] as const)('the function answers %s → %s, still signed in', async (mode, error) => {
    signedIn();
    server.next.deleteAccount = mode;
    expect(await deleteAccount()).toEqual({ ok: false, error });
    expect(fakeLocalStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  test('a delete that never answers → offline after the timeout, still signed in', async () => {
    signedIn();
    jest.useFakeTimers();
    server.fetch.mockImplementation(async (input) =>
      String(input).includes('/functions/v1/') ? new Promise<Response>(() => {}) : new Response('{}'),
    );
    const pending = deleteAccount();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, error: 'offline' });
    expect(fakeLocalStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  test('backend not configured → not_configured, no request', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(await deleteAccount()).toEqual({ ok: false, error: 'not_configured' });
    expect(server.fetch).not.toHaveBeenCalled();
  });
});
