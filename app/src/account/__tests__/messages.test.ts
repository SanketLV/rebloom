import * as fc from 'fast-check';

import { BACKEND_ERRORS } from '@/backend/errors';

import { errorMessage, type AccountStep } from '../messages';

const STEPS: AccountStep[] = ['send', 'verify', 'delete'];

test('every step has words for every backend error', () => {
  for (const step of STEPS) {
    for (const error of BACKEND_ERRORS) {
      expect(errorMessage(step, error).length).toBeGreaterThan(10);
    }
  }
});

test.each([
  ['verify', 'invalid_code', "That code isn't right or has expired. Check the email or send a new one."],
  ['send', 'rate_limited', 'Too many tries. Wait a minute and try again.'],
  ['verify', 'offline', "You're offline. Connect and try again."],
  ['delete', 'offline', "You're offline. Connect and try again."],
] as const)('%s + %s → the spec sentence', (step, error, text) => {
  expect(errorMessage(step, error)).toBe(text);
});

test('property: anything else, even server text, gets a fixed generic sentence', () => {
  const known = new Set(STEPS.flatMap((s) => BACKEND_ERRORS.map((e) => errorMessage(s, e))));
  fc.assert(
    fc.property(fc.constantFrom(...STEPS), fc.string(), (step, raw) => {
      const text = errorMessage(step, raw as never);
      expect(known.has(text)).toBe(true);
    }),
  );
});
