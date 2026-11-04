// Every backend failure becomes one of a few codes, so screens show plain words and raw Supabase
// error text never reaches a user.

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

export const BACKEND_ERRORS = [
  'not_configured',
  'offline',
  'rate_limited',
  'session_expired',
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

export function toBackendError(error: unknown): BackendError {
  if (statusOf(error) === 429) return 'rate_limited';
  if (isAuthRetryableFetchError(error)) return error.status === 0 ? 'offline' : 'unknown';
  if (isAuthSessionMissingError(error)) return 'session_expired';
  if (isAuthApiError(error) && error.code && SESSION_GONE.has(error.code)) return 'session_expired';
  if (error instanceof TypeError && NETWORK_MESSAGES.some((m) => error.message.includes(m))) {
    return 'offline';
  }
  return 'unknown';
}
