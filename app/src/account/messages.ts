// Plain words for each backend error, per step of the account screens. Server text never reaches
// a user: anything not listed gets the step's generic sentence.

import type { BackendError } from '@/backend/errors';

export type AccountStep = 'send' | 'verify' | 'delete';

const OFFLINE = "You're offline. Connect and try again.";
const RATE_LIMITED = 'Too many tries. Wait a minute and try again.';
const NOT_CONFIGURED = "Accounts aren't available in this version of the app.";

const GENERIC: Record<AccountStep, string> = {
  send: "Couldn't send the code. Check the address and try again.",
  verify: "Couldn't sign in. Try again, or send a new code.",
  // The answer may have been lost after the delete worked, so never claim nothing happened.
  delete: "Couldn't delete your account, or couldn't confirm it. Trying again is safe.",
};

const SPECIFIC: Record<AccountStep, Partial<Record<BackendError, string>>> = {
  send: { offline: OFFLINE, rate_limited: RATE_LIMITED, not_configured: NOT_CONFIGURED },
  verify: {
    offline: OFFLINE,
    rate_limited: RATE_LIMITED,
    not_configured: NOT_CONFIGURED,
    invalid_code: "That code isn't right or has expired. Check the email or send a new one.",
  },
  delete: {
    offline: "You're offline, so we couldn't confirm the deletion. Connect and try again; trying again is safe.",
    rate_limited: RATE_LIMITED,
    not_configured: NOT_CONFIGURED,
    session_expired: 'Your sign-in has expired. Sign out, sign in again, then delete your account.',
  },
};

export function errorMessage(step: AccountStep, error: BackendError): string {
  // Own keys only, so a code like "toString" can't pick up an inherited value.
  const own = Object.prototype.hasOwnProperty.call(SPECIFIC[step], error);
  return (own && SPECIFIC[step][error]) || GENERIC[step];
}
