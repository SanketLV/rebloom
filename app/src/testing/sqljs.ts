// Test-only: a real SQLite engine (sql.js, single-file WebAssembly build) behind the app's
// Db interface, so repositories and migrations run their actual SQL in jest.
// One connection only, so it can't show "database is locked"; check that on a device.
import type { Database, SqlJsStatic } from 'sql.js';

import type { Db, SqlValue } from '@/storage/db';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs: (config?: object) => Promise<SqlJsStatic> = require('sql.js/dist/sql-wasm-inline.js');

let engine: Promise<SqlJsStatic> | undefined;

export type TestDb = Db & { close(): void };

export async function createTestDb(): Promise<TestDb> {
  engine ??= initSqlJs();
  const SQL = await engine;
  const db: Database = new SQL.Database();

  function all<T>(source: string, params: SqlValue[]): T[] {
    const statement = db.prepare(source);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params) {
      all(source, params);
      const changes = db.getRowsModified();
      const [{ id }] = all<{ id: number }>('SELECT last_insert_rowid() AS id', []);
      return { changes, lastInsertRowId: id };
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return all<T>(source, params)[0] ?? null;
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return all<T>(source, params);
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
