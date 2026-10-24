import { createTestDb, type TestDb } from '@/testing/sqljs';

import { migrate } from '../migrations';
import { insertPlant, listPlants, listRooms } from '../plantsRepo';
import { persistScan, type ScanInput } from '../scansRepo';

const at = (minute: number) => `2026-10-24T10:${String(minute).padStart(2, '0')}:00.000Z`;

const scanFor = (plantId: string, id: string, overrides: Partial<ScanInput> = {}): ScanInput => ({
  id,
  plantId,
  photoPath: `photos/${id}.jpg`,
  diagnoserId: 'fake-v1',
  modelResult: [{ conditionId: 'overwatering', confidence: 0.8 }],
  answers: {},
  finalResult: [{ conditionId: 'overwatering', confidence: 0.8 }],
  ...overrides,
});

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
});

test('a saved plant is listed with its scan photo and diagnosis', async () => {
  await insertPlant(db, { id: 'p1', name: 'Fern', room: 'Kitchen' }, at(0));
  await persistScan(db, scanFor('p1', 's1'), at(0));
  expect(await listPlants(db)).toEqual([
    {
      id: 'p1',
      name: 'Fern',
      room: 'Kitchen',
      createdAt: at(0),
      photoPath: 'photos/s1.jpg',
      conditionId: 'overwatering',
      diagnoserId: 'fake-v1',
    },
  ]);
});

test('newest plant first, ties broken by id', async () => {
  await insertPlant(db, { id: 'a', name: 'Old', room: null }, at(1));
  await insertPlant(db, { id: 'b', name: 'Tie B', room: null }, at(5));
  await insertPlant(db, { id: 'c', name: 'Tie C', room: null }, at(5));
  expect((await listPlants(db)).map((p) => p.id)).toEqual(['c', 'b', 'a']);
});

test('shows the latest scan of a plant', async () => {
  await insertPlant(db, { id: 'p1', name: 'Fern', room: null }, at(0));
  await persistScan(db, scanFor('p1', 's1'), at(1));
  await persistScan(db, scanFor('p1', 's2', { finalResult: [{ conditionId: 'sunburn', confidence: 0.7 }] }), at(2));
  const [plant] = await listPlants(db);
  expect(plant).toMatchObject({ photoPath: 'photos/s2.jpg', conditionId: 'sunburn' });
});

test('soft-deleted plants and scans are left out', async () => {
  await insertPlant(db, { id: 'p1', name: 'Gone', room: 'Hall' }, at(0));
  await insertPlant(db, { id: 'p2', name: 'Here', room: null }, at(1));
  await persistScan(db, scanFor('p2', 's1'), at(1));
  await persistScan(db, scanFor('p2', 's2', { finalResult: [{ conditionId: 'sunburn', confidence: 0.7 }] }), at(2));
  await db.runAsync('UPDATE plants SET deleted_at = ? WHERE id = ?', [at(3), 'p1']);
  await db.runAsync('UPDATE scans SET deleted_at = ? WHERE id = ?', [at(3), 's2']);
  const plants = await listPlants(db);
  expect(plants.map((p) => p.id)).toEqual(['p2']);
  expect(plants[0].conditionId).toBe('overwatering');
  expect(await listRooms(db)).toEqual([]);
});

test('a plant with a corrupt stored result still shows, without a diagnosis', async () => {
  await insertPlant(db, { id: 'p1', name: 'Fern', room: null }, at(0));
  await persistScan(db, scanFor('p1', 's1'), at(0));
  await db.runAsync('UPDATE scans SET final_result = ? WHERE id = ?', ['{broken', 's1']);
  const [plant] = await listPlants(db);
  expect(plant).toMatchObject({ id: 'p1', conditionId: null, photoPath: 'photos/s1.jpg' });
});

test('a plant without a scan has no photo or diagnosis', async () => {
  await insertPlant(db, { id: 'p1', name: 'Fern', room: null }, at(0));
  expect((await listPlants(db))[0]).toMatchObject({ photoPath: null, conditionId: null, diagnoserId: null });
});

test('rooms are the distinct rooms in use, sorted', async () => {
  await insertPlant(db, { id: 'a', name: 'A', room: 'Kitchen' }, at(0));
  await insertPlant(db, { id: 'b', name: 'B', room: 'Balcony' }, at(1));
  await insertPlant(db, { id: 'c', name: 'C', room: 'Kitchen' }, at(2));
  await insertPlant(db, { id: 'd', name: 'D', room: null }, at(3));
  expect(await listRooms(db)).toEqual(['Balcony', 'Kitchen']);
});

test('names are stored exactly as given, injection strings included', async () => {
  const nasty = "Robert'); DROP TABLE plants;--";
  await insertPlant(db, { id: 'p1', name: nasty, room: '🌿 ベランダ' }, at(0));
  expect((await listPlants(db))[0]).toMatchObject({ name: nasty, room: '🌿 ベランダ' });
});
