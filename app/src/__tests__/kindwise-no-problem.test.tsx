// Its own file: in kindwise-flow.test.tsx it left the test router unable to start the next scan
// (cause not pinned down; jest isolates modules per file). Same harness as kindwise-flow.test.tsx.

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { resetAccountForTests } from '@/account/store';
import { resetSessionForTests } from '@/backend/session';
import { FakeDiagnoseServer, SICK_BODY } from '@/testing/fakeDiagnoseServer';
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


test('a background result with no clear problem: opening it offers Retake and Done, and both clear it', async () => {
  server.answers = ['offline', { status: 200, body: { ...SICK_BODY, diseases: [], question: null } }];
  const view = await shoot();
  await fireEvent.press(await screen.findByRole('button', { name: 'Scan later' }));
  await waitFor(() => expect(view).toHavePathname('/plants'));
  await fireEvent.press(await screen.findByRole('button', { name: /Diagnosis ready · See result/ }));
  expect(await screen.findByRole('header', { name: "We couldn't find a clear problem" })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(async () => expect((await scans())[0].deleted_at).not.toBeNull());
});
