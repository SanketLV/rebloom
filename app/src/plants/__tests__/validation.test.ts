import { NAME_MAX, ROOM_MAX, validateName, validateRoom } from '../validation';

test('limits are 40 for a name and 30 for a room', () => {
  expect(NAME_MAX).toBe(40);
  expect(ROOM_MAX).toBe(30);
});

test.each(['', '   ', '\n\t '])('blank name %j is rejected', (name) => {
  expect(validateName(name)).toEqual({ ok: false, reason: 'empty' });
});

test('a name is trimmed', () => {
  expect(validateName('  My plant  ')).toEqual({ ok: true, value: 'My plant' });
});

test('40 characters is fine, 41 is too long, counted as people see them', () => {
  expect(validateName('🌱'.repeat(40))).toEqual({ ok: true, value: '🌱'.repeat(40) });
  expect(validateName('a'.repeat(41))).toEqual({ ok: false, reason: 'too_long' });
});

test('non-Latin and emoji names are fine', () => {
  expect(validateName('モンステラ 🌿')).toEqual({ ok: true, value: 'モンステラ 🌿' });
});

test('rooms follow the same rules with a 30 limit', () => {
  expect(validateRoom('  Balcony ')).toEqual({ ok: true, value: 'Balcony' });
  expect(validateRoom(' ')).toEqual({ ok: false, reason: 'empty' });
  expect(validateRoom('x'.repeat(30))).toEqual({ ok: true, value: 'x'.repeat(30) });
  expect(validateRoom('x'.repeat(31))).toEqual({ ok: false, reason: 'too_long' });
});

test.each(['​​', ' ‍﻿ ', '⁠', ' 　'])(
  'a name of only invisible characters %j is rejected',
  (name) => {
    expect(validateName(name)).toEqual({ ok: false, reason: 'empty' });
    expect(validateRoom(name)).toEqual({ ok: false, reason: 'empty' });
  },
);

test('a name with a zero-width joiner inside an emoji is kept', () => {
  expect(validateName('👩‍🌾 corner')).toEqual({ ok: true, value: '👩‍🌾 corner' });
});
