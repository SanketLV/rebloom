import { createTestDb, type TestDb } from '@/testing/sqljs';

import { migrate } from '../migrations';
import {
  discardScan,
  getScan,
  insertPendingScan,
  markReady,
  parseCandidates,
  persistScan,
  replaceFeedback,
  type ScanInput,
} from '../scansRepo';
import type { Diagnosis } from '@/diagnosis/types';

const T1 = '2026-10-24T10:00:00.000Z';
const T2 = '2026-10-24T10:05:00.000Z';
const T3 = '2026-10-24T10:09:00.000Z';

const scan = (overrides: Partial<ScanInput> = {}): ScanInput => ({
  id: 'scan-1',
  plantId: null,
  photoPath: 'photos/scan-1.jpg',
  diagnoserId: 'fake-v1',
  modelResult: [
    { conditionId: 'underwatering', confidence: 0.52 },
    { conditionId: 'overwatering', confidence: 0.28 },
    { conditionId: 'low_light', confidence: 0.1 },
  ],
  answers: { watering: 'water_2_3_days', light: 'not_sure', recent_change: 'change_none' },
  finalResult: [
    { conditionId: 'overwatering', confidence: 0.55 },
    { conditionId: 'underwatering', confidence: 0.25 },
    { conditionId: 'low_light', confidence: 0.1 },
  ],
  ...overrides,
});

type Row = Record<string, string | number | null>;
const rows = (db: TestDb, table: string) => db.getAllAsync<Row>(`SELECT * FROM ${table}`, []);

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
});

test('inserts a scan with snake_case JSON and the low-confidence flag', async () => {
  await persistScan(db, scan(), T1);
  const [row] = await rows(db, 'scans');
  expect(row).toMatchObject({
    id: 'scan-1',
    plant_id: null,
    photo_path: 'photos/scan-1.jpg',
    diagnoser_id: 'fake-v1',
    low_confidence: 0,
    created_at: T1,
    updated_at: T1,
    deleted_at: null,
  });
  expect(JSON.parse(row.final_result as string)[0]).toEqual({
    condition_id: 'overwatering',
    confidence: 0.55,
  });
  expect(JSON.parse(row.model_result as string)[0]).toEqual({
    condition_id: 'underwatering',
    confidence: 0.52,
  });
  expect(JSON.parse(row.answers as string)).toEqual({
    watering: 'water_2_3_days',
    light: 'not_sure',
    recent_change: 'change_none',
  });
});

test('flags a low-confidence final result', async () => {
  await persistScan(db, scan({ finalResult: [{ conditionId: 'healthy', confidence: 0.4 }] }), T1);
  expect((await rows(db, 'scans'))[0].low_confidence).toBe(1);
});

test('flags a scan the model was unsure of, even if the answers lifted it over 50%', async () => {
  await persistScan(
    db,
    scan({
      modelResult: [{ conditionId: 'overwatering', confidence: 0.41 }],
      finalResult: [{ conditionId: 'overwatering', confidence: 0.58 }],
    }),
    T1,
  );
  expect((await rows(db, 'scans'))[0].low_confidence).toBe(1);
});

test('saving again with a plant id links the plant instead of duplicating the scan', async () => {
  await persistScan(db, scan(), T1);
  await persistScan(db, scan({ plantId: 'plant-1' }), T2);
  const all = await rows(db, 'scans');
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ plant_id: 'plant-1', created_at: T1, updated_at: T2 });
});

test('a later save without a plant id never removes the link', async () => {
  await persistScan(db, scan({ plantId: 'plant-1' }), T1);
  await persistScan(db, scan({ plantId: null }), T2);
  expect((await rows(db, 'scans'))[0].plant_id).toBe('plant-1');
});

test('changed answers update the stored scan', async () => {
  await persistScan(db, scan(), T1);
  await persistScan(
    db,
    scan({
      answers: { watering: 'water_2_weeks' },
      finalResult: [{ conditionId: 'underwatering', confidence: 0.45 }],
    }),
    T2,
  );
  const [row] = await rows(db, 'scans');
  expect(JSON.parse(row.answers as string)).toEqual({ watering: 'water_2_weeks' });
  expect(JSON.parse(row.final_result as string)).toEqual([
    { condition_id: 'underwatering', confidence: 0.45 },
  ]);
  expect(row.low_confidence).toBe(1);
});

