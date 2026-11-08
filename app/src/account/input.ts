// What the user types into the sign-in screens, cleaned before it is checked or sent
// (review rule: normalize user text before validating or comparing).

const INVISIBLE = /\p{Cf}/gu;
const MAX_EMAIL = 254;
// A shape check only (x@y.z, no spaces, one @); the auth server has the final say.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// NFKC first: fullwidth letters and digits (some keyboards, copied text) become plain ones.
export function normalizeEmail(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE, '').trim().toLowerCase();
}

export function isEmailShape(email: string): boolean {
  return email.length <= MAX_EMAIL && EMAIL_SHAPE.test(email);
}

/** Digits only, at most 6: "123 456" and "123-456" become "123456". */
export function cleanCode(text: string): string {
  return text.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 6);
}
