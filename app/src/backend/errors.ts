// Every backend failure becomes one of a few codes, so screens show plain words and raw Supabase
// error text never reaches a user.

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

import { TimeoutError } from '@/lib/async';

export const BACKEND_ERRORS = [
  'not_configured',
  'offline',
  'rate_limited',
  'session_expired',
  'invalid_code',
  'unknown',
] as const;

export type BackendError = (typeof BACKEND_ERRORS)[number];

// Codes Supabase Auth sends when the stored session can't be used any more. (supabase-js turns
// `session_not_found` into an AuthSessionMissingError, handled below, not an AuthApiError.)
const SESSION_GONE = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_expired',
  'user_not_found',
]);

// What React Native's and the browser's fetch throw when the request never reached a server.
const NETWORK_MESSAGES = ['Network request failed', 'Failed to fetch', 'Load failed'];

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

// Supabase Auth answers a wrong sign-in code and a used or expired one the same way.
const INVALID_CODE = new Set(['otp_expired']);

export function toBackendError(error: unknown): BackendError {
  if (statusOf(error) === 429) return 'rate_limited';
  // Our own time limit on a call that got no answer: the same as no network for the user.
  if (error instanceof TimeoutError) return 'offline';
  if (isAuthApiError(error) && error.code && INVALID_CODE.has(error.code)) return 'invalid_code';
  if (isAuthRetryableFetchError(error)) return error.status === 0 ? 'offline' : 'unknown';
  if (isAuthSessionMissingError(error)) return 'session_expired';
  if (isAuthApiError(error) && error.code && SESSION_GONE.has(error.code)) return 'session_expired';
  if (error instanceof TypeError && NETWORK_MESSAGES.some((m) => error.message.includes(m))) {
    return 'offline';
  }
  return 'unknown';
}
