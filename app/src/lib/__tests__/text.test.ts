import { charCount, limitChars } from '../text';

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test('counts emoji as one character each', () => {
  expect(charCount('🌱🌱')).toBe(2);
  expect('🌱🌱'.length).toBe(4);
});

test('cuts 41 emoji to 40 whole emoji, never half of one', () => {
  const cut = limitChars('🌱'.repeat(41), 40);
  expect(charCount(cut)).toBe(40);
  expect(cut).toBe('🌱'.repeat(40));
  expect(loneSurrogate.test(cut)).toBe(false);
});

test('leaves text within the limit alone', () => {
  expect(limitChars('Monstera', 40)).toBe('Monstera');
  expect(limitChars('', 40)).toBe('');
});

test('handles non-Latin text', () => {
  expect(limitChars('モンステラの葉', 3)).toBe('モンス');
});
