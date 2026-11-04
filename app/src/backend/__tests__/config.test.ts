import { createClient } from '@supabase/supabase-js';
import * as fc from 'fast-check';

import { readBackendConfig } from '../config';

const KEY = 'sb_publishable_abc';

describe('readBackendConfig', () => {
  test('both values and an https URL → configured', () => {
    expect(readBackendConfig({ url: 'https://abc.supabase.co', key: KEY }, false)).toEqual({
      configured: true,
      url: 'https://abc.supabase.co',
      key: KEY,
    });
  });

  test.each([
    ['no URL', { key: KEY }],
    ['no key', { url: 'https://abc.supabase.co' }],
    ['empty URL', { url: '', key: KEY }],
    ['empty key', { url: 'https://abc.supabase.co', key: '' }],
    ['whitespace-only key', { url: 'https://abc.supabase.co', key: '   ' }],
    ['not a URL', { url: 'abc.supabase.co', key: KEY }],
    ['another scheme', { url: 'ftp://abc.supabase.co', key: KEY }],
    ['nothing at all', {}],
    ['a host the URL parser rejects', { url: 'https://[', key: KEY }],
    ['a port above 65535', { url: 'https://abc.supabase.co:99999', key: KEY }],
    ['user and password in the URL', { url: 'https://me:secret@abc.supabase.co', key: KEY }],
  ])('%s → not configured', (_name, env) => {
    expect(readBackendConfig(env, true)).toEqual({ configured: false });
  });

  test('http:// is allowed in development builds only', () => {
    const env = { url: 'http://192.168.1.20:54321', key: KEY };
    expect(readBackendConfig(env, true)).toEqual({ configured: true, url: env.url, key: KEY });
    expect(readBackendConfig(env, false)).toEqual({ configured: false });
  });

  test('trims spaces and newlines around both values', () => {
    expect(readBackendConfig({ url: '  https://abc.supabase.co\n', key: ` ${KEY}\t` }, false)).toEqual(
      { configured: true, url: 'https://abc.supabase.co', key: KEY },
    );
  });

  test('property: every URL it accepts can really make a Supabase client', () => {
    const urlish = fc.oneof(
      fc.webUrl(),
      fc.tuple(fc.constantFrom('https://', 'http://'), fc.string()).map(([scheme, rest]) => scheme + rest),
      fc
        .tuple(fc.domain(), fc.integer({ min: -10, max: 100000 }))
        .map(([host, port]) => `https://${host}:${port}`),
    );
    fc.assert(
      fc.property(urlish, fc.boolean(), (url, isDev) => {
        const result = readBackendConfig({ url, key: KEY }, isDev);
        if (!result.configured) return;
        expect(() => createClient(result.url, result.key, { auth: { persistSession: false } })).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  test('property: never throws, and configured always means a usable URL and key', () => {
    const urlish = fc.oneof(
      fc.string(),
      fc.constantFrom('https://', 'http://', 'HTTPS://', 'https:', ' https://x.co', 'javascript:'),
      fc
        .tuple(
          fc.constantFrom('https://', 'http://', 'ftp://', 'file://', ''),
          fc.string(),
        )
        .map(([scheme, rest]) => scheme + rest),
      fc.webUrl(),
    );
    fc.assert(
      fc.property(
        fc.option(urlish, { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        fc.boolean(),
        (url, key, isDev) => {
          const result = readBackendConfig({ url, key }, isDev);
          if (!result.configured) return;
          const allowed = isDev ? /^https?:\/\/[^/\s]/i : /^https:\/\/[^/\s]/i;
          expect(result.url).toMatch(allowed);
          expect(result.url).toBe(result.url.trim());
          expect(result.key.length).toBeGreaterThan(0);
          expect(result.key).toBe(result.key.trim());
        },
      ),
      { numRuns: 500 },
    );
  });
});
