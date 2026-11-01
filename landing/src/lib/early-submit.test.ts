import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { earlySubmitGuard } from './early-submit';

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

beforeEach(() => {
  delete window.__rbPending;
  delete window.__rbHydrated;
  earlySubmitGuard(window);
});
afterEach(() => { document.body.innerHTML = ''; });

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

  it('ignores forms that are not waitlist forms', () => {
    const f = document.createElement('form');
    document.body.append(f);
    expect(submit(f).defaultPrevented).toBe(false);
  });
});