test('feedback is stored with its verdict and guess', async () => {
  await persistScan(db, scan(), T1);
  await replaceFeedback(
    db,
    { id: 'fb-1', scanId: 'scan-1', verdict: 'no', userGuess: 'root_rot' },
    T2,
  );
  expect(await rows(db, 'scan_feedback')).toEqual([
    {
      id: 'fb-1',
      scan_id: 'scan-1',
      verdict: 'no',
      user_guess: 'root_rot',
      created_at: T2,
      updated_at: T2,
      deleted_at: null,
    },
  ]);
});

test('answering again replaces the earlier feedback: one live row, the old one soft-deleted', async () => {
  await persistScan(db, scan(), T1);
  await replaceFeedback(db, { id: 'fb-1', scanId: 'scan-1', verdict: 'yes', userGuess: null }, T2);
  await replaceFeedback(
    db,
    { id: 'fb-2', scanId: 'scan-1', verdict: 'no', userGuess: 'something_else' },
    T3,
  );
  const live = await db.getAllAsync<Row>(
    'SELECT id FROM scan_feedback WHERE deleted_at IS NULL',
    [],
  );
  expect(live).toEqual([{ id: 'fb-2' }]);
  const old = await db.getFirstAsync<Row>(
    'SELECT deleted_at, updated_at FROM scan_feedback WHERE id = ?',
    ['fb-1'],
  );
  expect(old).toEqual({ deleted_at: T3, updated_at: T3 });
});

test('values are bound, never spliced into SQL', async () => {
  const nasty = "x'); DROP TABLE scans;--";
  await persistScan(db, scan({ diagnoserId: nasty, photoPath: nasty }), T1);
  const [row] = await rows(db, 'scans');
  expect(row.diagnoser_id).toBe(nasty);
  expect(row.photo_path).toBe(nasty);
});

describe('parseCandidates', () => {
  test('reads stored snake_case JSON back', () => {
    expect(parseCandidates('[{"condition_id":"sunburn","confidence":0.7}]')).toEqual([
      { conditionId: 'sunburn', confidence: 0.7 },
    ]);
  });

  test('reads a Kindwise disease, mapped or not, back', () => {
    const raw = JSON.stringify([
      { condition_id: 'overwatering', confidence: 0.6, disease: { id: 'd1', name: 'water excess', common_names: ['wet'], description: 'Wet.' } },
      { condition_id: null, confidence: 0.2, disease: { id: 'd2', name: 'fungi', common_names: [], description: null } },
    ]);
    expect(parseCandidates(raw)).toEqual([
      { conditionId: 'overwatering', confidence: 0.6, disease: { id: 'd1', name: 'water excess', commonNames: ['wet'], description: 'Wet.' } },
      { conditionId: null, confidence: 0.2, disease: { id: 'd2', name: 'fungi', commonNames: [], description: null } },
    ]);
  });

  test.each([
    '[{"condition_id":null,"confidence":0.2}]',
    '[{"condition_id":null,"confidence":0.2,"disease":{"id":"d"}}]',
    'not json',
    '{}',
    'null',
    '[{"condition_id":"made_up","confidence":0.7}]',
    '[{"condition_id":"sunburn"}]',
  ])('returns an empty list for a corrupt value %j instead of throwing', (raw) => {
    expect(parseCandidates(raw)).toEqual([]);
  });
});

// ---- Kindwise scans: pending → ready → done (plan D5) ----

const KW: Diagnosis = {
  diagnoserId: 'kindwise-v1',
  candidates: [
    { conditionId: 'overwatering', confidence: 0.64, disease: { id: 'd1', name: 'water excess', commonNames: [], description: 'Wet.' } },
    { conditionId: null, confidence: 0.21, disease: { id: 'd2', name: 'fungi', commonNames: [], description: null } },
  ],
  species: [{ name: 'Monstera deliciosa', commonNames: ['Swiss cheese plant'], probability: 0.91 }],
  question: { text: 'Wet?', yes: { id: 'd1', name: 'water excess' }, no: { id: 'd2', name: 'fungi' } },
  treatment: { d1: { prevention: ['Dry out.'], biological: [], chemical: [] } },
  scansLeft: 2,
};

