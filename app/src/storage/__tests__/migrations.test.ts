import { createTestDb } from '@/testing/sqljs';

import { migrate, SCHEMA_VERSION } from '../migrations';

const tables = async (db: Awaited<ReturnType<typeof createTestDb>>) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      [],
    )
  ).map((r) => r.name);

const columns = async (db: Awaited<ReturnType<typeof createTestDb>>, table: string) =>
  db.getAllAsync<{ name: string; type: string; notnull: number; pk: number }>(
    `SELECT name, type, "notnull", pk FROM pragma_table_info(?)`,
    [table],
  );

test('creates plants, scans and scan_feedback and sets user_version', async () => {
  const db = await createTestDb();
  await migrate(db);
  expect(await tables(db)).toEqual(['plants', 'scan_feedback', 'scans']);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({
    user_version: SCHEMA_VERSION,
  });
  expect(SCHEMA_VERSION).toBe(1);
});

test('every table has a TEXT id primary key, timestamps and a soft-delete column', async () => {
  const db = await createTestDb();
  await migrate(db);
  for (const table of ['plants', 'scans', 'scan_feedback']) {
    const cols = await columns(db, table);
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.id).toMatchObject({ type: 'TEXT', pk: 1, notnull: 1 });
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.updated_at).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.deleted_at).toMatchObject({ type: 'TEXT', notnull: 0 });
    // Project rule: TEXT, never VARCHAR.
    for (const col of cols) expect(col.type).not.toMatch(/CHAR/i);
  }
});

test('scans has the columns the spec lists', async () => {
  const db = await createTestDb();
  await migrate(db);
  expect((await columns(db, 'scans')).map((c) => c.name)).toEqual([
    'id',
    'plant_id',
    'photo_path',
    'diagnoser_id',
    'model_result',
    'answers',
    'final_result',
    'low_confidence',
    'created_at',
    'updated_at',
    'deleted_at',
  ]);
});

test('lookups have partial indexes that skip soft-deleted rows', async () => {
  const db = await createTestDb();
  await migrate(db);
  const indexes = await db.getAllAsync<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
    [],
  );
  expect(indexes.map((i) => i.name)).toEqual(['idx_scan_feedback_scan_id', 'idx_scans_plant_id']);
  for (const index of indexes) expect(index.sql).toMatch(/WHERE deleted_at IS NULL/);
});

test('no foreign keys (project rule)', async () => {
  const db = await createTestDb();
  await migrate(db);
  for (const table of ['plants', 'scans', 'scan_feedback']) {
    expect(await db.getAllAsync('SELECT * FROM pragma_foreign_key_list(?)', [table])).toEqual([]);
  }
});

test('running it again changes nothing and keeps data', async () => {
  const db = await createTestDb();
  await migrate(db);
  await db.runAsync(
    'INSERT INTO plants (id, name, room, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['p1', 'Fern', null, '2026-10-24T10:00:00.000Z', '2026-10-24T10:00:00.000Z'],
  );
  await migrate(db);
  expect(await db.getAllAsync('SELECT id FROM plants', [])).toEqual([{ id: 'p1' }]);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
});

test('a scan can have only one live feedback row; soft-deleted ones do not count', async () => {
  const db = await createTestDb();
  await migrate(db);
  const insert = (id: string, deletedAt: string | null) =>
    db.runAsync(
      `INSERT INTO scan_feedback (id, scan_id, verdict, user_guess, created_at, updated_at, deleted_at)
       VALUES (?, 'scan-1', 'wrong', NULL, 't', 't', ?)`,
      [id, deletedAt],
    );
  await insert('f1', 't');
  await insert('f2', 't');
  await insert('f3', null);
  await expect(insert('f4', null)).rejects.toThrow(/UNIQUE/);
});
