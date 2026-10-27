import type { Diagnosis } from '@/diagnosis/types';
import { migrate } from '@/storage/migrations';
import { listPlants } from '@/storage/plantsRepo';
import { persistScan } from '@/storage/scansRepo';
import { CACHE, DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { createTestDb, type TestDb } from '@/testing/sqljs';

import { saveAsPlant, saveFeedback } from '../saveScan';
import type { ScanState } from '../session';

const NOW = '2026-10-24T10:00:00.000Z';
const diagnosis: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [
    { conditionId: 'underwatering', confidence: 0.45 },
    { conditionId: 'overwatering', confidence: 0.35 },
    { conditionId: 'low_light', confidence: 0.1 },
  ],
};
const result: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [
    { conditionId: 'overwatering', confidence: 0.55 },
    { conditionId: 'underwatering', confidence: 0.25 },
    { conditionId: 'low_light', confidence: 0.1 },
  ],
};

const tempPhoto = `${CACHE}/scans/scan-1.jpg`;
const storedPhoto = `${DOCUMENT}/photos/scan-1.jpg`;

const state = (overrides: Partial<ScanState> = {}): ScanState => ({
  scanId: 'scan-1',
  sourceUri: null,
  photo: { uri: tempPhoto, width: 800, height: 600, sizeBytes: 90_000 },
  diagnosis,
  answers: { watering: 'water_2_3_days' },
  result,
  persisted: false,
  photoStored: false,
  ...overrides,
});

const count = async (db: TestDb, table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []))!.n;

// Makes the next INSERT into `table` fail, as a full disk would.
async function failNextInsertInto(db: TestDb, table: string) {
  await db.execAsync(
    `CREATE TEMP TRIGGER fail_once BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'disk full'); END;`,
  );
}

let db: TestDb;
let ids: number;
const options = () => ({ now: () => NOW, newId: () => `id-${++ids}` });

beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
  fakeFs.put(tempPhoto, { size: 90_000, width: 800, height: 600 });
  ids = 0;
});

test('saving a plant stores the photo, the plant and its scan', async () => {
  const out = await saveAsPlant(db, state(), { name: 'Fern', room: 'Kitchen' }, options());
  expect(out).toEqual({ plantId: 'id-1', photoStored: true, persisted: true });
  expect(fakeFs.has(storedPhoto)).toBe(true);
  expect(await listPlants(db)).toEqual([
    expect.objectContaining({
      id: 'id-1',
      name: 'Fern',
      room: 'Kitchen',
      photoPath: 'photos/scan-1.jpg',
    }),
  ]);
});

test('the name and room are trimmed, and a blank room is stored as none', async () => {
  await saveAsPlant(db, state(), { name: '  Fern  ', room: '   ' }, options());
  expect((await listPlants(db))[0]).toMatchObject({ name: 'Fern', room: null });
});

test('an invalid name is refused before anything is written', async () => {
  await expect(saveAsPlant(db, state(), { name: '   ', room: null }, options())).rejects.toThrow(
    /name/i,
  );
  expect(fakeFs.has(storedPhoto)).toBe(false);
  expect(await count(db, 'plants')).toBe(0);
});

test('a scan without a photo or result cannot be saved', async () => {
  await expect(
    saveAsPlant(db, state({ photo: null }), { name: 'Fern', room: null }, options()),
  ).rejects.toThrow();
  await expect(
    saveAsPlant(db, state({ result: null }), { name: 'Fern', room: null }, options()),
  ).rejects.toThrow();
});

test('a failed insert deletes the photo copy it made and leaves no rows', async () => {
  await failNextInsertInto(db, 'scans');
  await expect(saveAsPlant(db, state(), { name: 'Fern', room: null }, options())).rejects.toThrow(
    'disk full',
  );
  expect(fakeFs.has(storedPhoto)).toBe(false);
  expect(await count(db, 'plants')).toBe(0);
  expect(await count(db, 'scans')).toBe(0);
});

