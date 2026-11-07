import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { RESEND_SECONDS, useResendTimer } from '../useResendTimer';

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  // RN's AccessibilityInfo keeps one spy across tests, with its calls: start each test clean.
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
});

afterEach(async () => {
  // Unmount while the fake clock is still in place, so no hook outlives its test.
  await cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const tick = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

test('waits 60 seconds after opening, counting down', async () => {
  const { result } = await renderHook(() => useResendTimer());
  expect(RESEND_SECONDS).toBe(60);
  expect(result.current).toMatchObject({ ready: false, secondsLeft: 60 });

  await tick(1_000);
  expect(result.current.secondsLeft).toBe(59);
  await tick(58_000);
  expect(result.current).toMatchObject({ ready: false, secondsLeft: 1 });
  await tick(1_000);
  expect(result.current).toMatchObject({ ready: true, secondsLeft: 0 });
});

test('tells screen readers once at the start and once when ready, not every second', async () => {
  await renderHook(() => useResendTimer());
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith('You can send a new code in 60 seconds.');
  await tick(30_000);
  expect(announce).toHaveBeenCalledTimes(1);
  await tick(30_000);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenLastCalledWith('You can send a new code now.');
});

test('restart starts a new 60 seconds', async () => {
  const { result } = await renderHook(() => useResendTimer());
  await tick(60_000);
  expect(result.current.ready).toBe(true);
  await act(async () => result.current.restart());
  expect(result.current).toMatchObject({ ready: false, secondsLeft: 60 });
  await tick(60_000);
  expect(result.current.ready).toBe(true);
});

test('time in the background counts (the deadline is a clock time)', async () => {
  const { result } = await renderHook(() => useResendTimer());
  // The interval doesn't run while the app sleeps; the clock still moves.
  await act(async () => {
    jest.setSystemTime(Date.now() + 45_000);
    jest.advanceTimersByTime(1_000);
  });
  expect(result.current.secondsLeft).toBe(14);
});

test('stops its timer when the screen closes', async () => {
  const { unmount } = await renderHook(() => useResendTimer());
  const clear = jest.spyOn(globalThis, 'clearInterval');
  await act(async () => unmount());
  expect(clear).toHaveBeenCalled();
  announce.mockClear();
  await tick(120_000);
  expect(announce).not.toHaveBeenCalled();
});
