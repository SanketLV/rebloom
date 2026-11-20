import { AppState } from 'react-native';

import { fakeSession } from '@/testing/fakeAuthServer';
import { FakeDiagnoseServer, SICK_BODY } from '@/testing/fakeDiagnoseServer';
import { fakeLocalStorage } from '@/testing/fakeLocalStorage';

import { CALL_TIMEOUT_MS, confirmDiagnose, getDiagnose, postDiagnose } from '../diagnose';
import { resetSessionForTests } from '../session';
import { SESSION_STORAGE_KEY } from '../supabase';

let server: FakeDiagnoseServer;
const SCAN = '6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const IMAGE = '/9j/4AAQ';

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  server = new FakeDiagnoseServer();
  globalThis.fetch = server.fetch as unknown as typeof fetch;
});

afterEach(() => {
  resetSessionForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('first scan: makes an anonymous account, sends scan_id and the photo with its token', async () => {
  expect(await postDiagnose(SCAN, IMAGE)).toEqual({ kind: 'done', body: SICK_BODY });
  expect(server.callsTo('/auth/v1/signup')).toBe(1);
  const [call] = server.diagnoseCalls;
  expect(call).toMatchObject({ method: 'POST', body: { scan_id: SCAN, images: [IMAGE] } });
  const token = JSON.parse(fakeLocalStorage.getItem(SESSION_STORAGE_KEY)!).access_token;
  expect(call.authorization).toBe(`Bearer ${token}`);
});

test('a signed-in user scans with their own account', async () => {
  fakeLocalStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fakeSession({ userId: 'u-email' })));
  await postDiagnose(SCAN, IMAGE);
  expect(server.callsTo('/auth/v1/signup')).toBe(0);
});

test.each([
  [{ status: 202 as const }, { kind: 'pending' }],
  [{ status: 422 as const }, { kind: 'not_plant' }],
  [{ status: 429 as const, resetsAt: '2026-12-01T00:00:00Z' }, { kind: 'quota', resetsAt: '2026-12-01T00:00:00Z' }],
  [{ status: 503 as const, code: 'daily_cap' as const }, { kind: 'busy' }],
  [{ status: 503 as const }, { kind: 'error' }],
  [{ status: 502 as const }, { kind: 'server' }],
  [{ status: 404 as const }, { kind: 'not_found' }],
  ['offline' as const, { kind: 'offline' }],
])('server answers %j → %j', async (answer, outcome) => {
  server.answers = [answer];
  expect(await postDiagnose(SCAN, IMAGE)).toEqual(outcome);
});

test('a quota answer without a readable reset time keeps the kind, with no date', async () => {
  server.answers = [{ status: 429, resetsAt: 'not a date' }];
  expect(await postDiagnose(SCAN, IMAGE)).toEqual({ kind: 'quota', resetsAt: null });
});

test('no session can be made (offline) → offline, nothing sent', async () => {
  server.next.signup = 'offline';
  expect(await postDiagnose(SCAN, IMAGE)).toEqual({ kind: 'offline' });
  expect(server.diagnoseCalls).toEqual([]);
});

test('backend not configured → not_configured', async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  expect(await postDiagnose(SCAN, IMAGE)).toEqual({ kind: 'not_configured' });
});

test('in progress (409) is retried every 2 s, then answers', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  server.answers = [{ status: 409 }, { status: 409 }, { status: 200, body: SICK_BODY }];
  const pending = postDiagnose(SCAN, IMAGE);
  await jest.advanceTimersByTimeAsync(4_100);
  expect(await pending).toEqual({ kind: 'done', body: SICK_BODY });
  expect(server.callsOf('POST')).toBe(3);
});

test('still in progress after 5 retries → pending', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  server.answers = [{ status: 409 }];
  const pending = postDiagnose(SCAN, IMAGE);
  await jest.advanceTimersByTimeAsync(11_000);
  expect(await pending).toEqual({ kind: 'pending' });
  expect(server.callsOf('POST')).toBe(6);
});

test('a 401 is retried once with a fresh session, then counts as an error', async () => {
  server.answers = [{ status: 401 }];
  expect(await postDiagnose(SCAN, IMAGE)).toEqual({ kind: 'error' });
  expect(server.callsOf('POST')).toBe(2);
});

test('GET asks for one scan by id', async () => {
  expect(await getDiagnose(SCAN)).toEqual({ kind: 'done', body: SICK_BODY });
  expect(server.diagnoseCalls[0]).toMatchObject({ method: 'GET', scanId: SCAN });
});

test('a scan id that is not a UUID is never sent', async () => {
  expect(await getDiagnose('../x')).toEqual({ kind: 'not_found' });
  await confirmDiagnose('?scan_id=other');
  expect(server.diagnoseCalls).toEqual([]);
});

test('confirm sends DELETE and never throws, even offline', async () => {
  await confirmDiagnose(SCAN);
  expect(server.diagnoseCalls.at(-1)).toMatchObject({ method: 'DELETE', scanId: SCAN });
  server.answers = ['offline'];
  globalThis.fetch = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
  await expect(confirmDiagnose(SCAN)).resolves.toBeUndefined();
});

test('a call that never answers ends as offline after 25 s', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  server.answers = ['hang'];
  const pending = getDiagnose(SCAN);
  await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS + 100);
  expect(await pending).toEqual({ kind: 'offline' });
});
