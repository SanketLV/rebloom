import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import * as fc from 'fast-check';
import { renderRouter } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import { photoFrame } from '@/onboarding/photoFrame';
import { SCREENS } from '@/onboarding/screens';
import { readSeen, saveSeen } from '@/onboarding/seen';
import { mockCamera, mockKvStore } from '@/testing/nativeMocks';
import { cameraColors, photoScrimOpacity } from '@/theme/tokens';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

const FLOW_TIMEOUT = 300_000;

describe('photo geometry', () => {
  test('any screen and focus: the photo covers the width and keeps its ratio', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 5000, noNaN: true }),
        fc.double({ min: 1, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (width, height, focus) => {
          const frame = photoFrame({ width, height }, focus);
          expect(frame.width).toBeGreaterThanOrEqual(width - 1e-6);
          expect(frame.height).toBeGreaterThanOrEqual(height - 1e-6);
          expect(frame.width / frame.height).toBeCloseTo(832 / 1792);
          expect(frame.left).toBeLessThanOrEqual(1e-6);
          // Focus only ever moves it up.
          expect(frame.top).toBeLessThanOrEqual((height - frame.height) / 2 + 1e-6);
          for (const value of Object.values(frame)) expect(Number.isFinite(value)).toBe(true);
        },
      ),
      { numRuns: 5000 },
    );
  });
});

describe('contrast', () => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: number[]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  test('any photo pixel: text on the scrim stays at 4.5:1 or better', () => {
    const ground = rgb(cameraColors.ground);
    const text = luminance(rgb(cameraColors.text));
    fc.assert(
      fc.property(fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255)), (pixel) => {
        const shown = pixel.map(
          (value, i) => value * (1 - photoScrimOpacity) + ground[i] * photoScrimOpacity,
        );
        const ratio = (text + 0.05) / (luminance(shown) + 0.05);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 10000 },
    );
  });
});

describe('seen flag', () => {
  test('any stored value counts as seen; any failure never throws', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.boolean(),
        fc.boolean(),
        (stored, failRead, failWrite) => {
          mockKvStore.reset();
          mockKvStore.values.clear();
          if (stored !== undefined) mockKvStore.values.set('onboarding_seen', stored);
          mockKvStore.failRead = failRead ? new Error('read') : undefined;
          mockKvStore.failWrite = failWrite ? new Error('write') : undefined;
          expect(() => saveSeen()).not.toThrow();
          const expected = failRead || stored !== undefined || !failWrite;
          expect(readSeen()).toBe(expected);
        },
      ),
      { numRuns: 5000 },
    );
  });
});

type Action =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'drag' }
  | { type: 'wait'; ms: number }
  | { type: 'scroll'; page: number }
  | { type: 'scrollRaw'; x: number }
  | { type: 'layout'; width: number; height: number };

const action: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ type: 'next' }),
  fc.constant<Action>({ type: 'back' }),
  fc.constant<Action>({ type: 'drag' }),
  fc.record({ type: fc.constant('wait' as const), ms: fc.nat(1000) }),
  // Lands on, near and past real pages.
  fc.record({ type: fc.constant('scroll' as const), page: fc.double({ min: -2, max: 8, noNaN: true }) }),
  fc.record({ type: fc.constant('scrollRaw' as const), x: fc.double({ min: -1e7, max: 1e7, noNaN: true }) }),
  fc.record({
    type: fc.constant('layout' as const),
    width: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 2000 })),
    height: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 2000 })),
  }),
);

describe('the flow under any sequence of input', () => {
  let backListeners: { handler: () => boolean | null | undefined; removed: boolean }[] = [];

  beforeEach(() => {
    backListeners = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      const entry = { handler: handler as () => boolean, removed: false };
      backListeners.push(entry);
      return { remove: () => void (entry.removed = true) };
    });
  });

  const pressBack = () => {
    for (const entry of [...backListeners].reverse()) {
      if (!entry.removed && entry.handler()) return true;
    }
    return false;
  };

  // Exactly one screen is ever reachable, and its actions match it.
  function expectOneScreen() {
    expect(screen).toHavePathname('/onboarding');
    const shown = SCREENS.flatMap((s, i) => (screen.queryByText(s.title) ? [i] : []));
    expect(shown).toHaveLength(1);
    const last = shown[0] === SCREENS.length - 1;
    expect(!!screen.queryByRole('button', { name: 'Scan a plant' })).toBe(last);
    expect(!!screen.queryByRole('button', { name: 'Look around first' })).toBe(last);
    expect(!!screen.queryByRole('button', { name: 'Next' })).toBe(!last);
    expect(!!screen.queryByRole('button', { name: 'Skip' })).toBe(!last);
  }

  test(
    'never crashes, never leaves, always shows one screen with its own actions',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(action, { minLength: 1, maxLength: 40 }), async (actions) => {
          mockKvStore.values.clear();
          mockCamera.setPermission('granted');
          backListeners = [];
          await renderRouter('./src/app', { initialUrl: '/' });
          await screen.findByRole('button', { name: 'Next' });
          let width = 750;
          const pager = () => screen.getByTestId('onboarding-pager');

          for (const step of actions) {
            switch (step.type) {
              case 'next': {
                const next = screen.queryByRole('button', { name: 'Next' });
                if (next) await fireEvent.press(next);
                break;
              }
              case 'back':
                await act(async () => {
                  pressBack();
                });
                break;
              case 'drag':
                await fireEvent(pager(), 'scrollBeginDrag');
                break;
              case 'wait':
                await act(async () => {
                  jest.advanceTimersByTime(step.ms);
                });
                break;
              case 'scroll':
                await fireEvent(pager(), 'scroll', {
                  nativeEvent: { contentOffset: { x: step.page * width, y: 0 } },
                });
                break;
              case 'scrollRaw':
                await fireEvent(pager(), 'scroll', {
                  nativeEvent: { contentOffset: { x: step.x, y: 0 } },
                });
                break;
              case 'layout':
                width = step.width;
                await fireEvent(screen.getByTestId('onboarding-screen'), 'layout', {
                  nativeEvent: { layout: { x: 0, y: 0, width: step.width, height: step.height } },
                });
                break;
            }
            expectOneScreen();
          }
          expect(mockKvStore.values.has('onboarding_seen')).toBe(false);
          await cleanup();
        }),
        { numRuns: 150 },
      );
    },
    FLOW_TIMEOUT,
  );

  test(
    'from any screen, any exit saves the flag and lands where it should, with no way back',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(3),
          fc.constantFrom('secondary', 'primary'),
          fc.nat(2),
          async (page, exit, presses) => {
            mockKvStore.values.clear();
            mockCamera.setPermission('granted');
            await renderRouter('./src/app', { initialUrl: '/' });
            await screen.findByRole('button', { name: 'Next' });
            for (let i = 0; i < page; i++) {
              await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
            }
            await act(async () => {
              jest.advanceTimersByTime(400);
            });
            const last = page === SCREENS.length - 1;
            const name =
              exit === 'secondary' ? (last ? 'Look around first' : 'Skip') : last ? 'Scan a plant' : null;
            if (!name) return void (await cleanup());
            const target = screen.getByRole('button', { name });
            await act(async () => {
              for (let i = 0; i <= presses; i++) fireEvent.press(target);
            });
            await act(async () => {
              jest.runOnlyPendingTimers();
            });
            expect(mockKvStore.values.get('onboarding_seen')).toBe('1');
            expect(screen).toHavePathname(name === 'Scan a plant' ? '/scan' : '/');
            await cleanup();
          },
        ),
        { numRuns: 100 },
      );
    },
    FLOW_TIMEOUT,
  );
});
