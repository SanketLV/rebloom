// Its own file: in kindwise-flow.test.tsx it left the test router unable to start the next scan
// (cause not pinned down; jest isolates modules per file). Same harness as kindwise-flow.test.tsx.

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { resetAccountForTests } from '@/account/store';
import { resetSessionForTests } from '@/backend/session';
import { FakeDiagnoseServer } from '@/testing/fakeDiagnoseServer';
import { DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { mockCamera, mockSqlite } from '@/testing/nativeMocks';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

// Real scan ids: the shared mock repeats ids across tests, and a closing scan from one test would
// then name the next test's row.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('../testing/nativeMocks').cryptoModule,
  randomUUID: () => jest.requireActual('crypto').randomUUID(),
}));

// No 1.2 s pause per test.
jest.mock('@/scan/runDiagnosis', () => {
  const actual = jest.requireActual('@/scan/runDiagnosis');
  return {
    ...actual,
    runDiagnosis: (input: unknown, options: object) => actual.runDiagnosis(input, { minMs: 0, ...options }),
  };
});

let server: FakeDiagnoseServer;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  server = new FakeDiagnoseServer();
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  mockCamera.setPermission('granted');
});

afterEach(() => {
  resetSessionForTests();
  resetAccountForTests();
  jest.restoreAllMocks();
});

type Row = Record<string, string | number | null>;
const scans = () => mockSqlite.db().getAllAsync<Row>('SELECT * FROM scans', []);

async function shoot() {
  const view = await renderRouter('./src/app', { initialUrl: '/scan' });
  await screen.findByRole('button', { name: 'Close camera', includeHiddenElements: true }, { timeout: 5000 });
  await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
  return view;
}


// Review round 2: every unfinished row has an exit, whatever state it is stuck in.
test('any unfinished scan can be removed from My Plants, with its photo', async () => {
  server.answers = [{ status: 429, resetsAt: '2026-12-01T00:00:00Z' }, { status: 404 }];
  const view = await shoot();
  await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view).toHavePathname('/plants'));
  const remove = await screen.findByRole('button', { name: /^Remove scan from / });
  await fireEvent.press(remove);
  await waitFor(async () => expect((await scans())[0].deleted_at).not.toBeNull());
  expect(fakeFs.under(`${DOCUMENT}/photos`)).toEqual([]);
  expect(screen.queryByRole('button', { name: /^Remove scan from / })).toBeNull();
  expect(server.diagnoseCalls.at(-1)).toMatchObject({ method: 'DELETE' });
});
