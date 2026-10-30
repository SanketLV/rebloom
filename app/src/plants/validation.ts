import { charCount } from '@/lib/text';

export const NAME_MAX = 40;
export const ROOM_MAX = 30;

export type Validation = { ok: true; value: string } | { ok: false; reason: 'empty' | 'too_long' };

// Normalizes to NFC and strips control characters (\p{Cc}), default ignorable code points
// (\p{Default_Ignorable_Code_Point}, including zero-width chars and variation selectors),
// Hangul fillers (U+3164, U+FFA0), and braille blank (U+2800).
export const visibleText = (text: string): string =>
  text
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Default_Ignorable_Code_Point}\u2800\u3164\uffa0]/gu, '');

function validate(raw: string, max: number): Validation {
  const value = raw.trim();
  if (visibleText(value).replace(/\p{M}/gu, '').trim().length === 0) return { ok: false, reason: 'empty' };
  if (charCount(value) > max) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

export const validateName = (raw: string) => validate(raw, NAME_MAX);
export const validateRoom = (raw: string) => validate(raw, ROOM_MAX);
