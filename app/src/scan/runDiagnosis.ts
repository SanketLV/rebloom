import type { Diagnoser, Diagnosis, PreparedPhoto } from '@/diagnosis/types';
import { TimeoutError, withMinDuration, withTimeout } from '@/lib/async';
import { deletePhoto, preparePhoto } from '@/photos/photos';

export const DIAGNOSIS_TIMEOUT_MS = 10_000;
// Long enough to read the Analyzing steps.
export const ANALYZING_MIN_MS = 1_200;

export type DiagnosisErrorKind = 'prepare' | 'diagnose' | 'timeout' | 'aborted';

// `photo` is set when the photo was prepared before the failure, so
// "Try again" can skip straight to diagnosing.
export class DiagnosisError extends Error {
  constructor(
    readonly kind: DiagnosisErrorKind,
    readonly photo: PreparedPhoto | null = null,
    options?: { cause?: unknown },
  ) {
    super(`Diagnosis failed: ${kind}`, options);
    this.name = 'DiagnosisError';
  }
}

export type Step = 'prepared' | 'diagnosed';

type RunInput = { scanId: string; sourceUri: string | null; prepared: PreparedPhoto | null };
type RunOptions = {
  diagnoser: Diagnoser;
  signal?: AbortSignal;
  // `photo` is the prepared photo: from 'prepared' on, the caller owns that file.
  onStep?: (step: Step, photo: PreparedPhoto) => void;
  timeoutMs?: number;
  minMs?: number;
};

// Prepares the photo (unless a prepared one is passed in), then diagnoses it,
// within a time limit. A photo this run prepares after it was cancelled or
// timed out is deleted, so nothing is left behind.
export async function runDiagnosis(
  input: RunInput,
  {
    diagnoser,
    signal,
    onStep,
    timeoutMs = DIAGNOSIS_TIMEOUT_MS,
    minMs = ANALYZING_MIN_MS,
  }: RunOptions,
): Promise<{ photo: PreparedPhoto; diagnosis: Diagnosis }> {
  let timedOut = false;
  let photo = input.prepared;
  const gone = () => timedOut || signal?.aborted === true;

  const work = async () => {
    if (!photo) {
      if (!input.sourceUri) throw new DiagnosisError('prepare');
      let prepared: PreparedPhoto;
      try {
        prepared = await preparePhoto(input.sourceUri, input.scanId);
      } catch (cause) {
        throw new DiagnosisError('prepare', null, { cause });
      }
      if (gone()) {
        deletePhoto(prepared.uri);
        throw new DiagnosisError('aborted');
      }
      photo = prepared;
    }
    onStep?.('prepared', photo);

    let diagnosis: Diagnosis;
    try {
      diagnosis = await diagnoser.diagnose(photo);
    } catch (cause) {
      throw new DiagnosisError('diagnose', photo, { cause });
    }
    if (gone()) throw new DiagnosisError('aborted', photo);
    onStep?.('diagnosed', photo);
    return { photo, diagnosis };
  };

  try {
    const result = await withTimeout(withMinDuration(work(), minMs), timeoutMs);
    if (signal?.aborted) throw new DiagnosisError('aborted', photo);
    return result;
  } catch (error) {
    if (error instanceof TimeoutError) {
      timedOut = true;
      throw new DiagnosisError('timeout', photo, { cause: error });
    }
    if (signal?.aborted && !(error instanceof DiagnosisError && error.kind === 'aborted')) {
      throw new DiagnosisError('aborted', photo, { cause: error });
    }
    throw error;
  }
}
