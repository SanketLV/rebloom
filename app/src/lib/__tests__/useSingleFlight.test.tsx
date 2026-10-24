import { act, renderHook } from '@testing-library/react-native';

import { useSingleFlight } from '../useSingleFlight';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('two rapid calls run the action once', async () => {
  const gate = deferred();
  const action = jest.fn(() => gate.promise);
  const { result } = await renderHook(() => useSingleFlight(action));

  let first!: Promise<unknown>;
  await act(async () => {
    first = result.current.run();
    void result.current.run();
  });
  expect(action).toHaveBeenCalledTimes(1);

  await act(async () => {
    gate.resolve();
    await first;
  });
});

test('busy is true while running and false after', async () => {
  const gate = deferred<string>();
  const { result } = await renderHook(() => useSingleFlight(() => gate.promise));
  expect(result.current.busy).toBe(false);

  let pending!: Promise<string | undefined>;
  await act(async () => {
    pending = result.current.run();
  });
  expect(result.current.busy).toBe(true);

  await act(async () => {
    gate.resolve('done');
  });
  await expect(pending).resolves.toBe('done');
  expect(result.current.busy).toBe(false);
});

test('a throwing action rethrows and frees the button again', async () => {
  const action = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce('ok');
  const { result } = await renderHook(() => useSingleFlight(action));

  await act(async () => {
    await expect(result.current.run()).rejects.toThrow('disk full');
  });
  expect(result.current.busy).toBe(false);

  await act(async () => {
    await expect(result.current.run()).resolves.toBe('ok');
  });
  expect(action).toHaveBeenCalledTimes(2);
});

test('passes arguments through', async () => {
  const action = jest.fn(async (a: number, b: string) => `${a}${b}`);
  const { result } = await renderHook(() => useSingleFlight(action));
  await act(async () => {
    await expect(result.current.run(1, 'x')).resolves.toBe('1x');
  });
});
