import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYMPTOMS } from '../content/symptoms';
import { FieldNotes } from './FieldNotes';

const loadingOf = (container: HTMLElement) =>
  [...container.querySelectorAll('img[data-s]')].slice(1).map(img => img.getAttribute('loading'));

describe('FieldNotes photo preload', () => {
  let observers: { cb: IntersectionObserverCallback; opts?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }[] = [];
  const stubObserver = () => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', class {
      disconnect = vi.fn();
      constructor(public cb: IntersectionObserverCallback, public opts?: IntersectionObserverInit) { observers.push(this); }
      observe = vi.fn();
    });
  };
  const near = () => act(() => observers[0].cb([{ isIntersecting: true } as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver));

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { connection?: unknown }).connection;
  });

  it('keeps hidden photos lazy until the section is near, then loads them', () => {
    stubObserver();
    const { container } = render(<FieldNotes />);
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
    expect(observers[0].opts?.rootMargin).toBe('100px 0px');
    // The plate, not the section: the section starts at the fold, so it would count as near on page load.
    expect(observers[0].observe).toHaveBeenCalledWith(container.querySelector('figure'));
    near();
    expect(loadingOf(container)).toEqual(['eager', 'eager', 'eager']);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('reads every entry in a batch, not just the first', () => {
    stubObserver();
    const { container } = render(<FieldNotes />);
    act(() => observers[0].cb([{ isIntersecting: false }, { isIntersecting: true }] as IntersectionObserverEntry[], observers[0] as unknown as IntersectionObserver));
    expect(loadingOf(container)).toEqual(['eager', 'eager', 'eager']);
  });

  it('stays lazy when the section has not come near', () => {
    stubObserver();
    const { container } = render(<FieldNotes />);
    act(() => observers[0].cb([{ isIntersecting: false } as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver));
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
  });

  it('does not preload with Save-Data on; tapping a chip still shows the photo', async () => {
    stubObserver();
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    const { container } = render(<FieldNotes />);
    expect(observers).toHaveLength(0);
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
    await userEvent.click(screen.getByRole('radio', { name: 'White powdery patches' }));
    expect(screen.getByRole('img', { name: 'A green leaf dusted with white powdery patches' })).toBeVisible();
  });

  it.each(['2g', 'slow-2g'])('does not preload on %s; tapping a chip still shows the photo', async effectiveType => {
    stubObserver();
    Object.defineProperty(navigator, 'connection', { value: { effectiveType }, configurable: true });
    const { container } = render(<FieldNotes />);
    expect(observers).toHaveLength(0);
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
    await userEvent.click(screen.getByRole('radio', { name: 'White powdery patches' }));
    expect(screen.getByRole('img', { name: 'A green leaf dusted with white powdery patches' })).toBeVisible();
  });

  it.each([{ saveData: true }, { effectiveType: '2g' }])('re-checks the connection when the plate comes near: %o', change => {
    stubObserver();
    const connection: { saveData?: boolean; effectiveType?: string } = { saveData: false, effectiveType: '4g' };
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
    const { container } = render(<FieldNotes />);
    Object.assign(connection, change);
    near();
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it.each(['3g', '4g'])('still preloads on %s', effectiveType => {
    stubObserver();
    Object.defineProperty(navigator, 'connection', { value: { effectiveType }, configurable: true });
    render(<FieldNotes />);
    expect(observers).toHaveLength(1);
  });

  it('stays lazy without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<FieldNotes />);
    expect(loadingOf(container)).toEqual(['lazy', 'lazy', 'lazy']);
  });

  it('stops observing when unmounted', () => {
    stubObserver();
    const { unmount } = render(<FieldNotes />);
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('offers the small and full-size photo for every symptom', () => {
    const { container } = render(<FieldNotes />);
    for (const img of container.querySelectorAll('img[data-s]')) {
      expect(img.getAttribute('srcset')).toMatch(/-480\.webp 480w, .+-720\.webp 720w, .+\.webp 896w$/);
      expect(img.getAttribute('sizes')).toBeTruthy();
    }
  });
});

describe('FieldNotes chip fade', () => {
  it('fades only after a chip changes, never on first render', async () => {
    const { container } = render(<FieldNotes />);
    const swapRoot = () => container.querySelector('[data-swap]');
    expect(swapRoot()).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'White powdery patches' }));
    expect(swapRoot()).not.toBeNull();
  });

  it('ends on the last chip after rapid taps', async () => {
    const { container } = render(<FieldNotes />);
    for (const s of [...SYMPTOMS, SYMPTOMS[1]]) await userEvent.click(screen.getByRole('radio', { name: s.label }));
    expect(new Set([...container.querySelectorAll<HTMLElement>('[data-s]')].filter(el => !el.hidden).map(el => el.dataset.s))).toEqual(new Set([SYMPTOMS[1].id]));
  });
});

// Everything stays in the HTML; only the active symptom's photo, caption and entry are visible.
const visible = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-s]')].filter(el => !el.hidden).map(el => el.dataset.s);

describe('FieldNotes', () => {
  it('renders all four symptoms and shows only brown tips first', () => {
    const { container } = render(<FieldNotes />);
    expect(container.querySelectorAll('article')).toHaveLength(4);
    expect(new Set(visible(container))).toEqual(new Set(['tips']));
    expect(screen.getByRole('radio', { name: 'Brown, crispy tips' })).toBeChecked();
  });

  it.each(SYMPTOMS.map(s => [s.label, s.id]))('picking "%s" shows only its photo, caption and entry', async (label, id) => {
    const { container } = render(<FieldNotes />);
    await userEvent.click(screen.getByRole('radio', { name: label }));
    const shown = visible(container);
    expect(shown).toHaveLength(3);
    expect(new Set(shown)).toEqual(new Set([id]));
  });

  it('keeps the entries in a polite live region and the plate photo described', async () => {
    const { container } = render(<FieldNotes />);
    expect(container.querySelector('article')!.parentElement).toHaveAttribute('aria-live', 'polite');
    await userEvent.click(screen.getByRole('radio', { name: 'White powdery patches' }));
    expect(screen.getByRole('img', { name: 'A green leaf dusted with white powdery patches' })).toBeVisible();
  });
});
