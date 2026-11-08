import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthUnknownError,
  createClient,
} from '@supabase/supabase-js';
import * as fc from 'fast-check';

import { TimeoutError } from '@/lib/async';

import { BACKEND_ERRORS, toBackendError } from '../errors';

// What real Supabase Auth answers (API version 2024-01-01: `code` + `message`, with the version
// header), parsed by supabase-js exactly as in the app: through a real client call.
async function realAuthError(status: number, body: object) {
  const client = createClient('https://abc.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
        }),
    },
  });
  const { error } = await client.auth.getUser('a.b.c');
  return error;
}

describe('toBackendError with errors as supabase-js really builds them', () => {
  test('session_not_found (403) → session_expired', async () => {
    const error = await realAuthError(403, { code: 'session_not_found', message: 'Session not found' });
    expect(toBackendError(error)).toBe('session_expired');
  });

  test('refresh_token_not_found (400) → session_expired', async () => {
    const error = await realAuthError(400, { code: 'refresh_token_not_found', message: 'Invalid' });
    expect(toBackendError(error)).toBe('session_expired');
  });

  test('user_not_found (404) → session_expired', async () => {
    const error = await realAuthError(404, { code: 'user_not_found', message: 'User not found' });
    expect(toBackendError(error)).toBe('session_expired');
  });

  test('over_request_rate_limit (429) → rate_limited', async () => {
    const error = await realAuthError(429, { code: 'over_request_rate_limit', message: 'Slow down' });
    expect(toBackendError(error)).toBe('rate_limited');
  });

  // A wrong code and a used code get this same answer (pinned in supabase/tests/local/auth.test.mjs).
  test('otp_expired (403) → invalid_code', async () => {
    const error = await realAuthError(403, { code: 'otp_expired', message: 'Token has expired' });
    expect(toBackendError(error)).toBe('invalid_code');
  });

  test('otp_expired in the local stack body shape (error_code + msg) → invalid_code', async () => {
    const error = await realAuthError(403, {
      code: 403,
      error_code: 'otp_expired',
      msg: 'Token has expired or is invalid',
    });
    expect(toBackendError(error)).toBe('invalid_code');
  });
});

describe('toBackendError', () => {
  test('a request that never reached the server → offline', () => {
    expect(toBackendError(new AuthRetryableFetchError('Network request failed', 0))).toBe('offline');
    expect(toBackendError(new TypeError('Network request failed'))).toBe('offline');
    expect(toBackendError(new TypeError('Failed to fetch'))).toBe('offline');
  });

  test('our own time limit ran out (TimeoutError) → offline', () => {
    expect(toBackendError(new TimeoutError(10_000))).toBe('offline');
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

  test.each(['refresh_token_not_found', 'refresh_token_already_used', 'user_not_found'])(
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
