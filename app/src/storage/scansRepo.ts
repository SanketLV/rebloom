import { isLowConfidence } from '@/diagnosis/confidence';
import { CONDITION_IDS } from '@/diagnosis/conditions';
import { questionFrom, speciesFrom, treatmentFrom } from '@/diagnosis/kindwiseMap';
import type {
  Answers,
  Candidate,
  ConditionId,
  Diagnosis,
  Disease,
  KindwiseQuestion,
  QuestionAnswer,
  Species,
  Treatment,
} from '@/diagnosis/types';

import type { Db } from './db';

export type ScanInput = {
  id: string;
  plantId: string | null;
  // Relative to the document folder, e.g. photos/<id>.jpg.
  photoPath: string;
  diagnoserId: string;
  modelResult: Candidate[];
  answers: Answers;
  finalResult: Candidate[];
  // Kindwise only.
  species?: Species[];
  treatment?: Record<string, Treatment>;
  kindwiseQuestion?: KindwiseQuestion | null;
  questionAnswer?: QuestionAnswer | null;
};

export type Verdict = 'yes' | 'not_sure' | 'no';
// One of our conditions, a Kindwise disease id (`kindwise:<id>`), or "something else".
export type UserGuess = ConditionId | `kindwise:${string}` | 'something_else';
export type FeedbackInput = {
  id: string;
  scanId: string;
  verdict: Verdict;
  userGuess: UserGuess | null;
};

// pending: sent, no result yet. ready: result here, not saved. done: saved, or feedback given.
export type ScanStatus = 'pending' | 'ready' | 'done';

type StoredDisease = { id: string; name: string; common_names: string[]; description: string | null };
type StoredCandidate = { condition_id: ConditionId | null; confidence: number; disease?: StoredDisease };

const toStoredDisease = (d: Disease): StoredDisease => ({
  id: d.id,
  name: d.name,
  common_names: d.commonNames,
  description: d.description,
});

const toStored = (candidates: Candidate[]): string =>
  JSON.stringify(
    candidates.map((c): StoredCandidate => ({
      condition_id: c.conditionId,
      confidence: c.confidence,
      ...(c.disease ? { disease: toStoredDisease(c.disease) } : {}),
    })),
  );

const speciesJson = (species: Species[] | undefined) =>
  species
    ? JSON.stringify(species.map((s) => ({ name: s.name, common_names: s.commonNames, probability: s.probability })))
    : null;
const jsonOrNull = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));

const isConditionId = (value: unknown): value is ConditionId =>
  typeof value === 'string' && (CONDITION_IDS as readonly string[]).includes(value);

function readDisease(raw: unknown): Disease | null {
  const d = raw as Partial<StoredDisease> | null;
  if (!d || typeof d.id !== 'string' || typeof d.name !== 'string') return null;
  return {
    id: d.id,
    name: d.name,
    commonNames: Array.isArray(d.common_names) ? d.common_names.filter((n) => typeof n === 'string') : [],
    description: typeof d.description === 'string' ? d.description : null,
  };
}

// Reads a stored result back. A corrupt value gives an empty list, so one bad
// row can't break a whole screen.
export function parseCandidates(raw: string): Candidate[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Candidate[] = [];
    for (const c of parsed) {
      if (typeof c?.confidence !== 'number' || !Number.isFinite(c.confidence)) return [];
      const disease = c.disease === undefined ? null : readDisease(c.disease);
      if (c.disease !== undefined && !disease) return [];
      if (isConditionId(c.condition_id)) {
        out.push({ conditionId: c.condition_id, confidence: c.confidence, ...(disease ? { disease } : {}) });
      } else if (c.condition_id === null && disease) {
        out.push({ conditionId: null, confidence: c.confidence, disease });
      } else {
        return [];
      }
    }
    return out;
  } catch {
    return [];
  }
}

