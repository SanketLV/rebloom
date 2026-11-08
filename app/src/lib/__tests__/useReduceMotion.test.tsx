import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReduceMotion } from '../useReduceMotion';

const enabled = () => jest.mocked(AccessibilityInfo.isReduceMotionEnabled);

test('starts off and picks up the setting', async () => {
  enabled().mockResolvedValueOnce(true);
  const { result } = await renderHook(() => useReduceMotion());
  await act(async () => {});
  expect(result.current).toBe(true);
});

test('follows a change made while the app is open, and stops when unmounted', async () => {
  const remove = jest.fn();
  let changed!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementationOnce(((
    _event: string,
    handler: (value: boolean) => void,
  ) => {
    changed = handler;
    return { remove };
  }) as never);
  const { result, unmount } = await renderHook(() => useReduceMotion());
  await act(async () => changed(true));
  expect(result.current).toBe(true);

  await unmount();
  expect(remove).toHaveBeenCalled();
});

test('a setting it can not read keeps the animation', async () => {
  enabled().mockRejectedValueOnce(new Error('unavailable'));
  const { result } = await renderHook(() => useReduceMotion());
  await act(async () => {});
  expect(result.current).toBe(false);
});

test('a change that arrives before the first read wins over that read', async () => {
  let resolveRead!: (value: boolean) => void;
  enabled().mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)));
  let changed!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementationOnce(((
    _event: string,
    handler: (value: boolean) => void,
  ) => {
    changed = handler;
    return { remove: jest.fn() };
  }) as never);
  const { result } = await renderHook(() => useReduceMotion());
  await act(async () => changed(true));
  // The read started before the change, so its answer is older.
  await act(async () => resolveRead(false));
  expect(result.current).toBe(true);
});
