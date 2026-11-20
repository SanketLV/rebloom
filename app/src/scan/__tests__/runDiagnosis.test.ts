import type { Diagnoser, Diagnosis, PreparedPhoto } from '@/diagnosis/types';
import { CACHE, fakeFs } from '@/testing/fileSystemFake';
import { mockManipulator } from '@/testing/nativeMocks';

import { DiagnoseFailure } from '@/diagnosis/kindwiseDiagnoser';

import { DIAGNOSIS_TIMEOUT_MS, DiagnosisError, runDiagnosis } from '../runDiagnosis';

const result: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [{ conditionId: 'sunburn', confidence: 0.8 }],
};

const diagnoserReturning = (
  value: Diagnosis | Promise<Diagnosis>,
): Diagnoser & { diagnose: jest.Mock } => ({
  id: 'test',
  diagnose: jest.fn(() => Promise.resolve(value)),
});

const shot = () => {
  const uri = `${CACHE}/Camera/shot.jpg`;
  fakeFs.put(uri, { size: 3_000_000, width: 4000, height: 3000 });
  return uri;
};

const fast = { minMs: 0, timeoutMs: 10_000 };

test('prepares the photo, then diagnoses the prepared photo', async () => {
  const diagnoser = diagnoserReturning(result);
  const steps: string[] = [];
  const out = await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser, onStep: (s) => steps.push(s) },
  );
  expect(out.photo).toMatchObject({ uri: `${CACHE}/scans/s1.jpg`, width: 800, height: 600 });
  expect(diagnoser.diagnose).toHaveBeenCalledWith(out.photo, { scanId: 's1' });
  expect(out.diagnosis).toEqual(result);
  expect(steps).toEqual(['prepared', 'diagnosed']);
});

test('reuses an already prepared photo (Try again after a diagnose failure)', async () => {
  const prepared: PreparedPhoto = {
    uri: `${CACHE}/scans/s1.jpg`,
    width: 800,
    height: 600,
    sizeBytes: 9,
  };
  fakeFs.put(prepared.uri, { size: 9, width: 800, height: 600 });
  const diagnoser = diagnoserReturning(result);
  const out = await runDiagnosis(
    { scanId: 's1', sourceUri: null, prepared },
    { ...fast, diagnoser },
  );
  expect(mockManipulator.manipulate).not.toHaveBeenCalled();
  expect(out.photo).toBe(prepared);
});

test('a failed prepare is a "prepare" error', async () => {
  mockManipulator.failNext = new Error('decode failed');
  const error = await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser: diagnoserReturning(result) },
  ).catch((e) => e);
  expect(error).toBeInstanceOf(DiagnosisError);
  expect(error.kind).toBe('prepare');
});

test('nothing to prepare is a "prepare" error', async () => {
  const error = await runDiagnosis(
    { scanId: 's1', sourceUri: null, prepared: null },
    { ...fast, diagnoser: diagnoserReturning(result) },
  ).catch((e) => e);
  expect(error.kind).toBe('prepare');
});

test('a failing diagnoser is a "diagnose" error and keeps the prepared photo for Try again', async () => {
  const diagnoser: Diagnoser = {
    id: 'x',
    diagnose: () => Promise.reject(new Error('model crashed')),
  };
  const error = await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser },
  ).catch((e) => e);
  expect(error.kind).toBe('diagnose');
  expect(error.photo).toMatchObject({ uri: `${CACHE}/scans/s1.jpg` });
});

describe('with fake timers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a diagnoser that never answers times out after 20 seconds (Kindwise needs up to 20)', async () => {
    const diagnoser: Diagnoser = { id: 'x', diagnose: () => new Promise(() => {}) };
    const run = runDiagnosis(
      { scanId: 's1', sourceUri: shot(), prepared: null },
      { diagnoser, minMs: 0 },
    ).catch((e) => e);
    await jest.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void run.then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const error = await run;
    expect(error.kind).toBe('timeout');
  });

  test('a fast result waits for the 1.2 second minimum', async () => {
    let done = false;
    const run = runDiagnosis(
      { scanId: 's1', sourceUri: shot(), prepared: null },
      { diagnoser: diagnoserReturning(result) },
    ).then(() => (done = true));
    await jest.advanceTimersByTimeAsync(1_199);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await run;
    expect(done).toBe(true);
  });

  test('a photo prepared after the timeout is deleted, not left behind', async () => {
    mockManipulator.hang = true;
    const run = runDiagnosis(
      { scanId: 's1', sourceUri: shot(), prepared: null },
      { diagnoser: diagnoserReturning(result), minMs: 0 },
    ).catch((e) => e);
    await jest.advanceTimersByTimeAsync(20_000);
    expect((await run).kind).toBe('timeout');
    mockManipulator.hang = false;
    mockManipulator.release();
    await jest.advanceTimersByTimeAsync(0);
    // The late photo really was produced (decode + resize), then cleaned up.
    expect(mockManipulator.manipulate).toHaveBeenCalledTimes(2);
    expect(fakeFs.under(`${CACHE}/ImageManipulator`)).toEqual([]);
    expect(fakeFs.under(`${CACHE}/scans`)).toEqual([]);
  });
});

