import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startReveal } from './reveal';

class FakeIO {
  static last: FakeIO;
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: IntersectionObserverCallback) { FakeIO.last = this; }
  observe(el: Element) { this.observed.push(el); }
  unobserve(el: Element) { this.observed = this.observed.filter(o => o !== el); }
  disconnect() { this.disconnected = true; this.observed = []; }
  fire(...targets: Element[]) {
    this.cb(targets.map(target => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry), this as unknown as IntersectionObserver);
  }
}

// An item whose top sits at `top`, on a 768px tall viewport (jsdom's default).
const item = (top: number) => {
  const el = document.createElement('li');
  el.setAttribute('data-reveal', '');
  el.getBoundingClientRect = () => ({ top }) as DOMRect;
  document.body.append(el);
  return el;
};

beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeIO));
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('startReveal', () => {
  it('hides only items fully below the viewport', () => {
    const passed = item(-400), inView = item(100), straddling = item(767), below = item(768);
    startReveal();
    expect(passed.dataset.revealState).toBeUndefined();
    expect(inView.dataset.revealState).toBeUndefined();
    expect(straddling.dataset.revealState).toBeUndefined();
    expect(below.dataset.revealState).toBe('hidden');
    expect(FakeIO.last.observed).toEqual([below]);
  });

  it('hides nothing without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const below = item(2000);
    const stop = startReveal();
    expect(below.dataset.revealState).toBeUndefined();
    expect(stop).not.toThrow();
  });

  it('shows an item once, then stops watching it', () => {
    const below = item(2000);
    startReveal();
    FakeIO.last.fire(below);
    expect(below.dataset.revealState).toBe('shown');
    expect(FakeIO.last.observed).toEqual([]);
  });

  it('leaves items that have not entered the view hidden', () => {
    const a = item(2000), b = item(3000);
    startReveal();
    FakeIO.last.cb([{ target: b, isIntersecting: false } as unknown as IntersectionObserverEntry], FakeIO.last as unknown as IntersectionObserver);
    FakeIO.last.fire(a);
    expect(a.dataset.revealState).toBe('shown');
    expect(b.dataset.revealState).toBe('hidden');
  });

  it('staggers within one batch and starts over for the next', () => {
    const a = item(2000), b = item(2000), c = item(2000), d = item(3000);
    startReveal();
    FakeIO.last.fire(a, b, c);
    expect([a, b, c].map(el => el.style.transitionDelay)).toEqual(['0ms', '60ms', '120ms']);
    FakeIO.last.fire(d);
    expect(d.style.transitionDelay).toBe('0ms');
  });

  it('stops observing when cleaned up', () => {
    item(2000);
    const stop = startReveal();
    const io = FakeIO.last;
    stop();
    expect(io.disconnected).toBe(true);
  });
});
