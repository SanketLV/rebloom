import { randomUUID } from 'expo-crypto';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { applyAnswers } from '@/diagnosis/rerank';
import type { Answer, Answers, Diagnosis, PreparedPhoto, QuestionId } from '@/diagnosis/types';
import { deleteCachedPhoto } from '@/photos/photos';

// One scan, from the shutter to Save. Lives only while the scan modal is open.
export type ScanState = {
  scanId: string;
  // The full-size capture or picker copy, until it's prepared.
  sourceUri: string | null;
  // The resized temp photo in cache/scans/.
  photo: PreparedPhoto | null;
  // Straight from the diagnoser.
  diagnosis: Diagnosis | null;
  answers: Answers;
  // The diagnosis re-ranked by the answers.
  result: Diagnosis | null;
  // The scan row exists in the database.
  persisted: boolean;
  // The photo has been copied to document/photos/.
  photoStored: boolean;
};

export type ScanSession = {
  state: ScanState;
  startScan(sourceUri: string): void;
  setPrepared(photo: PreparedPhoto): void;
  setDiagnosis(diagnosis: Diagnosis): void;
  answer(question: QuestionId, answer: Answer): void;
  finish(): void;
  markPhotoStored(): void;
  markPersisted(): void;
};

const emptyScan = (): ScanState => ({
  scanId: randomUUID(),
  sourceUri: null,
  photo: null,
  diagnosis: null,
  answers: {},
  result: null,
  persisted: false,
  photoStored: false,
});

// Temp files belong to the session: whatever it drops, it deletes. Only
// app-cache files, never a user's own photo.
function deleteTempFiles(state: ScanState) {
  if (state.photo) deleteCachedPhoto(state.photo.uri);
  if (state.sourceUri) deleteCachedPhoto(state.sourceUri);
}

const SessionContext = createContext<ScanSession | null>(null);

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(emptyScan);
  // The latest state for event handlers and cleanup, which can run before a re-render.
  const latest = useRef<ScanState>(null);

  const update = (change: (current: ScanState) => ScanState) => {
    const next = change(latest.current ?? state);
    latest.current = next;
    setState(next);
  };

  useEffect(
    () => () => {
      if (latest.current) deleteTempFiles(latest.current);
    },
    [],
  );

  const session: ScanSession = {
    state,
    startScan(sourceUri) {
      update((current) => {
        deleteTempFiles(current);
        return { ...emptyScan(), sourceUri };
      });
    },
    setPrepared(photo) {
      update((current) => ({ ...current, photo }));
    },
    setDiagnosis(diagnosis) {
      update((current) => ({ ...current, diagnosis }));
    },
    answer(question, answer) {
      update((current) => ({ ...current, answers: { ...current.answers, [question]: answer } }));
    },
    finish() {
      update((current) =>
        current.diagnosis
          ? { ...current, result: applyAnswers(current.diagnosis, current.answers) }
          : current,
      );
    },
    markPhotoStored() {
      update((current) => ({ ...current, photoStored: true }));
    },
    markPersisted() {
      update((current) => ({ ...current, persisted: true }));
    },
  };

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useScanSession(): ScanSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useScanSession must be used inside <ScanSessionProvider>');
  return session;
}
