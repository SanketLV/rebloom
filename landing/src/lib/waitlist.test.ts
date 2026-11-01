import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { WAITLIST, joinWaitlist, normalizeEmail } from './waitlist';

// Built with fromCodePoint so the source file stays plain ASCII and readable.
const ZWSP = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('normalizeEmail', () => {
  it('strips invisible format characters, then trims', () => {
    expect(normalizeEmail(` ${ZWSP}a@b.co${BOM} `)).toBe('a@b.co');
  });
  it('turns invisible-only input into an empty string', () => {
    expect(normalizeEmail(`${ZWSP}${BOM}  `)).toBe('');
  });
});

describe('joinWaitlist', () => {
  const stubFetch = (impl: (...args: unknown[]) => Promise<unknown>) => {
    const f = vi.fn(impl);
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('posts p_email and p_source to the RPC with the publishable key', async () => {
    const f = stubFetch(async () => ({ status: 204 }));
    await joinWaitlist('a@b.co', 'final');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WAITLIST.url);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).apikey).toBe(WAITLIST.key);
    expect(JSON.parse(init.body as string)).toEqual({ p_email: 'a@b.co', p_source: 'final' });
  });

  it.each([
    [204, 'joined'],
    [400, 'invalid'],
    [500, 'unreachable'],
    [404, 'unreachable'],
  ])('maps status %i to %s', async (status, result) => {
    stubFetch(async () => ({ status }));
    expect(await joinWaitlist('a@b.co', 'hero')).toBe(result);
  });

  it('maps a network error to unreachable', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    expect(await joinWaitlist('a@b.co', 'hero')).toBe('unreachable');
  });

  it('times out after 25s even where AbortSignal.timeout does not exist', async () => {
    vi.useFakeTimers();
    // iOS 15 and older (incl. in-app browsers there) lack AbortSignal.timeout.
    const s = AbortSignal as unknown as { timeout?: unknown };
    const original = s.timeout;
    delete s.timeout;
    onTestFinished(() => { s.timeout = original; });
    stubFetch((_url, init) => new Promise((_, reject) => {
      (init as RequestInit).signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const p = joinWaitlist('a@b.co', 'hero');
    await vi.advanceTimersByTimeAsync(24_999);
    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('timeout');
  });
});
