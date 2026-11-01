import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { earlySubmitGuard, takePending } from './early-submit';

// Before React hydrates, a submit would be a native POST to the page (a 404/405 on a static host): the guard
// queues it instead, and WaitlistForm sends it once it mounts.
const form = (source: string, email: string) => {
  const f = document.createElement('form');
  f.dataset.source = source;
  f.method = 'post';
  f.innerHTML = `<input name="email" value="${email}"><button type="submit">Join</button>`;
  document.body.append(f);
  return f;
};
const submit = (f: HTMLFormElement) => {
  const e = new Event('submit', { bubbles: true, cancelable: true });
  f.dispatchEvent(e);
  return e;
};

let removeGuard: () => void;
beforeEach(() => {
  delete window.__rbPending;
  delete window.__rbHydrated;
  removeGuard = earlySubmitGuard(window);
});
afterEach(() => {
  removeGuard();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.rbQueued;
  delete document.documentElement.dataset.rbSlow;
  vi.useRealTimers();
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

  // Feedback goes on <html>, outside React's tree, so it can't cause a hydration mismatch.
  it('marks the page so the queued form shows that it is joining', () => {
    submit(form('final', 'bo@x.co'));
    expect(document.documentElement.dataset.rbQueued).toBe(' final');
  });

  it('switches to a still-loading hint when React has not arrived after 15 s', () => {
    vi.useFakeTimers();
    submit(form('hero', 'ann@gmail.com'));
    vi.advanceTimersByTime(14_999);
    expect(document.documentElement.dataset.rbSlow).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(document.documentElement.dataset.rbSlow).toBe('');
  });

  // CSS ::after text is never announced, so the same words go into a live region that is in the static HTML
  // (index.html, outside #root): VoiceOver only announces changes to a region that already existed.
  it('tells screen readers it is joining, then that it is still loading, and goes quiet once sent', () => {
    vi.useFakeTimers();
    const live = document.createElement('div');
    live.id = 'rb-early-status';
    document.body.append(live);
    submit(form('hero', 'ann@gmail.com'));
    expect(live.textContent).toBe('Joining…');
    vi.advanceTimersByTime(15_000);
    expect(live.textContent).toBe('Still loading. Check your connection, then reload the page.');
    takePending('hero');
    expect(live.textContent).toBe('');
  });

  it('ignores forms that are not waitlist forms', () => {
    const f = document.createElement('form');
    document.body.append(f);
    expect(submit(f).defaultPrevented).toBe(false);
  });
});
