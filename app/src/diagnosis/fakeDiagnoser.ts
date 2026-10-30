import type { Candidate, ConditionId, Diagnoser } from './types';

const top3 = (...pairs: [ConditionId, number][]): Candidate[] =>
  pairs.map(([conditionId, confidence]) => ({ conditionId, confidence }));

// Realistic results until the on-device model lands. The last two are low
// confidence (top result under 0.50), so about 1 photo in 4 takes that path.
export const FAKE_FIXTURES: readonly Candidate[][] = [
  top3(['overwatering', 0.82], ['root_rot', 0.11], ['low_light', 0.07]),
  top3(['underwatering', 0.71], ['sunburn', 0.17], ['spider_mites', 0.08]),
  top3(['low_light', 0.66], ['overwatering', 0.2], ['underwatering', 0.1]),
  top3(['sunburn', 0.74], ['underwatering', 0.15], ['low_light', 0.08]),
  top3(['spider_mites', 0.68], ['sunburn', 0.18], ['underwatering', 0.1]),
  top3(['root_rot', 0.61], ['overwatering', 0.29], ['low_light', 0.06]),
  top3(['overwatering', 0.41], ['underwatering', 0.33], ['low_light', 0.18]),
  top3(['healthy', 0.38], ['spider_mites', 0.32], ['sunburn', 0.21]),
];

// 32-bit FNV-1a: small, stable across runs and platforms.
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Same photo in, same result out. Keyed on the prepared photo's size only:
// the uri holds a random scan id, so it would break that.
const FAKE_ID = 'fake-v1';

export const fakeDiagnoser: Diagnoser = {
  id: FAKE_ID,
  async diagnose({ width, height, sizeBytes }) {
    const fixture = FAKE_FIXTURES[fnv1a(`${width}x${height}:${sizeBytes}`) % FAKE_FIXTURES.length];
    return { diagnoserId: FAKE_ID, candidates: fixture.map((c) => ({ ...c })) };
  },
};
