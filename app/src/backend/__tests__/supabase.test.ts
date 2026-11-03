import { createClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

import { fakeLocalStorage } from '@/testing/fakeLocalStorage';

import { getSupabase, resetSupabaseForTests } from '../supabase';

jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return { ...actual, createClient: jest.fn(actual.createClient) };
});

const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

const URL = 'https://abc.supabase.co';
const KEY = 'sb_publishable_test';

let appStateHandler: ((state: AppStateStatus) => void) | undefined;
let removeListener: jest.Mock;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = URL;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY;
  createClientMock.mockClear();
  removeListener = jest.fn();
  appStateHandler = undefined;
  // React Native's jest setup already mocks addEventListener, so spyOn returns that same mock
  // and restoreAllMocks doesn't reset it: clear its calls here.
  jest
    .spyOn(AppState, 'addEventListener')
    .mockClear()
    .mockImplementation((_type, handler) => {
      appStateHandler = handler as (state: AppStateStatus) => void;
      return { remove: removeListener } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
});

afterEach(() => {
  resetSupabaseForTests();
  jest.restoreAllMocks();
});

// T6 (spike): the real supabase-js client loads in jest-expo over the fake localStorage and a
// mocked fetch, and reading the session with nothing stored makes no request.
test('a real client over the fake storage reads no session and makes no request', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sqlite/localStorage/install');
  const fetchMock = jest.fn();
  const client = jest.requireActual('@supabase/supabase-js').createClient(URL, KEY, {
    auth: {
      storage: globalThis.localStorage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchMock },
  });

  const { data, error } = await client.auth.getSession();

  expect(error).toBeNull();
  expect(data.session).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(globalThis.localStorage).toBe(fakeLocalStorage);
});

describe('getSupabase', () => {
  test('importing the module makes no client', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../supabase');
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  test('makes the client once, with the session stored in localStorage and PKCE', async () => {
    const first = getSupabase()!;
    const second = getSupabase();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClientMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(key).toBe(KEY);
    expect(options?.auth).toMatchObject({
      storage: fakeLocalStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    });
    await first.auth.getSession();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('not configured → null, and no client or listener', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(getSupabase()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  test('auto refresh follows the app state, and the listener is added once', () => {
    const client = getSupabase()!;
    const start = jest.spyOn(client.auth, 'startAutoRefresh').mockResolvedValue(undefined);
    const stop = jest.spyOn(client.auth, 'stopAutoRefresh').mockResolvedValue(undefined);
    getSupabase();

    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    appStateHandler?.('active');
    expect(start).toHaveBeenCalledTimes(1);
    appStateHandler?.('background');
    appStateHandler?.('inactive');
    expect(stop).toHaveBeenCalledTimes(2);
  });

  test('starts auto refresh at once when the app is already active', () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const realCreate = createClientMock.getMockImplementation()!;
    let started = 0;
    createClientMock.mockImplementationOnce((...args) => {
      const client = realCreate(...args);
      jest.spyOn(client.auth, 'startAutoRefresh').mockImplementation(async () => {
        started += 1;
      });
      return client;
    });

    getSupabase();

    expect(started).toBe(1);
  });

  test('reset removes the AppState listener and forgets the client', () => {
    const first = getSupabase()!;
    resetSupabaseForTests();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(getSupabase()).not.toBe(first);
  });
});
