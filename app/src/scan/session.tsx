import { randomUUID } from 'expo-crypto';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { applyAnswers, applyQuestionAnswer } from '@/diagnosis/rerank';
import type {
  Answer,
  Answers,
  Diagnosis,
  PreparedPhoto,
  QuestionAnswer,
  QuestionId,
} from '@/diagnosis/types';
import { deleteCachedPhoto } from '@/photos/photos';

// Where the scan's row stands (kindwise-diagnosis plan D5): none (nothing written), pending (sent,
// no result yet), ready (result here, not saved), done (saved or feedback given).
export type ScanStage = 'none' | 'pending' | 'ready' | 'done';

// One scan, from the shutter to Save. Lives only while the scan modal is open.
export type ScanState = {
  scanId: string;
  // The full-size capture or picker copy, until it's prepared.
  sourceUri: string | null;
  // The resized temp photo in cache/scans/, or the stored copy for a resumed scan.
  photo: PreparedPhoto | null;
  // Straight from the diagnoser.
  diagnosis: Diagnosis | null;
  answers: Answers;
  // Kindwise's follow-up question, when it sent one.
  questionAnswer?: QuestionAnswer;
  // The diagnosis re-ranked by the answers.
  result: Diagnosis | null;
  // The scan row exists in the database.
  persisted: boolean;
  // The photo has been copied to document/photos/.
  photoStored: boolean;
  stage: ScanStage;
  // Opened from My Plants: closing keeps it (review #5); only a retake replaces it.
  resumed?: boolean;
};

export type ScanSession = {
  state: ScanState;
  startScan(sourceUri: string): void;
  setPrepared(photo: PreparedPhoto): void;
  setDiagnosis(diagnosis: Diagnosis): void;
  answer(question: QuestionId, answer: Answer): void;
  answerQuestion(answer: QuestionAnswer): void;
  finish(): void;
  markPhotoStored(): void;
  markPersisted(): void;
  // The stored photo and pending row exist (written before the photo is sent).
  markPending(): void;
  markReady(): void;
  // Drops this scan's row now (e.g. not a plant).
  discard(): void;
  // Opens a scan stored earlier from My Plants: with its result ("Diagnosis ready"), or without one
  // to send it again ("Try again").
  resume(scan: { scanId: string; photo: PreparedPhoto; diagnosis: Diagnosis | null }): void;
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
  stage: 'none',
});

// Temp files belong to the session: whatever it drops, it deletes. Only
// app-cache files, never a user's own photo or a stored one.
function deleteTempFiles(state: ScanState) {
  if (state.photo) deleteCachedPhoto(state.photo.uri);
  if (state.sourceUri) deleteCachedPhoto(state.sourceUri);
}

const SessionContext = createContext<ScanSession | null>(null);

type Props = {
  children: ReactNode;
  // Removes an unsaved scan's row and stored photo (the layout does it with the database).
  onDiscard?: (scanId: string) => void;
};

export function ScanSessionProvider({ children, onDiscard }: Props) {
  const [state, setState] = useState(emptyScan);
  // The latest state for event handlers and cleanup, which can run before a re-render.
  const latest = useRef<ScanState>(null);
  const discardRef = useRef(onDiscard);
  useEffect(() => {
    discardRef.current = onDiscard;
  });

  const update = (change: (current: ScanState) => ScanState) => {
    const next = change(latest.current ?? state);
    latest.current = next;
    setState(next);
  };

  // Closing the scan: a result nobody saved goes; a scan still waiting for its result stays, so
  // My Plants can finish it.
  useEffect(
    () => () => {
      const last = latest.current;
      if (!last) return;
      deleteTempFiles(last);
      if (last.stage === 'ready' && !last.resumed) discardRef.current?.(last.scanId);
    },
    [],
  );

  const session: ScanSession = {
    state,
    startScan(sourceUri) {
      update((current) => {
        deleteTempFiles(current);
        // A retake abandons the scan it replaces, waiting or not.
        if (current.stage === 'pending' || current.stage === 'ready') {
          discardRef.current?.(current.scanId);
        }
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
    answerQuestion(questionAnswer) {
      update((current) => ({ ...current, questionAnswer }));
    },
    finish() {
      update((current) =>
        current.diagnosis
          ? {
              ...current,
              result: applyAnswers(
                applyQuestionAnswer(current.diagnosis, current.questionAnswer),
                current.answers,
              ),
            }
          : current,
      );
    },
    markPhotoStored() {
      update((current) => ({ ...current, photoStored: true }));
    },
    markPersisted() {
      update((current) => ({ ...current, persisted: true, stage: 'done' }));
    },
    markPending() {
      update((current) => ({ ...current, persisted: true, photoStored: true, stage: 'pending' }));
    },
    markReady() {
      update((current) => (current.stage === 'pending' ? { ...current, stage: 'ready' } : current));
    },
    discard() {
      update((current) => {
        if (current.stage === 'pending' || current.stage === 'ready') {
          discardRef.current?.(current.scanId);
        }
        return { ...current, stage: 'none', persisted: false, photoStored: false };
      });
    },
    resume({ scanId, photo, diagnosis }) {
      update((current) => {
        deleteTempFiles(current);
        return {
          ...emptyScan(),
          scanId,
          photo,
          diagnosis,
          persisted: true,
          photoStored: true,
          stage: diagnosis ? 'ready' : 'pending',
          resumed: true,
        };
      });
    },
  };

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useScanSession(): ScanSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useScanSession must be used inside <ScanSessionProvider>');
  return session;
}
