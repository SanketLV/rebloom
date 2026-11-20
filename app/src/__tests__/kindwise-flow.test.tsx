// The real Kindwise path end to end: camera → Analyzing (anonymous session, diagnose function) →
// Kindwise question → our questions → Result → Save, and the unfinished scans in My Plants.
// Everything is real except the network (FakeDiagnoseServer) and native modules (jest.setup).

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { resetAccountForTests } from '@/account/store';
import { resetSessionForTests } from '@/backend/session';
import { FakeDiagnoseServer, SICK_BODY } from '@/testing/fakeDiagnoseServer';
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

async function skipOurQuestions() {
  for (let i = 0; i < 3; i += 1) await fireEvent.press(await screen.findByRole('button', { name: "I'm not sure" }));
}

test('a sick plant: Kindwise question first, then ours; the real result; saved with its species', async () => {
  const view = await shoot();
  await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  expect(screen.getByText('1 of 4')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Is the soil still wet a day after watering?' })).toBeOnTheScreen();
  expect(screen.queryByText('Demo')).toBeNull();

  // The scan row and stored photo existed before the call; now the result is stored.
  const [ready] = await scans();
  expect(ready).toMatchObject({ status: 'ready', diagnoser_id: 'kindwise-v1', plant_id: null });
  expect(fakeFs.has(`${DOCUMENT}/${ready.photo_path}`)).toBe(true);
  expect(server.diagnoseCalls[0]).toMatchObject({ method: 'POST', scanId: ready.id });
  await waitFor(() => expect(server.callsOf('DELETE')).toBe(1));
  expect(server.callsTo('/auth/v1/signup')).toBe(1);

  await fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('2 of 4')).toBeOnTheScreen();
  await skipOurQuestions();

  await waitFor(() => expect(view).toHavePathname('/scan/result'));
  expect(screen.getByText('Monstera deliciosa')).toBeOnTheScreen();
  expect(screen.getByText(/Swiss cheese plant · species match 91%/)).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Overwatering' })).toBeOnTheScreen();
  expect(screen.getByText('Fungal leaf spot')).toBeOnTheScreen();
  expect(screen.getByText('Saved on your phone only')).toBeOnTheScreen();
  expect(screen.getByText('2 free scans left this month')).toBeOnTheScreen();
  expect(screen.queryByText('Demo')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Save to My Plants' }));
  expect(screen.getByLabelText('Name').props.value).toBe('Swiss cheese plant');
  await fireEvent.press(screen.getByRole('button', { name: 'Save plant' }));
  await waitFor(() => expect(view).toHavePathname('/plants'));
  const [saved] = await scans();
  expect(saved).toMatchObject({ status: 'done', question_answer: 'yes' });
  expect(JSON.parse(saved.species as string)[0].name).toBe('Monstera deliciosa');
  expect(JSON.parse(saved.treatment as string).d1.prevention).toEqual(['Let the soil dry.']);
});

test('not a plant: a Retake screen, and nothing is kept', async () => {
  server.answers = [{ status: 422 }];
  await shoot();
  expect(await screen.findByRole('header', { name: "This doesn't look like a plant" })).toBeOnTheScreen();
  expect(screen.getByText(/This didn't use a free scan/)).toBeOnTheScreen();
  await waitFor(async () => expect((await scans())[0]?.deleted_at).not.toBeNull());
  expect(fakeFs.under(`${DOCUMENT}/photos`)).toEqual([]);
});

test('out of free scans: the reset date, Done keeps the scan for My Plants', async () => {
  server.answers = [{ status: 429, resetsAt: '2026-12-01T00:00:00Z' }, { status: 404 }];
  const view = await shoot();
  expect(await screen.findByRole('header', { name: "You've used your 3 free scans this month" })).toBeOnTheScreen();
  expect(screen.getByText(/They reset on (December 1|1 December)\./)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view).toHavePathname('/plants'));
  expect(await screen.findByText("Diagnosis didn't finish · Try again")).toBeOnTheScreen();
  expect((await scans())[0].status).toBe('pending');
});

test('offline, then Scan later: My Plants finishes it when the server has it, and it opens', async () => {
  server.answers = ['offline', { status: 200, body: SICK_BODY }];
  const view = await shoot();
  expect(await screen.findByRole('header', { name: "Can't diagnose without internet" })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan later' }));
  await waitFor(() => expect(view).toHavePathname('/plants'));

  const row = await screen.findByRole('button', { name: /Diagnosis ready · See result/ });
  expect(server.diagnoseCalls.at(-2)).toMatchObject({ method: 'GET' });
  await fireEvent.press(row);
  await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  expect(screen.getByText('1 of 4')).toBeOnTheScreen();
});

// Review #1: Kindwise saw a plant but named nothing we can show (only harmless classes).
test('no clear problem: its own screen with Retake, never an empty result', async () => {
  server.answers = [{ status: 200, body: { ...SICK_BODY, diseases: [], question: null } }];
  await shoot();
  expect(await screen.findByRole('header', { name: "We couldn't find a clear problem" })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Retake photo' })).toBeOnTheScreen();
});

// Review #7: only a sure "not counted" answer says so.
test('a server error that may have counted the scan does not promise it was free', async () => {
  server.answers = [{ status: 503 }];
  await shoot();
  expect(await screen.findByRole('header', { name: "We couldn't check this photo" })).toBeOnTheScreen();
  expect(screen.queryByText(/didn't use a free scan/)).toBeNull();
});

test('a healthy plant: Looks healthy, the species, and Save instead of a treatment plan', async () => {
  server.answers = [
    { status: 200, body: { ...SICK_BODY, is_healthy: { probability: 0.88, binary: true }, diseases: [], question: null } },
  ];
  const view = await shoot();
  await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  expect(screen.getByText('1 of 3')).toBeOnTheScreen();
  await skipOurQuestions();
  await waitFor(() => expect(view).toHavePathname('/scan/result'));
  expect(screen.getByRole('header', { name: 'Looks healthy' })).toBeOnTheScreen();
  expect(screen.getByText('No signs of disease or pests in this photo.')).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: 'Save to My Plants' }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'See treatment plan' })).toBeNull();
});

test('the app closed mid-call: the scan waits as pending with its photo', async () => {
  server.answers = ['hang'];
  const view = await shoot();
  await waitFor(async () => expect((await scans())[0]?.status).toBe('pending'));
  await act(async () => router.dismissTo('/plants'));
  await waitFor(() => expect(view).toHavePathname('/plants'));
  expect(await screen.findByText('Finishing diagnosis…')).toBeOnTheScreen();
  const [row] = await scans();
  expect(row.deleted_at).toBeNull();
  expect(fakeFs.has(`${DOCUMENT}/${row.photo_path}`)).toBe(true);
});

// Last: after this manual dismiss the test router can't open the camera again.
test('closing a result without saving removes the scan and its stored photo', async () => {
  const view = await shoot();
  await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  await act(async () => router.dismissTo('/plants'));
  await waitFor(async () => expect((await scans())[0].deleted_at).not.toBeNull());
  expect(fakeFs.under(`${DOCUMENT}/photos`)).toEqual([]);
});