const parseJson = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Inserts the scan, or updates it if it was stored before (pending/ready, or feedback first, then
// changed answers, then save). A later call without a plant id keeps the existing link; Kindwise
// columns already stored are kept. Either way the scan is now done.
export async function persistScan(db: Db, scan: ScanInput, now: string): Promise<void> {
  // Unsure if the model was, whatever the answers did to the ranking.
  const low = [scan.modelResult, scan.finalResult].some((candidates) =>
    isLowConfidence({ diagnoserId: scan.diagnoserId, candidates }),
  );
  const lowConfidence = low ? 1 : 0;
  await db.runAsync(
    `INSERT INTO scans (id, plant_id, photo_path, diagnoser_id, model_result, answers, final_result, low_confidence,
                        species, treatment, kindwise_question, question_answer, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       plant_id = COALESCE(excluded.plant_id, scans.plant_id),
       model_result = excluded.model_result,
       answers = excluded.answers,
       final_result = excluded.final_result,
       low_confidence = excluded.low_confidence,
       species = COALESCE(excluded.species, scans.species),
       treatment = COALESCE(excluded.treatment, scans.treatment),
       kindwise_question = COALESCE(excluded.kindwise_question, scans.kindwise_question),
       question_answer = excluded.question_answer,
       status = 'done',
       updated_at = excluded.updated_at`,
    [
      scan.id,
      scan.plantId,
      scan.photoPath,
      scan.diagnoserId,
      toStored(scan.modelResult),
      JSON.stringify(scan.answers),
      toStored(scan.finalResult),
      lowConfidence,
      speciesJson(scan.species),
      jsonOrNull(scan.treatment),
      jsonOrNull(scan.kindwiseQuestion),
      scan.questionAnswer ?? null,
      now,
      now,
    ],
  );
}

// Written before the photo is sent, so a killed app leaves a scan it can finish (plan D5).
// The photo must already be stored at photoPath. A repeat (Try again) keeps the one row.
// `ownerId`: the account the photo is sent with (null when no session could be made, so nothing
// was sent).
export async function insertPendingScan(
  db: Db,
  scan: { id: string; photoPath: string; diagnoserId: string; ownerId?: string | null },
  now: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO scans (id, plant_id, photo_path, diagnoser_id, model_result, answers, final_result, low_confidence, status, owner_id, created_at, updated_at)
     VALUES (?, NULL, ?, ?, '[]', '{}', '[]', 1, 'pending', ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [scan.id, scan.photoPath, scan.diagnoserId, scan.ownerId ?? null, now, now],
  );
}

// The result arrived. Only a pending scan changes: a saved one is never overwritten.
export async function markReady(db: Db, id: string, diagnosis: Diagnosis, now: string): Promise<void> {
  await db.runAsync(
    `UPDATE scans SET model_result = ?, final_result = ?, low_confidence = ?, species = ?, treatment = ?,
       kindwise_question = ?, status = 'ready', updated_at = ?
     WHERE id = ? AND status = 'pending' AND deleted_at IS NULL`,
    [
      toStored(diagnosis.candidates),
      toStored(diagnosis.candidates),
      isLowConfidence(diagnosis) ? 1 : 0,
      speciesJson(diagnosis.species ?? []),
      JSON.stringify(diagnosis.treatment ?? {}),
      jsonOrNull(diagnosis.question ?? null),
      now,
      id,
    ],
  );
}

// Soft-deletes a scan that was never saved (pending or ready). Returns its photo path so the caller
// deletes the file, or null when there was nothing to discard (a saved scan is never touched).
export async function discardScan(db: Db, id: string, now: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ photo_path: string }>(
    "SELECT photo_path FROM scans WHERE id = ? AND status != 'done' AND deleted_at IS NULL",
    [id],
  );
  if (!row) return null;
  await db.runAsync(
    "UPDATE scans SET deleted_at = ?, updated_at = ? WHERE id = ? AND status != 'done' AND deleted_at IS NULL",
    [now, now, id],
  );
  return row.photo_path;
}

export type StoredScan = {
  id: string;
  photoPath: string;
  status: ScanStatus;
  // null while pending.
  diagnosis: Diagnosis | null;
};

type ScanRow = {
  id: string;
  photo_path: string;
  status: string;
  diagnoser_id: string;
  model_result: string;
  species: string | null;
  treatment: string | null;
  kindwise_question: string | null;
};

export async function getScan(db: Db, id: string): Promise<StoredScan | null> {
  const row = await db.getFirstAsync<ScanRow>(
    `SELECT id, photo_path, status, diagnoser_id, model_result, species, treatment, kindwise_question
     FROM scans WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  if (!row) return null;
  const status: ScanStatus = row.status === 'pending' || row.status === 'ready' ? row.status : 'done';
  return {
    id: row.id,
    photoPath: row.photo_path,
    status,
    diagnosis:
      status === 'pending'
        ? null
        : {
            diagnoserId: row.diagnoser_id,
            candidates: parseCandidates(row.model_result),
            species: speciesFrom(parseJson(row.species)),
            treatment: treatmentFrom(parseJson(row.treatment)),
            question: questionFrom(parseJson(row.kindwise_question)),
            scansLeft: null,
          },
  };
}

// A scan has at most one live feedback row: answering again soft-deletes the
// earlier answer. Call inside a transaction.
export async function replaceFeedback(db: Db, feedback: FeedbackInput, now: string): Promise<void> {
  await db.runAsync(
    'UPDATE scan_feedback SET deleted_at = ?, updated_at = ? WHERE scan_id = ? AND deleted_at IS NULL',
    [now, now, feedback.scanId],
  );
  await db.runAsync(
    'INSERT INTO scan_feedback (id, scan_id, verdict, user_guess, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [feedback.id, feedback.scanId, feedback.verdict, feedback.userGuess, now, now],
  );
}
