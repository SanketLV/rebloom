import { describe, expect, it } from 'vitest';
import { RECOVERY_WIDTHS, srcSetFor } from './photos';

describe('srcSetFor', () => {
  it('lists the smaller versions and the original', () => {
    expect(srcSetFor('/assets/promise.webp')).toBe('/assets/promise-480.webp 480w, /assets/promise-720.webp 720w, /assets/promise.webp 896w');
  });

  it('uses the widths it is given', () => {
    expect(srcSetFor('/assets/day1.webp', RECOVERY_WIDTHS)).toBe('/assets/day1-480.webp 480w, /assets/day1-600.webp 600w, /assets/day1.webp 880w');
  });
});
