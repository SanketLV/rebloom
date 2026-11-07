import { act, renderHook } from '@testing-library/react-native';

import type { Result, SessionEvent, SessionUser } from '@/backend/session';

import {
  getAccountState,
  noteAccountDeleted,
  refreshAccount,
  resetAccountForTests,
  subscribeAccount,
  useAccount,
} from '../store';

let mockEmit: (event: SessionEvent) => void = () => {};
let mockOrder: string[] = [];
let mockCurrentUser: () => Promise<Result<SessionUser | null>>;

jest.mock('@/backend/session', () => ({
  onSessionChange: jest.fn((listener: (event: SessionEvent) => void) => {
    mockOrder.push('subscribe');
    mockEmit = listener;
    return () => {
      mockEmit = () => {};
    };
  }),
  getCurrentUser: jest.fn(() => {
    mockOrder.push('getCurrentUser');
    return mockCurrentUser();
  }),
}));

const session = jest.requireMock('@/backend/session') as {
  onSessionChange: jest.Mock;
  getCurrentUser: jest.Mock;
};

const sam: SessionUser = { id: 'u-1', email: 'sam@example.com', provider: 'email' };
const flush = () => act(async () => {});

beforeEach(() => {
  mockOrder = [];
  mockCurrentUser = async () => ({ ok: true, value: null });
  session.onSessionChange.mockClear();
  session.getCurrentUser.mockClear();
});

afterEach(() => resetAccountForTests());

test('does nothing until something subscribes', () => {
  expect(getAccountState()).toEqual({ status: 'loading' });
  expect(session.onSessionChange).not.toHaveBeenCalled();
  expect(session.getCurrentUser).not.toHaveBeenCalled();
});

test('listens before it reads, so an expiry found while reading is heard', async () => {
  subscribeAccount(() => {});
  await flush();
  expect(mockOrder).toEqual(['subscribe', 'getCurrentUser']);
});

test('nobody signed in → guest; signed in → signed_in with the user', async () => {
  const { result } = await renderHook(() => useAccount());
  await flush();
  expect(result.current).toEqual({ status: 'guest' });

  await act(async () => mockEmit({ type: 'signed_in', user: sam }));
  expect(result.current).toEqual({ status: 'signed_in', user: sam });
});

test('a stored session → signed_in', async () => {
  mockCurrentUser = async () => ({ ok: true, value: sam });
  const { result } = await renderHook(() => useAccount());
  await flush();
  expect(result.current).toEqual({ status: 'signed_in', user: sam });
});

test('the server ends the session → expired, until the next sign-in', async () => {
  mockCurrentUser = async () => ({ ok: true, value: sam });
  const { result } = await renderHook(() => useAccount());
  await flush();

  await act(async () => mockEmit({ type: 'signed_out', reason: 'session_expired' }));
  expect(result.current).toEqual({ status: 'expired' });

  await act(async () => mockEmit({ type: 'signed_in', user: sam }));
  expect(result.current).toEqual({ status: 'signed_in', user: sam });
});

test('an expiry heard while reading is not overwritten by the read finishing', async () => {
  let finish: (r: Result<SessionUser | null>) => void = () => {};
  mockCurrentUser = () => new Promise((resolve) => (finish = resolve));
  const { result } = await renderHook(() => useAccount());

  await act(async () => mockEmit({ type: 'signed_out', reason: 'session_expired' }));
  await act(async () => finish({ ok: true, value: null }));

  expect(result.current).toEqual({ status: 'expired' });
});

test('the user signs out → guest', async () => {
  mockCurrentUser = async () => ({ ok: true, value: sam });
  const { result } = await renderHook(() => useAccount());
  await flush();
  await act(async () => mockEmit({ type: 'signed_out', reason: 'user' }));
  expect(result.current).toEqual({ status: 'guest' });
});

test('after a delete → guest with the deleted notice, cleared by the next sign-in', async () => {
  mockCurrentUser = async () => ({ ok: true, value: sam });
  const { result } = await renderHook(() => useAccount());
  await flush();
  await act(async () => {
    noteAccountDeleted();
    mockEmit({ type: 'signed_out', reason: 'user' });
  });
  expect(result.current).toEqual({ status: 'guest', notice: 'deleted' });

  await act(async () => mockEmit({ type: 'signed_in', user: sam }));
  expect(result.current).toEqual({ status: 'signed_in', user: sam });
});

test.each([
  ['not_configured', { status: 'unconfigured' }],
  ['session_expired', { status: 'expired' }],
  ['offline', { status: 'offline' }],
  ['unknown', { status: 'offline' }],
] as const)('reading fails with %s → %j', async (error, state) => {
  mockCurrentUser = async () => ({ ok: false, error });
  const { result } = await renderHook(() => useAccount());
  await flush();
  expect(result.current).toEqual(state);
});

test('refreshAccount reads again (Try again after offline)', async () => {
  mockCurrentUser = async () => ({ ok: false, error: 'offline' });
  const { result } = await renderHook(() => useAccount());
  await flush();
  mockCurrentUser = async () => ({ ok: true, value: sam });
  await act(() => refreshAccount());
  expect(result.current).toEqual({ status: 'signed_in', user: sam });
});

test('a delete noted after its sign-out still shows the notice', async () => {
  mockCurrentUser = async () => ({ ok: true, value: sam });
  const { result } = await renderHook(() => useAccount());
  await flush();
  await act(async () => {
    mockEmit({ type: 'signed_out', reason: 'user' });
    noteAccountDeleted();
  });
  expect(result.current).toEqual({ status: 'guest', notice: 'deleted' });
});

test('a second screen subscribing does not start a second listener', async () => {
  await renderHook(() => useAccount());
  await renderHook(() => useAccount());
  await flush();
  expect(session.onSessionChange).toHaveBeenCalledTimes(1);
});
