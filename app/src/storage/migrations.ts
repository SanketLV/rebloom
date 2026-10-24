import type { Db } from './db';

// Project DB rules: snake_case, TEXT UUID ids, TEXT not VARCHAR, no foreign
// keys, soft delete via deleted_at, ISO 8601 UTC timestamps as TEXT.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE plants (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    room TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE scans (
    id TEXT PRIMARY KEY NOT NULL,
    plant_id TEXT,
    photo_path TEXT NOT NULL,
    diagnoser_id TEXT NOT NULL,
    model_result TEXT NOT NULL,
    answers TEXT NOT NULL,
    final_result TEXT NOT NULL,
    low_confidence INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_scans_plant_id ON scans(plant_id) WHERE deleted_at IS NULL;

  CREATE TABLE scan_feedback (
    id TEXT PRIMARY KEY NOT NULL,
    scan_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    user_guess TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_scan_feedback_scan_id ON scan_feedback(scan_id) WHERE deleted_at IS NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

// Brings the database up to SCHEMA_VERSION. Each step runs in a transaction,
// so a failed step leaves the previous version intact.
export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  for (let version = row?.user_version ?? 0; version < SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      // PRAGMA can't take a bound parameter; the value is our own integer.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