describe('pending and ready scans', () => {
  const pending = () => insertPendingScan(db, { id: 'scan-1', photoPath: 'photos/scan-1.jpg', diagnoserId: 'kindwise-v1' }, T1);

  test('a pending scan has the photo and no result, flagged unsure', async () => {
    await pending();
    const [row] = await rows(db, 'scans');
    expect(row).toMatchObject({ status: 'pending', photo_path: 'photos/scan-1.jpg', low_confidence: 1, model_result: '[]', plant_id: null });
    expect(await getScan(db, 'scan-1')).toMatchObject({ status: 'pending', diagnosis: null });
  });

  test('inserting the same pending scan twice keeps one row', async () => {
    await pending();
    await pending();
    expect(await rows(db, 'scans')).toHaveLength(1);
  });

  test('ready stores the whole diagnosis, read back the same', async () => {
    await pending();
    await markReady(db, 'scan-1', KW, T2);
    const [row] = await rows(db, 'scans');
    expect(row).toMatchObject({ status: 'ready', low_confidence: 0, updated_at: T2 });
    expect(JSON.parse(row.species as string)).toEqual([{ name: 'Monstera deliciosa', common_names: ['Swiss cheese plant'], probability: 0.91 }]);
    expect(JSON.parse(row.kindwise_question as string)).toEqual(KW.question);
    expect(JSON.parse(row.treatment as string)).toEqual(KW.treatment);
    const stored = await getScan(db, 'scan-1');
    expect(stored?.diagnosis).toEqual({ ...KW, scansLeft: null });
  });

  test('ready never touches a scan that was already saved', async () => {
    await pending();
    await markReady(db, 'scan-1', KW, T2);
    await persistScan(db, { ...scan({ diagnoserId: 'kindwise-v1' }), modelResult: KW.candidates, finalResult: KW.candidates, questionAnswer: 'yes' }, T3);
    await markReady(db, 'scan-1', { ...KW, candidates: [] }, T3);
    const [row] = await rows(db, 'scans');
    expect(row.status).toBe('done');
    expect(JSON.parse(row.model_result as string)).toHaveLength(2);
  });

  test('saving keeps the Kindwise columns, stores the question answer and marks it done', async () => {
    await pending();
    await markReady(db, 'scan-1', KW, T2);
    await persistScan(db, { ...scan({ plantId: 'p1', diagnoserId: 'kindwise-v1' }), modelResult: KW.candidates, finalResult: KW.candidates, questionAnswer: 'no' }, T3);
    const [row] = await rows(db, 'scans');
    expect(row).toMatchObject({ status: 'done', plant_id: 'p1', question_answer: 'no' });
    expect(row.species).not.toBeNull();
  });

  test('a scan saved straight away (fake diagnoser) is done', async () => {
    await persistScan(db, scan(), T1);
    expect((await rows(db, 'scans'))[0].status).toBe('done');
  });

  test('discard soft-deletes an unsaved scan and returns its photo; never a saved one', async () => {
    await pending();
    expect(await discardScan(db, 'scan-1', T2)).toBe('photos/scan-1.jpg');
    expect((await rows(db, 'scans'))[0].deleted_at).toBe(T2);
    expect(await getScan(db, 'scan-1')).toBeNull();
    expect(await discardScan(db, 'scan-1', T3)).toBeNull();

    await persistScan(db, scan({ id: 'saved', photoPath: 'photos/saved.jpg' }), T1);
    expect(await discardScan(db, 'saved', T2)).toBeNull();
    expect((await rows(db, 'scans')).find((r) => r.id === 'saved')?.deleted_at).toBeNull();
  });

  test('corrupt Kindwise columns read back as safe defaults', async () => {
    await pending();
    await markReady(db, 'scan-1', KW, T2);
    await db.runAsync("UPDATE scans SET species = 'x', treatment = '[1]', kindwise_question = '{\"text\":1}'", []);
    const stored = await getScan(db, 'scan-1');
    expect(stored?.diagnosis).toMatchObject({ species: [], treatment: {}, question: null });
  });
});
