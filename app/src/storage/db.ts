import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;

// The slice of expo-sqlite the app uses. Repositories depend on this, not on
// SQLiteDatabase, so tests can run them on a real SQLite engine in Node.
// Values are always bound, never built into the SQL string.
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    params: SqlValue[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// Compile-time check that the real database still fits this shape.
export type RealDbFits = SQLiteDatabase extends Db ? true : never;
const realDbFits: RealDbFits = true;
void realDbFits;
