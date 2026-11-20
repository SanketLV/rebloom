import type { Candidate } from '@/diagnosis/types';

import type { Db } from './db';
import { parseCandidates, type ScanStatus } from './scansRepo';

export type PlantInput = { id: string; name: string; room: string | null };

// One row of the My Plants list: the plant plus its latest scan.
export type PlantSummary = {
  id: string;
  name: string;
  room: string | null;
  createdAt: string;
  photoPath: string | null;
  // The latest scan's top result.
  candidate: Candidate | null;
  diagnoserId: string | null;
};

// Call inside a transaction together with the plant's scan.
export async function insertPlant(db: Db, plant: PlantInput, now: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO plants (id, name, room, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [plant.id, plant.name, plant.room, now, now],
  );
}

type Row = {
  id: string;
  name: string;
  room: string | null;
  created_at: string;
  photo_path: string | null;
  final_result: string | null;
  diagnoser_id: string | null;
};

export async function listPlants(db: Db): Promise<PlantSummary[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT p.id, p.name, p.room, p.created_at, s.photo_path, s.final_result, s.diagnoser_id
     FROM plants p
     LEFT JOIN scans s ON s.id = (
       SELECT id FROM scans
       WHERE plant_id = p.id AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     )
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at DESC, p.id DESC`,
    [],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    room: row.room,
    createdAt: row.created_at,
    photoPath: row.photo_path,
    candidate: row.final_result ? (parseCandidates(row.final_result)[0] ?? null) : null,
    diagnoserId: row.diagnoser_id,
  }));
}

// Rooms already used, for the Save sheet's chips.
export async function listRooms(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ room: string }>(
    'SELECT DISTINCT room FROM plants WHERE deleted_at IS NULL AND room IS NOT NULL ORDER BY room',
    [],
  );
  return rows.map((r) => r.room);
}

export type UnfinishedScan = { id: string; photoPath: string; status: Exclude<ScanStatus, 'done'>; createdAt: string };

// Scans sent but not saved as a plant: still waiting for a result, or with a result to look at.
export async function listUnfinishedScans(db: Db): Promise<UnfinishedScan[]> {
  const rows = await db.getAllAsync<{ id: string; photo_path: string; status: 'pending' | 'ready'; created_at: string }>(
    `SELECT id, photo_path, status, created_at FROM scans
     WHERE deleted_at IS NULL AND plant_id IS NULL AND status IN ('pending', 'ready')
     ORDER BY created_at DESC, id DESC`,
    [],
  );
  return rows.map((r) => ({ id: r.id, photoPath: r.photo_path, status: r.status, createdAt: r.created_at }));
}
