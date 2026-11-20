import { randomUUID } from 'expo-crypto';

import { confirmDiagnose } from '@/backend/diagnose';
import { ensureScanSession } from '@/backend/session';
import type { Diagnosis, PreparedPhoto } from '@/diagnosis/types';
import { deleteStoredPhoto, persistPhoto } from '@/photos/photos';
import { validateName, validateRoom } from '@/plants/validation';
import type { Db } from '@/storage/db';
import { insertPlant } from '@/storage/plantsRepo';
import {
  discardScan,
  insertPendingScan,
  markReady,
  persistScan,
  replaceFeedback,
  type ScanInput,
  type UserGuess,
  type Verdict,
} from '@/storage/scansRepo';

import type { ScanState } from './session';

type Options = { now?: () => string; newId?: () => string };
type Saved = { photoStored: true; persisted: true };

const isoNow = () => new Date().toISOString();

// App-wide promise queue: serializes saves so concurrent attempts (e.g. feedback
// in flight while saving to My Plants, or across different scans) run one at a
// time and cannot collide with "cannot start a transaction within a transaction".
let saveQueue: Promise<unknown> = Promise.resolve();

function serializeSave<T>(op: () => Promise<T>): Promise<T> {
  const next = saveQueue.catch(() => {}).then(op);
  saveQueue = next;
  return next;
}

// Checked before anything is copied or written.
function assertSavable(state: ScanState): asserts state is ScanState & {
  photo: NonNullable<ScanState['photo']>;
  diagnosis: NonNullable<ScanState['diagnosis']>;
  result: NonNullable<ScanState['result']>;
} {
  if (!state.photo) throw new Error('Scan has no photo to save');
  if (!state.diagnosis || !state.result) throw new Error('Scan has no diagnosis to save');
}

function scanInput(state: ScanState, photoPath: string, plantId: string | null): ScanInput {
  assertSavable(state);
  return {
    id: state.scanId,
    plantId,
    photoPath,
    diagnoserId: state.diagnosis.diagnoserId,
    modelResult: state.diagnosis.candidates,
    answers: state.answers,
    finalResult: state.result.candidates,
    species: state.diagnosis.species,
    treatment: state.diagnosis.treatment,
    kindwiseQuestion: state.diagnosis.question,
    questionAnswer: state.questionAnswer ?? null,
  };
}

// Copies the photo, then runs `write` in one transaction. If the write fails,
// the copy is removed only when this call made it and no stored scan points
// at it yet; a photo an earlier save stored is never deleted.
async function withStoredPhoto(
  db: Db,
  state: ScanState,
  write: (photoPath: string) => Promise<void>,
): Promise<void> {
  assertSavable(state);
  const { path, created } = await persistPhoto(state.photo.uri, state.scanId);
  try {
    await db.withTransactionAsync(() => write(path));
  } catch (error) {
    if (created && !state.persisted) {
      try {
        const referenced = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM scans WHERE photo_path = ? LIMIT 1',
          [path],
        );
        if (!referenced) {
          deleteStoredPhoto(path);
        }
      } catch {
        // If the DB check fails, leave the photo for sweepOrphanPhotos to decide.
      }
    }
    throw error;
  }
}

export async function saveAsPlant(
  db: Db,
  state: ScanState,
  input: { name: string; room: string | null },
  { now = isoNow, newId = randomUUID }: Options = {},
): Promise<Saved & { plantId: string }> {
  const name = validateName(input.name);
  if (!name.ok) throw new Error(`Invalid plant name: ${name.reason}`);
  // No room, or a blank one, is stored as none.
  const room = input.room?.trim() ? validateRoom(input.room) : null;
  if (room && !room.ok) throw new Error(`Invalid room: ${room.reason}`);
  assertSavable(state);

  return serializeSave(async () => {
    const plantId = newId();
    const at = now();
    await withStoredPhoto(db, state, async (photoPath) => {
      await insertPlant(db, { id: plantId, name: name.value, room: room?.value ?? null }, at);
      await persistScan(db, scanInput(state, photoPath, plantId), at);
    });
    return { plantId, photoStored: true, persisted: true };
  });
}

export async function saveFeedback(
  db: Db,
  state: ScanState,
  feedback: { verdict: Verdict; userGuess: UserGuess | null },
  { now = isoNow, newId = randomUUID }: Options = {},
): Promise<Saved> {
  assertSavable(state);
  return serializeSave(async () => {
    const at = now();
    await withStoredPhoto(db, state, async (photoPath) => {
      await persistScan(db, scanInput(state, photoPath, null), at);
      await replaceFeedback(
        db,
        {
          id: newId(),
          scanId: state.scanId,
          verdict: feedback.verdict,
          userGuess: feedback.verdict === 'no' ? feedback.userGuess : null,
        },
        at,
      );
    });
    return { photoStored: true, persisted: true };
  });
}

// ---- Kindwise scans (plan D5): the row and photo exist before the photo is sent ----

// Stores the photo and a pending row, so a killed app can still finish the scan. A repeat (Try
// again) keeps the one row. If the row can't be written, the copy this call made is removed.
export async function beginPendingScan(
  db: Db,
  scanId: string,
  diagnoserId: string,
  photo: PreparedPhoto,
  { now = isoNow }: Options = {},
): Promise<void> {
  // The account the photo goes out with: made now, so the row can name it (review #2).
  const session = await ensureScanSession();
  const ownerId = session.ok ? session.value.id : null;
  return serializeSave(async () => {
    const { path, created } = await persistPhoto(photo.uri, scanId);
    try {
      await insertPendingScan(db, { id: scanId, photoPath: path, diagnoserId, ownerId }, now());
    } catch (error) {
      if (created) deleteStoredPhoto(path);
      throw error;
    }
  });
}

// Names the account a pending scan is sent with, when it has none yet (it was stored offline,
// before any session existed). Never replaces an owner. Without `ownerId`, the scan session's.
export async function claimPendingScan(db: Db, scanId: string, ownerId?: string): Promise<void> {
  let owner = ownerId ?? null;
  if (!owner) {
    const session = await ensureScanSession();
    owner = session.ok ? session.value.id : null;
  }
  if (!owner) return;
  await serializeSave(() =>
    db.runAsync('UPDATE scans SET owner_id = ? WHERE id = ? AND owner_id IS NULL', [owner, scanId]),
  );
}

// The result arrived: store it, then let the server delete its copy (plan D1). Not confirmed if
// the write fails, so the result can still be fetched again.
export async function markScanReady(
  db: Db,
  scanId: string,
  diagnosis: Diagnosis,
  { now = isoNow }: Options = {},
): Promise<void> {
  await serializeSave(() => markReady(db, scanId, diagnosis, now()));
  void confirmDiagnose(scanId);
}

// The user removed an unfinished scan from My Plants: gone here, and the server's copy too.
export async function removeUnfinishedScan(db: Db, scanId: string): Promise<void> {
  await discardUnsavedScan(db, scanId);
  void confirmDiagnose(scanId);
}

// Removes a scan nobody saved, and its stored photo. Never touches a saved scan.
export async function discardUnsavedScan(
  db: Db,
  scanId: string,
  { now = isoNow }: Options = {},
): Promise<void> {
  const path = await serializeSave(() => discardScan(db, scanId, now()));
  if (path) deleteStoredPhoto(path);
}
