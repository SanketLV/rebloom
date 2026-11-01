import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RootBoundary } from '../components/RootBoundary';
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

  it('falls back to the pre-rendered page instead of a blank one when a component throws', async () => {
    const html = container.innerHTML;
    const Boom = () => { throw new Error('in-app browser without some API'); };
    await hydrate(<RootBoundary fallbackHtml={html}><LandingPage /><Boom /></RootBoundary>);
    expect(container.querySelector('h1')?.textContent).toBe('Bring your plant back to life.');
    expect(container.querySelectorAll('form')).toHaveLength(2);
    // The fallback forms have no React handlers, so the guard must let their native POST through.
    expect(window.__rbHydrated).toBe(true);
  });
});
