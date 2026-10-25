import { charCount } from '@/lib/text';

export const NAME_MAX = 40;
export const ROOM_MAX = 30;

export type Validation = { ok: true; value: string } | { ok: false; reason: 'empty' | 'too_long' };

// Zero-width and other format characters (\p{Cf}) are invisible on their own,
// so a name made only of them would show as blank.
const visible = (value: string) => value.replace(/[\p{Cf}\s]/gu, '');

function validate(raw: string, max: number): Validation {
  const value = raw.trim();
  if (visible(value).length === 0) return { ok: false, reason: 'empty' };
  if (charCount(value) > max) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

export const validateName = (raw: string) => validate(raw, NAME_MAX);
export const validateRoom = (raw: string) => validate(raw, ROOM_MAX);
