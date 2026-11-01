import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryPanel } from './RecoveryPanel';

let observers: { cb: IntersectionObserverCallback; disconnect: () => void }[] = [];
class FakeIO {
  disconnect = vi.fn();
  constructor(public cb: IntersectionObserverCallback, public opts?: IntersectionObserverInit) { observers.push(this); }
  observe() {}
}
const intersect = (intersectionRatio = 0.6) => act(() => {
  for (const o of observers) o.cb([{ isIntersecting: true, intersectionRatio } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
});
const reducedMotion = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q }));

const slider = () => screen.getByRole('slider', { name: 'Day of recovery' }) as HTMLInputElement;
const dayText = () => slider().getAttribute('aria-valuetext');

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
  reducedMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RecoveryPanel', () => {
  it('shows the recovered plant and never autoplays with reduced motion', () => {
    reducedMotion(true);
    render(<RecoveryPanel />);
    expect(dayText()).toBe('Day 7 of 7, recovered');
    expect(observers).toHaveLength(0);
  });

  it('shows day 7 where IntersectionObserver is missing (iOS < 12.2)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<RecoveryPanel />);
    expect(dayText()).toBe('Day 7 of 7, recovered');
  });

  it('waits on day 1, then plays the week once when 60% visible', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<RecoveryPanel />);
    expect(dayText()).toBe('Day 1 of 7, drooping');
    expect((observers[0] as unknown as FakeIO).opts).toEqual({ threshold: 0.6 });
    intersect();
    expect(observers[0].disconnect).toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    const mid = parseFloat(slider().value);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(7);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(dayText()).toBe('Day 7 of 7, recovered');
    expect(screen.getByTestId('day7')).toHaveStyle({ opacity: '1' });
  });

  // The observer also fires when isIntersecting flips, i.e. at the first visible sliver, not only at 60%.
  it('waits for 60% visibility, not the first visible sliver', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<RecoveryPanel />);
    intersect(0.02);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(dayText()).toBe('Day 1 of 7, drooping');
    expect(observers[0].disconnect).not.toHaveBeenCalled();
    intersect(0.6);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(dayText()).toBe('Day 7 of 7, recovered');
  });

  it('never autoplays after a drag that came before the panel was visible', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<RecoveryPanel />);
    fireEvent.input(slider(), { target: { value: '3' } });
    intersect();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(dayText()).toBe('Day 3 of 7');
  });

  it('stops autoplay when the visitor drags mid-way', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<RecoveryPanel />);
    intersect();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    fireEvent.input(slider(), { target: { value: '2' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(dayText()).toBe('Day 2 of 7');
  });

  it('crossfades the day-7 photo with the slider', () => {
    reducedMotion(true);
    render(<RecoveryPanel />);
    fireEvent.input(slider(), { target: { value: '4' } });
    expect(screen.getByTestId('day7')).toHaveStyle({ opacity: '0.5' });
    expect(screen.getByText('4', { selector: 'span' })).toBeInTheDocument();
  });
});
