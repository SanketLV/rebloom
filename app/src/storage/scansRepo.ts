import { isLowConfidence } from '@/diagnosis/confidence';
import { CONDITION_IDS } from '@/diagnosis/conditions';
import type { Answers, Candidate, ConditionId } from '@/diagnosis/types';

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
};

export type Verdict = 'yes' | 'not_sure' | 'no';
export type UserGuess = ConditionId | 'something_else';
export type FeedbackInput = { id: string; scanId: string; verdict: Verdict; userGuess: UserGuess | null };

type StoredCandidate = { condition_id: ConditionId; confidence: number };

const toStored = (candidates: Candidate[]): string =>
  JSON.stringify(candidates.map((c): StoredCandidate => ({ condition_id: c.conditionId, confidence: c.confidence })));

const isConditionId = (value: unknown): value is ConditionId =>
  typeof value === 'string' && (CONDITION_IDS as readonly string[]).includes(value);

// Reads a stored result back. A corrupt value gives an empty list, so one bad
// row can't break a whole screen.
export function parseCandidates(raw: string): Candidate[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.every(
      (c) => isConditionId(c?.condition_id) && typeof c?.confidence === 'number' && Number.isFinite(c.confidence),
    );
    return valid ? parsed.map((c: StoredCandidate) => ({ conditionId: c.condition_id, confidence: c.confidence })) : [];
  } catch {
    return [];
  }
}

// Inserts the scan, or updates it if it was stored before (feedback first,
// then changed answers, then save). A later call without a plant id keeps the
// existing link.
export async function persistScan(db: Db, scan: ScanInput, now: string): Promise<void> {
  const lowConfidence = isLowConfidence({ diagnoserId: scan.diagnoserId, candidates: scan.finalResult }) ? 1 : 0;
  await db.runAsync(
    `INSERT INTO scans (id, plant_id, photo_path, diagnoser_id, model_result, answers, final_result, low_confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       plant_id = COALESCE(excluded.plant_id, scans.plant_id),
       answers = excluded.answers,
       final_result = excluded.final_result,
       low_confidence = excluded.low_confidence,
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
      now,
      now,
    ],
  );
}

// A scan has at most one live feedback row: answering again soft-deletes the
// earlier answer. Call inside a transaction.
export async function replaceFeedback(db: Db, feedback: FeedbackInput, now: string): Promise<void> {
  await db.runAsync('UPDATE scan_feedback SET deleted_at = ?, updated_at = ? WHERE scan_id = ? AND deleted_at IS NULL', [
    now,
    now,
    feedback.scanId,
  ]);
  await db.runAsync(
    'INSERT INTO scan_feedback (id, scan_id, verdict, user_guess, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [feedback.id, feedback.scanId, feedback.verdict, feedback.userGuess, now, now],
  );
}
