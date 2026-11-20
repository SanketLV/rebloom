import { File } from 'expo-file-system';

import { postDiagnose } from '@/backend/diagnose';

import { fromServer, KINDWISE_ID } from './kindwiseMap';
import type { Diagnoser } from './types';

// server: Kindwise refused or gave up, the scan wasn't counted. error: anything else (it may have been).
export type DiagnoseFailureKind =
  | 'pending'
  | 'not_plant'
  | 'quota'
  | 'busy'
  | 'server'
  | 'error'
  | 'offline';

// Why Kindwise gave no diagnosis, for the screens (design 5–7). `resetsAt`: UTC, quota only.
export class DiagnoseFailure extends Error {
  constructor(
    readonly kind: DiagnoseFailureKind,
    readonly resetsAt: string | null = null,
  ) {
    super(`Kindwise diagnosis failed: ${kind}`);
    this.name = 'DiagnoseFailure';
  }
}

// The real diagnosis: the prepared photo (800 px, no location) goes to the diagnose function.
export const kindwiseDiagnoser: Diagnoser = {
  id: KINDWISE_ID,
  async diagnose(photo, { scanId }) {
    const image = await new File(photo.uri).base64();
    const answer = await postDiagnose(scanId, image);
    switch (answer.kind) {
      case 'done':
        return fromServer(answer.body);
      case 'quota':
        throw new DiagnoseFailure('quota', answer.resetsAt);
      case 'pending':
      case 'not_plant':
      case 'busy':
      case 'offline':
      case 'server':
      case 'error':
        throw new DiagnoseFailure(answer.kind);
      default:
        throw new DiagnoseFailure('error');
    }
  },
};
