import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { earlySubmitGuard, takePending } from './early-submit';
import { MESSAGES, WAITLIST } from './waitlist';
import css from '../index.css?raw';

// Before React hydrates, a submit would be a native POST to the page (a 404/405 on a static host): the guard
// queues it instead, and WaitlistForm sends it once it mounts. If React never arrives, the guard sends it itself.
const CFG = { url: WAITLIST.url, key: WAITLIST.key, timeoutMs: WAITLIST.timeoutMs, messages: MESSAGES };
const html = document.documentElement;

const form = (source: string, email: string, trap = '') => {
  const f = document.createElement('form');
  f.dataset.source = source;
  f.method = 'post';
  f.innerHTML = `<input name="email" value="${email}"><input name="rb_hp" value="${trap}"><button type="submit">Join</button>`;
  document.body.append(f);
  return f;
};
const submit = (f: HTMLFormElement) => {
  const e = new Event('submit', { bubbles: true, cancelable: true });
  f.dispatchEvent(e);
  return e;
};
const sent = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.map(c => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));

let removeGuard: () => void;
let live: HTMLElement;
beforeEach(() => {
  delete window.__rbPending;
  delete window.__rbHydrated;
  live = Object.assign(document.createElement('div'), { id: 'rb-early-status' });
  document.body.append(live);
  removeGuard = earlySubmitGuard(window, CFG);
});
afterEach(() => {
  removeGuard();
  document.body.innerHTML = '';
  delete html.dataset.rbQueued;
  delete html.dataset.rbDone;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('earlySubmitGuard', () => {
  it('blocks the native POST and queues the submit before hydration', () => {
    const e = submit(form('hero', 'ann@gmail.com'));
    expect(e.defaultPrevented).toBe(true);
    expect(window.__rbPending).toEqual([{ source: 'hero', email: 'ann@gmail.com' }]);
  });

  it('keeps one entry per form, with the latest address', () => {
    const f = form('hero', 'ann@gmial.com');
    submit(f);
    (f.elements.namedItem('email') as HTMLInputElement).value = 'ann@gmail.com';
    submit(f);
    submit(form('final', 'bo@x.co'));
    expect(window.__rbPending).toEqual([{ source: 'hero', email: 'ann@gmail.com' }, { source: 'final', email: 'bo@x.co' }]);
  });

  it('stands down once React has hydrated', () => {
    window.__rbHydrated = true;
    const e = submit(form('hero', 'ann@gmail.com'));
    expect(e.defaultPrevented).toBe(false);
    expect(window.__rbPending).toEqual([]);
  });

  // Feedback goes on <html> (outside React's tree, so no hydration mismatch) and into a live region that is in
  // the static HTML outside #root, because VoiceOver only announces changes to a region that already existed.
  it('shows and announces that the queued form is joining', () => {
    submit(form('final', 'bo@x.co'));
    expect(html.dataset.rbQueued).toBe(' final');
    expect(live.textContent).toBe(MESSAGES.sending);
    takePending('final');
    expect(live.textContent).toBe('');
  });

  it('neither queues nor announces an empty address', () => {
    const e = submit(form('hero', `  ${String.fromCodePoint(0x200b)} `));
    expect(e.defaultPrevented).toBe(true);
    expect(window.__rbPending).toEqual([]);
    expect(html.dataset.rbQueued).toBeUndefined();
    expect(live.textContent).toBe('');
  });

  it('never queues a submit with the bot trap filled', () => {
    submit(form('hero', 'ann@gmail.com', 'http://spam.example'));
    expect(window.__rbPending).toEqual([]);
  });

  it('ignores forms that are not waitlist forms', () => {
    const f = document.createElement('form');
    document.body.append(f);
    expect(submit(f).defaultPrevented).toBe(false);
  });
});

// The JS bundle may never run (blocked, failed download, a browser that can't parse it). Reloading would lose
// the queue, so after 15 s without React the guard sends the request itself.
describe('earlySubmitGuard without React', () => {
  it('sends queued sign-ups itself after 15 s, and reports the result', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    submit(form('hero', ' ann@gmail.com '));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(f).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sent(f)).toEqual([{ p_email: 'ann@gmail.com', p_source: 'hero' }]);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(WAITLIST.url);
    expect(window.__rbPending).toEqual([]);
    expect(html.dataset.rbQueued).toBeUndefined();
    expect(html.dataset.rbDone).toBe(' hero:joined');
    expect(live.textContent).toBe(MESSAGES.joined);
  });

  it('sends later taps straight away, and replaces the earlier result', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => ({ status: 400 }));
    vi.stubGlobal('fetch', f);
    const hero = form('hero', 'not-an-email');
    submit(hero);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(html.dataset.rbDone).toBe(' hero:invalid');
    f.mockImplementation(async () => ({ status: 204 }));
    (hero.elements.namedItem('email') as HTMLInputElement).value = 'ann@gmail.com';
    submit(hero);
    expect(html.dataset.rbDone).toBeUndefined();  // back to "Joining…" while it sends
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(html.dataset.rbDone).toBe(' hero:joined');
  });

  it('reports a network failure as unreachable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    submit(form('final', 'bo@x.co'));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(html.dataset.rbDone).toBe(' final:unreachable');
    expect(live.textContent).toBe(MESSAGES.unreachable);
  });

  it('leaves the sending to React when it arrives in time', async () => {
    vi.useFakeTimers();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    submit(form('hero', 'ann@gmail.com'));
    window.__rbHydrated = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f).not.toHaveBeenCalled();
  });
});

// The CSS can't import MESSAGES, so the copy there must not drift from it.
it('shows the same wording in CSS as the form does', () => {
  for (const m of [MESSAGES.sending, MESSAGES.joined, MESSAGES.invalid, MESSAGES.unreachable, MESSAGES.timeout])
    expect(css).toContain(`"${m}"`);
});
