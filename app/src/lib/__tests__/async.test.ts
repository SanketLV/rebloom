import { TimeoutError, withMinDuration, withTimeout } from '../async';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const never = () => new Promise<never>(() => {});
const settled = async <T>(promise: Promise<T>) => {
  let state: { value?: T; error?: unknown; done: boolean } = { done: false };
  promise.then(
    (value) => (state = { value, done: true }),
    (error) => (state = { error, done: true }),
  );
  await Promise.resolve();
  return () => state;
};

describe('withTimeout', () => {
  test('rejects with a TimeoutError once the time is up', async () => {
    const result = withTimeout(never(), 10_000);
    jest.advanceTimersByTime(10_000);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  test('does not reject a moment early', async () => {
    const state = await settled(withTimeout(never(), 10_000));
    jest.advanceTimersByTime(9_999);
    await Promise.resolve();
    expect(state().done).toBe(false);
  });

  test('passes an early result through and clears its timer', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 10_000)).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('passes an early rejection through unchanged', async () => {
    const error = new Error('boom');
    await expect(withTimeout(Promise.reject(error), 10_000)).rejects.toBe(error);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('withMinDuration', () => {
  test('holds a fast result until the minimum time has passed', async () => {
    const state = await settled(withMinDuration(Promise.resolve('ok'), 1_200));
    await jest.advanceTimersByTimeAsync(1_199);
    expect(state().done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(state()).toEqual({ value: 'ok', done: true });
  });

  test('does not add time to a slow result', async () => {
    let resolve!: (v: string) => void;
    const slow = new Promise<string>((r) => (resolve = r));
    const result = withMinDuration(slow, 1_200);
    await jest.advanceTimersByTimeAsync(5_000);
    resolve('late');
    await expect(result).resolves.toBe('late');
  });

  test('passes a rejection straight through', async () => {
    const error = new Error('bad photo');
    await expect(withMinDuration(Promise.reject(error), 1_200)).rejects.toBe(error);
  });
});
