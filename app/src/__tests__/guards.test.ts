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
