import { mockKvStore } from '@/testing/nativeMocks';

import { readSeen, saveSeen } from '../seen';

test('nothing stored means onboarding has not been seen', () => {
  mockKvStore.values.clear();
  expect(readSeen()).toBe(false);
});

test('saving marks it seen for the next read', () => {
  mockKvStore.values.clear();
  saveSeen();
  expect(readSeen()).toBe(true);
});

test('a read that throws counts as seen, so storage trouble never blocks the app', () => {
  mockKvStore.values.clear();
  mockKvStore.failRead = new Error('disk I/O error');
  expect(readSeen()).toBe(true);
});

test('a write that throws is swallowed; the flow can show again next launch', () => {
  mockKvStore.values.clear();
  mockKvStore.failWrite = new Error('disk full');
  expect(() => saveSeen()).not.toThrow();
  expect(readSeen()).toBe(false);
});
