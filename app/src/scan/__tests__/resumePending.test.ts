import type { DiagnoseOutcome } from '@/backend/diagnose';
import { migrate } from '@/storage/migrations';
import { getScan, insertPendingScan } from '@/storage/scansRepo';
import { SICK_BODY } from '@/testing/fakeDiagnoseServer';
import { DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { createTestDb, type TestDb } from '@/testing/sqljs';

import { finishPendingScans } from '../resumePending';

let mockSignedIn: string | null = 'u-1';
jest.mock('@/backend/session', () => ({ signedInUserId: () => mockSignedIn }));

jest.mock('@/backend/diagnose', () => ({
  getDiagnose: jest.fn(),
  confirmDiagnose: jest.fn(async () => {}),
}));
const backend = jest.requireMock('@/backend/diagnose') as { getDiagnose: jest.Mock; confirmDiagnose: jest.Mock };

const T = '2026-11-20T10:00:00.000Z';
let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
  backend.getDiagnose.mockReset();
  backend.confirmDiagnose.mockClear();
});

const pending = async (id: string, ownerId: string | null = 'u-1') => {
  fakeFs.put(`${DOCUMENT}/photos/${id}.jpg`, { size: 90_000 });
  await insertPendingScan(db, { id, photoPath: `photos/${id}.jpg`, diagnoserId: 'kindwise-v1', ownerId }, T);
};

beforeEach(() => {
  mockSignedIn = 'u-1';
});

test('a finished scan becomes ready, stored, and confirmed to the server', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'done', body: SICK_BODY } satisfies DiagnoseOutcome);
  expect(await finishPendingScans(db)).toEqual({ a: 'ready' });
  expect((await getScan(db, 'a'))?.status).toBe('ready');
  expect(backend.confirmDiagnose).toHaveBeenCalledWith('a');
});

test('the server has nothing → needs retry; the scan and photo stay', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'not_found' });
  expect(await finishPendingScans(db)).toEqual({ a: 'retry' });
  expect((await getScan(db, 'a'))?.status).toBe('pending');
  expect(fakeFs.has(`${DOCUMENT}/photos/a.jpg`)).toBe(true);
});

test('still running, offline or a server error → still finishing', async () => {
  for (const kind of ['pending', 'offline', 'error', 'busy', 'not_configured'] as const) {
    await pending(kind);
    backend.getDiagnose.mockResolvedValue({ kind });
  }
  expect(await finishPendingScans(db)).toEqual({
    pending: 'finishing',
    offline: 'finishing',
    error: 'finishing',
    busy: 'finishing',
    not_configured: 'finishing',
  });
});

test('not a plant → the scan and its photo are discarded', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'not_plant' });
  expect(await finishPendingScans(db)).toEqual({});
  expect(await getScan(db, 'a')).toBeNull();
  expect(fakeFs.has(`${DOCUMENT}/photos/a.jpg`)).toBe(false);
});

test('a GET that throws leaves the scan finishing and never rejects', async () => {
  await pending('a');
  backend.getDiagnose.mockRejectedValue(new Error('boom'));
  expect(await finishPendingScans(db)).toEqual({ a: 'finishing' });
});

test('two calls at once ask the server once per scan', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'done', body: SICK_BODY });
  const [one, two] = await Promise.all([finishPendingScans(db), finishPendingScans(db)]);
  expect(one).toEqual(two);
  expect(backend.getDiagnose).toHaveBeenCalledTimes(1);
});

test('ready scans are not asked about again', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'done', body: SICK_BODY });
  await finishPendingScans(db);
  backend.getDiagnose.mockClear();
  expect(await finishPendingScans(db)).toEqual({});
  expect(backend.getDiagnose).not.toHaveBeenCalled();
});

// Review #2: a scan belongs to the account that sent it; another account must not re-send it.
test('the server has nothing, but the scan was sent by another account → other_account, no re-send', async () => {
  await pending('a', 'u-anon');
  backend.getDiagnose.mockResolvedValue({ kind: 'not_found' });
  expect(await finishPendingScans(db)).toEqual({ a: 'other_account' });
});

test('a scan never sent (no owner) can be sent again', async () => {
  await pending('a', null);
  backend.getDiagnose.mockResolvedValue({ kind: 'not_found' });
  expect(await finishPendingScans(db)).toEqual({ a: 'retry' });
});

// Review #3: Kindwise gave up; the server gave the scan back.
test('Kindwise failed for good (502) → retry', async () => {
  await pending('a');
  backend.getDiagnose.mockResolvedValue({ kind: 'server' });
  expect(await finishPendingScans(db)).toEqual({ a: 'retry' });
});
