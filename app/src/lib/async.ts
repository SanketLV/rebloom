export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Rejects with a TimeoutError if `promise` hasn't settled within `ms`.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Resolves no sooner than `ms` from now, so a progress screen can be read.
// Rejections come through straight away.
export async function withMinDuration<T>(promise: Promise<T>, ms: number): Promise<T> {
  const [value] = await Promise.all([promise, sleep(ms)]);
  return value;
}
