// Finishes scans whose call was cut off (app closed or killed mid-call, "Scan later"). Runs when
// My Plants comes into view, never at app start (plan D4). Kindwise keeps each identification, so
// asking again is free.

import { getDiagnose } from '@/backend/diagnose';
import { fromServer } from '@/diagnosis/kindwiseMap';
import type { Db } from '@/storage/db';
import { listUnfinishedScans } from '@/storage/plantsRepo';

import { discardUnsavedScan, markScanReady } from './saveScan';

// finishing: still waiting (or offline). retry: the server has nothing, send the photo again.
// ready: the result is stored.
export type PendingState = 'finishing' | 'retry' | 'ready';

let running: Promise<Record<string, PendingState>> | null = null;

async function finishOne(db: Db, id: string): Promise<PendingState | null> {
  try {
    const answer = await getDiagnose(id);
    if (answer.kind === 'done') {
      await markScanReady(db, id, fromServer(answer.body));
      return 'ready';
    }
    if (answer.kind === 'not_found') return 'retry';
    if (answer.kind === 'not_plant') {
      await discardUnsavedScan(db, id);
      return null;
    }
    return 'finishing';
  } catch {
    return 'finishing';
  }
}

/** One pass over the pending scans, one at a time. Calls at the same time share the pass. */
export function finishPendingScans(db: Db): Promise<Record<string, PendingState>> {
  running ??= (async () => {
    const states: Record<string, PendingState> = {};
    try {
      const scans = await listUnfinishedScans(db);
      for (const scan of scans) {
        if (scan.status !== 'pending') continue;
        const state = await finishOne(db, scan.id);
        if (state) states[scan.id] = state;
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
