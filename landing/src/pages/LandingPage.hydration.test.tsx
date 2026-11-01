import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RootBoundary } from '../components/RootBoundary';
import { earlySubmitGuard } from '../lib/early-submit';
import { LandingPage } from './LandingPage';

// Server HTML → hydrateRoot, as in production. Any mismatch shows up as a console error or recoverable error.
let observers: IntersectionObserverCallback[] = [];
let root: Root | undefined;
let container: HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observers = [];
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: IntersectionObserverCallback) { observers.push(cb); } observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
  container = document.createElement('div');
  container.innerHTML = renderToString(<LandingPage />);
  document.body.append(container);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.__rbPending;
  delete window.__rbHydrated;
});

const hydrate = async (ui = <LandingPage />) => {
  const errors: unknown[] = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
  await act(async () => { root = hydrateRoot(container, ui, { onRecoverableError: e => errors.push(e) }); });
  return errors;
};
const visible = () => [...container.querySelectorAll<HTMLElement>('article[data-s]')].filter(a => !a.hidden).map(a => a.dataset.s);
const slider = () => container.querySelector<HTMLInputElement>('input[type=range]')!;

describe('LandingPage hydration', () => {
  it('hydrates the pre-rendered HTML without a single mismatch', async () => {
    expect(await hydrate()).toEqual([]);
    expect(visible()).toEqual(['tips']);
    expect(slider().getAttribute('aria-valuetext')).toBe('Day 1 of 7, drooping');
  });

  it('keeps a symptom picked before React loaded', async () => {
    container.querySelector<HTMLInputElement>('#s-mites')!.checked = true;
    expect(await hydrate()).toEqual([]);
    expect(visible()).toEqual(['mites']);
    expect(container.querySelector<HTMLInputElement>('#s-mites')!.checked).toBe(true);
  });

  it('keeps a slider drag made before React loaded, and skips the autoplay', async () => {
    slider().value = '3';
    expect(await hydrate()).toEqual([]);
    act(() => observers.forEach(cb => cb([{ isIntersecting: true } as IntersectionObserverEntry], { disconnect() {} } as IntersectionObserver)));
    expect(slider().getAttribute('aria-valuetext')).toBe('Day 3 of 7');
  });

  it('sends a sign-up the visitor submitted before React loaded', async () => {
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    window.__rbPending = [{ source: 'final', email: 'ann@gmail.com' }];
    await hydrate();
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ p_email: 'ann@gmail.com', p_source: 'final' });
    expect(window.__rbPending).toEqual([]);
    expect(window.__rbHydrated).toBe(true);
  });

  it('does not jump to the field when a queued address turns out invalid', async () => {
    vi.stubGlobal('fetch', vi.fn());
    window.__rbPending = [{ source: 'final', email: 'not-an-email' }];
    await hydrate();
    expect(container.querySelector('#status-final')).toHaveTextContent('Enter an email like name@example.com.');
    expect(document.activeElement).not.toBe(container.querySelector('#email-final'));
  });
});

// The inline guard and the real pre-rendered form together: if data-source or name="email" drifts, these fail.
describe('early submit before hydration (guard + real form)', () => {
  let removeGuard: () => void;
  beforeEach(() => { removeGuard = earlySubmitGuard(window); });
  afterEach(() => { removeGuard(); delete document.documentElement.dataset.rbQueued; });

  const typeAndSubmit = (email: string) => {
    container.querySelector<HTMLInputElement>('#email-final')!.value = email;
    const e = new Event('submit', { bubbles: true, cancelable: true });
    container.querySelector('form[data-source="final"]')!.dispatchEvent(e);
    return e;
  };
  const sentEmails = (f: ReturnType<typeof vi.fn>) =>
    f.mock.calls.map(c => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).p_email);

  it('queues the submit, shows it is joining, and sends it exactly once after hydration', async () => {
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    expect(typeAndSubmit('ann@gmail.com').defaultPrevented).toBe(true);
    expect(document.documentElement.dataset.rbQueued).toContain('final');
    expect(await hydrate()).toEqual([]);
    expect(sentEmails(f)).toEqual(['ann@gmail.com']);
    expect(document.documentElement.dataset.rbQueued ?? '').not.toContain('final');
    expect(container.querySelector('#status-final')).toHaveTextContent("You're on the list.");
  });

  it('sends exactly once when the submit lands between hydrateRoot and the commit', async () => {
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(container, <LandingPage />);
      typeAndSubmit('ann@gmail.com');
    });
    expect(sentEmails(f)).toEqual(['ann@gmail.com']);
  });
});

describe('error boundary fallback', () => {
  const Boom = () => { throw new Error('in-app browser without some API'); };
  const crash = async () => {
    const html = container.innerHTML;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { root = hydrateRoot(container, <RootBoundary fallbackHtml={html}><LandingPage /><Boom /></RootBoundary>); });
  };

  it('shows the pre-rendered page instead of a blank one', async () => {
    await crash();
    expect(container.querySelector('h1')?.textContent).toBe('Bring your plant back to life.');
    expect(container.querySelectorAll('form')).toHaveLength(2);
  });

  it('still sends a sign-up that was queued before the crash', async () => {
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    window.__rbPending = [{ source: 'hero', email: 'ann@gmail.com' }];
    await crash();
    await act(async () => {});
    expect(f).toHaveBeenCalledTimes(1);
    expect(window.__rbPending).toEqual([]);
    expect(container.querySelector('#status-hero')).toHaveTextContent("You're on the list.");
  });

  it('keeps its forms working instead of posting to a page that cannot take it', async () => {
    const f = vi.fn(async () => ({ status: 204 }));
    vi.stubGlobal('fetch', f);
    await crash();
    container.querySelector<HTMLInputElement>('#email-final')!.value = ' ann@gmail.com ';
    const e = new Event('submit', { bubbles: true, cancelable: true });
    await act(async () => { container.querySelector('form[data-source="final"]')!.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ p_email: 'ann@gmail.com', p_source: 'final' });
    expect(container.querySelector('#status-final')).toHaveTextContent("You're on the list.");
  });
});
