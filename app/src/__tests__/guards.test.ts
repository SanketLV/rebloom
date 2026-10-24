import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import appJson from '../../app.json';

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
