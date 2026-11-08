import { photoFrame } from '../photoFrame';

const PHONES = [
  { width: 375, height: 667 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test.each(PHONES)('covers a $width×$height screen and keeps the photo ratio', (screen) => {
  const frame = photoFrame(screen, 0);
  expect(frame.width).toBeGreaterThanOrEqual(screen.width);
  expect(frame.height).toBeGreaterThanOrEqual(screen.height);
  expect(frame.width / frame.height).toBeCloseTo(832 / 1792);
  // Centered with no focus: overflow is shared equally.
  expect(frame.left).toBeCloseTo((screen.width - frame.width) / 2);
  expect(frame.top).toBeCloseTo((screen.height - frame.height) / 2);
});

test('focus moves the photo up by that share of its own height', () => {
  const screen = { width: 390, height: 844 };
  const centered = photoFrame(screen, 0);
  const moved = photoFrame(screen, 0.2);
  expect(moved.top).toBeCloseTo(centered.top - 0.2 * centered.height);
  expect(moved.left).toBe(centered.left);
});