test('a cancelled run rejects as "aborted", never resolves with a result', async () => {
  const controller = new AbortController();
  let resolveDiagnosis!: (d: Diagnosis) => void;
  const diagnoser: Diagnoser = {
    id: 'x',
    diagnose: () => new Promise((r) => (resolveDiagnosis = r)),
  };
  const run = runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser, signal: controller.signal },
  ).catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  resolveDiagnosis(result);
  expect((await run).kind).toBe('aborted');
});

test('a photo prepared after cancelling is deleted', async () => {
  const controller = new AbortController();
  mockManipulator.hang = true;
  const run = runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser: diagnoserReturning(result), signal: controller.signal },
  ).catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  mockManipulator.hang = false;
  mockManipulator.release();
  expect((await run).kind).toBe('aborted');
  expect(mockManipulator.manipulate).toHaveBeenCalledTimes(2);
  expect(fakeFs.under(`${CACHE}/scans`)).toEqual([]);
});

test('the "prepared" step hands over the prepared photo before diagnosing', async () => {
  const handed: (PreparedPhoto | undefined)[] = [];
  let diagnosedWith: PreparedPhoto | undefined;
  const diagnoser: Diagnoser = {
    id: 'x',
    diagnose: async (photo) => {
      diagnosedWith = photo;
      expect(handed).toHaveLength(1);
      return result;
    },
  };
  await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { ...fast, diagnoser, onStep: (step, photo) => step === 'prepared' && handed.push(photo) },
  );
  expect(handed[0]).toMatchObject({ uri: `${CACHE}/scans/s1.jpg` });
  expect(diagnosedWith).toBe(handed[0]);
});

test('a run that already timed out reports no further steps', async () => {
  jest.useFakeTimers();
  let finish!: (d: Diagnosis) => void;
  const steps: string[] = [];
  const diagnoser: Diagnoser = { id: 'x', diagnose: () => new Promise((r) => (finish = r)) };
  const run = runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { diagnoser, minMs: 0, onStep: (s) => steps.push(s) },
  ).catch((e) => e);
  await jest.advanceTimersByTimeAsync(20_000);
  expect((await run).kind).toBe('timeout');
  finish(result);
  await jest.advanceTimersByTimeAsync(0);
  expect(steps).toEqual(['prepared']);
  jest.useRealTimers();
});

// kindwise-diagnosis
test('the time limit is 20 seconds', () => {
  expect(DIAGNOSIS_TIMEOUT_MS).toBe(20_000);
});

test.each(['pending', 'not_plant', 'busy', 'server', 'offline'] as const)(
  'a Kindwise "%s" answer is that error kind, with the photo kept',
  async (kind) => {
    const diagnoser: Diagnoser = { id: 'kindwise-v1', diagnose: () => Promise.reject(new DiagnoseFailure(kind)) };
    const error = await runDiagnosis({ scanId: 's1', sourceUri: shot(), prepared: null }, { diagnoser, ...fast }).catch((e) => e);
    expect(error).toBeInstanceOf(DiagnosisError);
    expect(error.kind).toBe(kind);
    expect(error.photo?.uri).toMatch(/scans\/s1\.jpg$/);
  },
);

test('a quota answer carries the reset time', async () => {
  const diagnoser: Diagnoser = {
    id: 'kindwise-v1',
    diagnose: () => Promise.reject(new DiagnoseFailure('quota', '2026-12-01T00:00:00Z')),
  };
  const error = await runDiagnosis({ scanId: 's1', sourceUri: shot(), prepared: null }, { diagnoser, ...fast }).catch((e) => e);
  expect(error).toMatchObject({ kind: 'quota', resetsAt: '2026-12-01T00:00:00Z' });
});

test('beforeDiagnose runs with the prepared photo before the diagnoser is asked', async () => {
  const order: string[] = [];
  const diagnoser: Diagnoser = {
    id: 'kindwise-v1',
    diagnose: async () => {
      order.push('diagnose');
      return result;
    },
  };
  await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    {
      diagnoser,
      ...fast,
      beforeDiagnose: async (photo) => {
        order.push(`before:${photo.uri.split('/').pop()}`);
      },
    },
  );
  expect(order).toEqual(['before:s1.jpg', 'diagnose']);
});

test('a failing beforeDiagnose stops the run before anything is sent ("store" error, photo kept)', async () => {
  const diagnoser = diagnoserReturning(result);
  const error = await runDiagnosis(
    { scanId: 's1', sourceUri: shot(), prepared: null },
    { diagnoser, ...fast, beforeDiagnose: () => Promise.reject(new Error('disk full')) },
  ).catch((e) => e);
  expect(error.kind).toBe('store');
  expect(error.photo).not.toBeNull();
  expect(diagnoser.diagnose).not.toHaveBeenCalled();
});
