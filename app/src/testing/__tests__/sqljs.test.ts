import { createTestDb } from '../sqljs';

test('runs queries with bound params', async () => {
  const db = await createTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY NOT NULL, n INTEGER)');
  const run = await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
  expect(run.changes).toBe(1);
  await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);
  expect(await db.getFirstAsync('SELECT n FROM t WHERE id = ?', ['b'])).toEqual({ n: 2 });
  expect(await db.getAllAsync('SELECT id FROM t ORDER BY id', [])).toEqual([
    { id: 'a' },
    { id: 'b' },
  ]);
  expect(await db.getFirstAsync('SELECT n FROM t WHERE id = ?', ['missing'])).toBeNull();
});

test('a throwing transaction rolls back and rethrows', async () => {
  const db = await createTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY NOT NULL)');
  await expect(
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (id) VALUES (?)', ['a']);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await db.getAllAsync('SELECT id FROM t', [])).toEqual([]);
});

test('a successful transaction commits', async () => {
  const db = await createTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY NOT NULL)');
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO t (id) VALUES (?)', ['a']);
  });
  expect(await db.getAllAsync('SELECT id FROM t', [])).toEqual([{ id: 'a' }]);
});

test('PRAGMA user_version reads back as a row', async () => {
  const db = await createTestDb();
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 0 });
});
