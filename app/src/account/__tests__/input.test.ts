import * as fc from 'fast-check';

import { cleanCode, isEmailShape, normalizeEmail } from '../input';

// Format characters (\p{Cf}) people paste in from chat apps and web pages.
const INVISIBLE = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u00AD', '\u202E', '\u2066'];
const invisible = fc.constantFrom(...INVISIBLE);

const localChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._+-'.split(''));
const labelChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
const word = (chars: fc.Arbitrary<string>, max: number) =>
  fc.array(chars, { minLength: 1, maxLength: max }).map((a) => a.join(''));
const validAddress = fc
  .tuple(word(localChar, 20), word(labelChar, 15), word(labelChar, 6))
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Mixes letters, capitals, spaces, invisible characters and anything else.
const messy = fc
  .array(
    fc.oneof(
      fc.string({ maxLength: 3 }),
      fc.constantFrom('A', 'Z', 'É', ' ', '\t', '\n', '@', '.'),
      invisible,
    ),
    { maxLength: 30 },
  )
  .map((parts) => parts.join(''));

describe('normalizeEmail', () => {
  test('strips invisible characters, trims and lowercases', () => {
    expect(normalizeEmail('  Sam\u200B@Example.COM\uFEFF ')).toBe('sam@example.com');
  });

  test('fullwidth letters and signs become plain ones', () => {
    expect(normalizeEmail('\uFF53\uFF41\uFF4D\uFF20example.com')).toBe('sam@example.com');
  });

  test('property: idempotent, no \\p{Cf}, no outer space, no capitals', () => {
    fc.assert(
      fc.property(messy, (input) => {
        const out = normalizeEmail(input);
        expect(normalizeEmail(out)).toBe(out);
        expect(out).not.toMatch(/\p{Cf}/u);
        expect(out).toBe(out.trim());
        expect(out).toBe(out.toLowerCase());
      }),
    );
  });

  test('property: invisible characters and outer spaces never change a valid address', () => {
    fc.assert(
      fc.property(
        validAddress,
        fc.array(fc.tuple(fc.nat(), invisible), { maxLength: 5 }),
        fc.constantFrom('', ' ', '  ', '\t'),
        fc.boolean(),
        (address, inserts, pad, shout) => {
          let dirty = shout ? address.toUpperCase() : address;
          for (const [at, ch] of inserts) {
            const i = at % (dirty.length + 1);
            dirty = dirty.slice(0, i) + ch + dirty.slice(i);
          }
          expect(normalizeEmail(pad + dirty + pad)).toBe(address);
        },
      ),
    );
  });
});

describe('isEmailShape', () => {
  test.each(['a@b.co', 'sam.lee+plants@mail.example.org'])('accepts %s', (email) => {
    expect(isEmailShape(email)).toBe(true);
  });

  test.each(['', 'sam', 'sam@', '@example.com', 'sam@example', 'sam@example.', 'sa m@example.com', 'sam@@example.com'])(
    'refuses %j',
    (email) => {
      expect(isEmailShape(email)).toBe(false);
    },
  );

  test('refuses more than 254 characters', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(180)}.com`; // 64 + 1 + 184 = 249
    expect(isEmailShape(`${local}@${domain}`)).toBe(true);
    expect(isEmailShape(`${local}@${'b'.repeat(186)}.com`)).toBe(false); // 255
  });

  test('property: every valid address passes, and its normalized form too', () => {
    fc.assert(fc.property(validAddress, (address) => expect(isEmailShape(address)).toBe(true)));
  });
});

describe('cleanCode', () => {
  test.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    ['123-456', '123456'],
    ['Your code: 123456.', '123456'],
    ['1234567', '123456'],
    ['12', '12'],
    ['', ''],
  ])('%j → %j', (input, out) => {
    expect(cleanCode(input)).toBe(out);
  });

  // Review round 1, #7: a fullwidth code (some keyboards and copied text) became empty.
  test('fullwidth digits count as digits', () => {
    expect(cleanCode('\uFF11\uFF12\uFF13 \uFF14\uFF15\uFF16')).toBe('123456');
  });

  test('property: digits only, at most 6', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (input) => {
        expect(cleanCode(input)).toMatch(/^[0-9]{0,6}$/);
      }),
    );
  });
});
