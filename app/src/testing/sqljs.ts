// Test-only: a real SQLite engine (sql.js, WebAssembly) behind the app's Db interface,
// so repositories and migrations run their actual SQL in jest.
// One connection only, so it can't show "database is locked"; check that on a device.
import { readFileSync } from 'node:fs';
import type { Database, SqlJsStatic } from 'sql.js';

import type { Db, SqlValue } from '@/storage/db';

type InitSqlJs = (config: {
  instantiateWasm: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance) => void,
  ) => object;
}) => Promise<SqlJsStatic>;
// Required by file path so the "browser" export condition can't pick the fetch-based build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs: InitSqlJs = require('sql.js/dist/sql-wasm.js');

let engine: Promise<SqlJsStatic> | undefined;

// The WebAssembly is compiled synchronously, so starting the engine only takes microtasks.
// renderRouter switches jest to fake timers, and findBy* then waits about 20 timer ticks,
// not 1000 real ms. Async WebAssembly compilation runs on the real clock, and under a busy
// full run it outlasted those ticks: the first app test in each file failed at random.
function startEngine(): Promise<SqlJsStatic> {
  const bytes = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
  return initSqlJs({
    instantiateWasm(imports, done) {
      done(new WebAssembly.Instance(new WebAssembly.Module(bytes), imports));
      return {};
    },
  });
}

export type TestDb = Db & { close(): void };

export async function createTestDb(): Promise<TestDb> {
  engine ??= startEngine();
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
