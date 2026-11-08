import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import appJson from '../../app.json';
import { backendReachers, SOURCE_EXTENSIONS } from '../testing/importGraph';

const SRC = join(__dirname, '..');
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('hex colors only live in src/theme', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !relative(SRC, file).startsWith('theme'))
    .filter((file) => HEX.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file));
  expect(offenders).toEqual([]);
});

test('app is light-only until dark mode is designed', () => {
  expect(appJson.expo.userInterfaceStyle).toBe('light');
});

type PluginEntry = string | [string, Record<string, unknown>];

function pluginOptions(name: string) {
  const entry = (appJson.expo.plugins as PluginEntry[]).find(
    (p) => (Array.isArray(p) ? p[0] : p) === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

test('camera asks for the camera only, never the microphone', () => {
  const camera = pluginOptions('expo-camera');
  expect(camera?.cameraPermission).toEqual(expect.any(String));
  expect(camera?.microphonePermission).toBe(false);
  expect(camera?.recordAudioAndroid).toBe(false);
});

test('image picker asks for photos only and leaves the camera permission alone', () => {
  const picker = pluginOptions('expo-image-picker');
  expect(picker?.photosPermission).toEqual(expect.any(String));
  expect(picker?.microphonePermission).toBe(false);
  // `false` here would block android.permission.CAMERA, which expo-camera needs.
  expect(picker).not.toHaveProperty('cameraPermission');
});

// Only the account feature reaches the backend, and only once Settings or an account screen is
// open, so an app start makes no network request (root-layout test). Imports are parsed, resolved
// and followed through other files (see src/testing/importGraph.ts); every file under src/
// counts, .js too. Add a file here only on purpose.
const ALLOWED_BACKEND_IMPORTERS: string[] = [
  'account/AccountCard.tsx',
  'account/AccountView.tsx',
  'account/DeleteAccountSheet.tsx',
  'account/messages.ts',
  'account/navigation.ts',
  'account/SignInView.tsx',
  'account/store.ts',
  'app/account/code.tsx',
  'app/account/email.tsx',
  'app/account/index.tsx',
  'app/settings.tsx',
];

function allSources(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__') walk(path);
      } else if (SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
        out[relative(dir, path).split('\\').join('/')] = readFileSync(path, 'utf8');
      }
    }
  };
  walk(dir);
  return out;
}

test('only the files listed in ALLOWED_BACKEND_IMPORTERS reach src/backend', () => {
  expect(backendReachers(allSources(SRC), ALLOWED_BACKEND_IMPORTERS)).toEqual([]);
});

test('the backend import guard sees every import form, path and file type', () => {
  const backend = { 'backend/session.ts': 'export const getSession = 1;' };
  const caught: Record<string, string> = {
    'zz/a.ts': "import { getSession } from '@/backend/session';",
    'zz/b.ts': "import '@/backend/session';",
    'zz/c.ts': 'const s = require(`@/backend/session`);',
    'zz/d.ts': "import{getSession}from'@/backend/session'",
    'zz/e.ts': "export { getSession } from '../backend/session';",
    'zz/f.ts': "export * from '@/lib/../backend/session';",
    'zz/g.ts': "const s = await import('@/backend/session');",
    'zz/h.js': "module.exports = require('../backend/session');",
    'zz/i.native.tsx': "import type { X } from '@/backend/session';",
    'zz/j.ts': "import x = require('@/backend/session');",
    'zz/k.ts': "import { relay } from '@/testing/relay';",
    'zz/l.ts': "import { getSession } from '@/backend';",
  };
  const helpers = { 'testing/relay.ts': "export { getSession as relay } from '@/backend/session';" };
  const clean = {
    'zz/ok1.ts': "import { x } from '@/backendless';",
    'zz/ok2.ts': "const s = 'not an import: @/backend/session';",
    'zz/ok3.ts': "import { x } from 'some-package/backend';",
  };
  const found = backendReachers({ ...backend, ...helpers, ...caught, ...clean }, []);
  expect(found).toEqual(Object.keys(caught).sort());
  expect(backendReachers({ ...backend, ...caught }, Object.keys(caught))).toEqual([]);
});
