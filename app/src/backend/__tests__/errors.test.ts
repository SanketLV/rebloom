import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';
import fc from 'fast-check';

import { BACKEND_ERRORS, toBackendError } from '../errors';

describe('toBackendError', () => {
  test('a request that never reached the server → offline', () => {
    expect(toBackendError(new AuthRetryableFetchError('Network request failed', 0))).toBe('offline');
    expect(toBackendError(new TypeError('Network request failed'))).toBe('offline');
    expect(toBackendError(new TypeError('Failed to fetch'))).toBe('offline');
  });

  test('the server is down (5xx) → unknown, not offline', () => {
    expect(toBackendError(new AuthRetryableFetchError('Bad gateway', 502))).toBe('unknown');
  });

  test('HTTP 429 → rate_limited', () => {
    expect(toBackendError(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      'rate_limited',
    );
    expect(toBackendError(new AuthApiError('Slow down', 429, 'over_email_send_rate_limit'))).toBe(
      'rate_limited',
    );
  });

  test.each(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'user_not_found'])(
    'the server no longer accepts the session (%s) → session_expired',
    (code) => {
      expect(toBackendError(new AuthApiError('Invalid', 400, code))).toBe('session_expired');
    },
  );

  test('anything else → unknown', () => {
    expect(toBackendError(new AuthApiError('Bad', 400, 'validation_failed'))).toBe('unknown');
    expect(toBackendError(new AuthUnknownError('Weird', null))).toBe('unknown');
    expect(toBackendError(new Error('boom'))).toBe('unknown');
    expect(toBackendError(undefined)).toBe('unknown');
  });

  test('property: always one of the five codes, never the original message', () => {
    const anyError = fc.oneof(
      fc.anything(),
      fc.string().map((m) => new Error(m)),
      fc.string().map((m) => new TypeError(m)),
      fc
        .record({
          message: fc.string(),
          status: fc.oneof(fc.integer({ min: -1, max: 700 }), fc.constant(undefined)),
          code: fc.oneof(fc.string(), fc.constant(undefined)),
          name: fc.oneof(fc.string(), fc.constantFrom('AuthApiError', 'AuthRetryableFetchError')),
        })
        .map((r) => Object.assign(new Error(r.message), r)),
      fc
        .tuple(fc.string(), fc.integer({ min: 0, max: 599 }), fc.string())
        .map(([m, s, c]) => new AuthApiError(m, s, c)),
      fc.tuple(fc.string(), fc.integer({ min: 0, max: 599 })).map(([m, s]) => new AuthRetryableFetchError(m, s)),
    );
    fc.assert(
      fc.property(anyError, (error) => {
        const code = toBackendError(error);
        expect(BACKEND_ERRORS).toContain(code);
      }),
      { numRuns: 1000 },
    );
  });
});
