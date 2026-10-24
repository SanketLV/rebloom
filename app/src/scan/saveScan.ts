import { randomUUID } from 'expo-crypto';

import { deleteStoredPhoto, persistPhoto } from '@/photos/photos';
import { validateName, validateRoom } from '@/plants/validation';
import type { Db } from '@/storage/db';
import { insertPlant } from '@/storage/plantsRepo';
import { persistScan, replaceFeedback, type ScanInput, type UserGuess, type Verdict } from '@/storage/scansRepo';

import type { ScanState } from './session';

type Options = { now?: () => string; newId?: () => string };
type Saved = { photoStored: true; persisted: true };

const isoNow = () => new Date().toISOString();

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
  };
}

// Copies the photo, then runs `write` in one transaction. If the write fails,
// the copy is removed only when this call made it and no stored scan points
// at it yet; a photo an earlier save stored is never deleted.
async function withStoredPhoto(db: Db, state: ScanState, write: (photoPath: string) => Promise<void>): Promise<void> {
  assertSavable(state);
  const { path, created } = await persistPhoto(state.photo.uri, state.scanId);
  try {
    await db.withTransactionAsync(() => write(path));
  } catch (error) {
    if (created && !state.persisted) deleteStoredPhoto(path);
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

  const plantId = newId();
  const at = now();
  await withStoredPhoto(db, state, async (photoPath) => {
    await insertPlant(db, { id: plantId, name: name.value, room: room?.value ?? null }, at);
    await persistScan(db, scanInput(state, photoPath, plantId), at);
  });
  return { plantId, photoStored: true, persisted: true };
}

export async function saveFeedback(
  db: Db,
  state: ScanState,
  feedback: { verdict: Verdict; userGuess: UserGuess | null },
  { now = isoNow, newId = randomUUID }: Options = {},
): Promise<Saved> {
  assertSavable(state);
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
}
