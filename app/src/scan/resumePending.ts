// Finishes scans whose call was cut off (app closed or killed mid-call, "Scan later"). Runs when
// My Plants comes into view, never at app start (plan D4). Kindwise keeps each identification, so
// asking again is free.

import { getDiagnose } from '@/backend/diagnose';
import { signedInUserId } from '@/backend/session';
import { fromServer } from '@/diagnosis/kindwiseMap';
import type { Db } from '@/storage/db';
import { listUnfinishedScans, type UnfinishedScan } from '@/storage/plantsRepo';

import { discardUnsavedScan, markScanReady } from './saveScan';

// finishing: still waiting (or offline). retry: the server has nothing, send the photo again.
// ready: the result is stored. other_account: sent with another account (signed in or out since):
// only that account can fetch it, and sending it again would count it twice (review #2).
export type PendingState = 'finishing' | 'retry' | 'ready' | 'other_account';
// What one pass learned: a state, or `removed` (not a plant: the scan and its photo are gone).
export type PassResult = PendingState | 'removed';

let running: Promise<Record<string, PassResult>> | null = null;

async function finishOne(db: Db, scan: UnfinishedScan): Promise<PassResult> {
  const id = scan.id;
  try {
    const answer = await getDiagnose(id);
    if (answer.kind === 'done') {
      await markScanReady(db, id, fromServer(answer.body));
      return 'ready';
    }
    if (answer.kind === 'not_found') {
      return scan.ownerId && scan.ownerId !== signedInUserId() ? 'other_account' : 'retry';
    }
    // Kindwise gave up and the server gave the scan back.
    if (answer.kind === 'server') return 'retry';
    if (answer.kind === 'not_plant') {
      await discardUnsavedScan(db, id);
      return 'removed';
    }
    return 'finishing';
  } catch {
    return 'finishing';
  }
}

/** One pass over the pending scans, one at a time. Calls at the same time share the pass. */
export function finishPendingScans(db: Db): Promise<Record<string, PassResult>> {
  running ??= (async () => {
    const states: Record<string, PassResult> = {};
    try {
      const scans = await listUnfinishedScans(db);
      for (const scan of scans) {
        if (scan.status !== 'pending') continue;
        states[scan.id] = await finishOne(db, scan);
      }
    } catch {
      // The list couldn't be read: nothing to report; the next visit tries again.
    }
    return states;
  })().finally(() => {
    running = null;
  });
  return running;
}