test('feedback stores the photo, the scan and the answer', async () => {
  const out = await saveFeedback(db, state(), { verdict: 'no', userGuess: 'root_rot' }, options());
  expect(out).toEqual({ photoStored: true, persisted: true });
  expect(fakeFs.has(storedPhoto)).toBe(true);
  expect(await count(db, 'scans')).toBe(1);
  expect(await db.getAllAsync('SELECT verdict, user_guess FROM scan_feedback', [])).toEqual([
    { verdict: 'no', user_guess: 'root_rot' },
  ]);
});

test('feedback first, then a failing save: the photo the feedback scan uses survives', async () => {
  await saveFeedback(db, state(), { verdict: 'yes', userGuess: null }, options());
  await failNextInsertInto(db, 'plants');
  await expect(
    saveAsPlant(
      db,
      state({ persisted: true, photoStored: true }),
      { name: 'Fern', room: null },
      options(),
    ),
  ).rejects.toThrow('disk full');
  expect(fakeFs.has(storedPhoto)).toBe(true);
  expect(await db.getAllAsync('SELECT photo_path, plant_id FROM scans', [])).toEqual([
    { photo_path: 'photos/scan-1.jpg', plant_id: null },
  ]);
});

test('feedback, then changed answers, then save: one scan with the new answers and the plant', async () => {
  await saveFeedback(db, state(), { verdict: 'not_sure', userGuess: null }, options());
  const changed = state({
    persisted: true,
    photoStored: true,
    answers: { watering: 'water_2_weeks' },
    result: {
      diagnoserId: 'fake-v1',
      candidates: [{ conditionId: 'underwatering', confidence: 0.6 }],
    },
  });
  const { plantId } = await saveAsPlant(db, changed, { name: 'Fern', room: null }, options());
  const rows = await db.getAllAsync<{ answers: string; plant_id: string }>(
    'SELECT answers, plant_id FROM scans',
    [],
  );
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].answers)).toEqual({ watering: 'water_2_weeks' });
  expect(rows[0].plant_id).toBe(plantId);
});

test('a failed feedback save deletes the copy it made', async () => {
  await failNextInsertInto(db, 'scan_feedback');
  await expect(
    saveFeedback(db, state(), { verdict: 'yes', userGuess: null }, options()),
  ).rejects.toThrow('disk full');
  expect(fakeFs.has(storedPhoto)).toBe(false);
  expect(await count(db, 'scans')).toBe(0);
});

test('a failed photo copy writes nothing to the database', async () => {
  fakeFs.failNext('copy');
  await expect(saveAsPlant(db, state(), { name: 'Fern', room: null }, options())).rejects.toThrow(
    'copy failed',
  );
  expect(await count(db, 'plants')).toBe(0);
});

test('overlapping saves serialize so feedback and plant save do not collide and keep the photo', async () => {
  const p1 = saveFeedback(db, state(), { verdict: 'yes', userGuess: null }, options());
  const p2 = saveAsPlant(db, state(), { name: 'Fern', room: null }, options());
  await Promise.all([p1, p2]);
  expect(fakeFs.has(storedPhoto)).toBe(true);
  expect(await count(db, 'plants')).toBe(1);
  expect(await count(db, 'scans')).toBe(1);
});

test('error cleanup never deletes a photo that a stored scan row still references', async () => {
  await persistScan(
    db,
    {
      id: 'existing-scan',
      plantId: 'p1',
      photoPath: 'photos/scan-1.jpg',
      diagnoserId: 'fake-v1',
      modelResult: [],
      answers: {},
      finalResult: [],
    },
    NOW,
  );
  await failNextInsertInto(db, 'scans');
  await expect(
    saveFeedback(db, state(), { verdict: 'yes', userGuess: null }, options()),
  ).rejects.toThrow('disk full');
  expect(fakeFs.has(storedPhoto)).toBe(true);
});
