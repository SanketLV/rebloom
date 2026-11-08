// When a code was last sent to each address, in memory, so "Send code" again within the wait
// goes back to the code screen instead of asking the server (which refuses it, 429).
// ponytail: lost on restart; the server's own limit and message cover that case.

export const RESEND_SECONDS = 60;

const sentAt = new Map<string, number>();
// The address the code screen is for. Kept here, not in the URL: a route param is decoded twice
// on the way (an address with "%" became another address), and any app could set it by link.
let current: string | null = null;

export function setCodeEmail(email: string): void {
  current = email;
}

export function codeEmail(): string | null {
  return current;
}

export function noteCodeSent(email: string): void {
  sentAt.set(email, Date.now());
}

/** When a new code may be asked for: now for an address with no send yet. */
export function resendDeadline(email: string): number {
  const at = sentAt.get(email);
  return at === undefined ? 0 : at + RESEND_SECONDS * 1000;
}

export function secondsUntilResend(email: string): number {
  return Math.max(0, Math.ceil((resendDeadline(email) - Date.now()) / 1000));
}

/** Tests only. */
export function resetCodeSendsForTests(): void {
  sentAt.clear();
  current = null;
}
