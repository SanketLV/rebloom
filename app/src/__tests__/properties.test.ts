// Mass verification (CLAUDE.md §3a.6): thousands of generated inputs against
// the code the break-test fixes touched.
import * as fc from 'fast-check';

import { CONDITION_IDS } from '@/diagnosis/conditions';
import { isLowConfidence, LOW_CONFIDENCE } from '@/diagnosis/confidence';
import { fakeDiagnoser } from '@/diagnosis/fakeDiagnoser';
import { QUESTIONS } from '@/diagnosis/questions';
import { applyAnswers } from '@/diagnosis/rerank';
import type { Answers, Candidate, Diagnosis } from '@/diagnosis/types';
import { charCount, limitChars } from '@/lib/text';
import { isInAppCache } from '@/photos/photos';
import { NAME_MAX, validateName, validateRoom } from '@/plants/validation';
import { uniqueRooms } from '@/scan/components/SaveSheet';
import { migrate } from '@/storage/migrations';
import { persistScan, replaceFeedback } from '@/storage/scansRepo';
import { CACHE } from '@/testing/fileSystemFake';
import { createTestDb } from '@/testing/sqljs';

const RUNS = 2000;

// 1–3 distinct conditions sharing 60–100% confidence, like a model's top 3.
const candidates: fc.Arbitrary<Candidate[]> = fc
  .uniqueArray(fc.constantFrom(...CONDITION_IDS), { minLength: 1, maxLength: 3 })
  .chain((ids) =>
    fc
      .tuple(
        fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), {
          minLength: ids.length,
          maxLength: ids.length,
        }),
        fc.double({ min: 0.6, max: 1, noNaN: true }),
      )
      .map(([raw, share]) => {
        const total = raw.reduce((a, b) => a + b, 0);
        return ids
          .map((conditionId, i) => ({ conditionId, confidence: (raw[i] / total) * share }))
          .sort((a, b) => b.confidence - a.confidence);
      }),
  );

const diagnosis: fc.Arbitrary<Diagnosis> = candidates.map((c) => ({
  diagnoserId: 'fake-v1',
  candidates: c,
}));

const answers: fc.Arbitrary<Answers> = fc.record(
  Object.fromEntries(
    QUESTIONS.map((q) => [q.id, fc.constantFrom('not_sure', ...q.options.map((o) => o.id))]),
  ) as Record<string, fc.Arbitrary<string>>,
  { requiredKeys: [] },
) as fc.Arbitrary<Answers>;

// Any code point, plus the invisible and space characters the validation cares about.
const tricky = fc.constantFrom('​', '‍', '﻿', '⁠', ' ', '　', ' ', '\n');
const text = fc
  .array(fc.oneof(fc.string({ unit: 'binary', maxLength: 3 }), tricky), { maxLength: 60 })
  .map((parts) => parts.join(''));

describe('applyAnswers', () => {
  test('keeps the same conditions and total, sorted, never negative or NaN', () => {
    fc.assert(
      fc.property(diagnosis, answers, (d, a) => {
        const out = applyAnswers(d, a).candidates;
        const total = (c: Candidate[]) => c.reduce((s, x) => s + x.confidence, 0);
        expect(out.map((c) => c.conditionId).sort()).toEqual(
          d.candidates.map((c) => c.conditionId).sort(),
        );
        expect(total(out)).toBeCloseTo(total(d.candidates), 9);
        for (let i = 0; i < out.length; i++) {
          expect(Number.isFinite(out[i].confidence)).toBe(true);
          expect(out[i].confidence).toBeGreaterThanOrEqual(0);
          if (i > 0) expect(out[i - 1].confidence).toBeGreaterThanOrEqual(out[i].confidence);
        }
      }),
      { numRuns: RUNS },
    );
  });

  test('"not sure" everywhere changes nothing', () => {
    fc.assert(
      fc.property(diagnosis, (d) => {
        const allUnsure = Object.fromEntries(QUESTIONS.map((q) => [q.id, 'not_sure'])) as Answers;
        expect(applyAnswers(d, allUnsure)).toEqual(d);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('low confidence (#2)', () => {
  test('the generated data includes answers that lift an unsure guess over 50%', () => {
    const lifted = fc
      .sample(fc.tuple(diagnosis, answers), 2000)
      .filter(([d, a]) => isLowConfidence(d) && !isLowConfidence(applyAnswers(d, a)));
    expect(lifted.length).toBeGreaterThan(20);
  });

  test('a scan the model was unsure of is always stored as low confidence', async () => {
    const db = await createTestDb();
    await migrate(db);
    let n = 0;
    await fc.assert(
      fc.asyncProperty(
        diagnosis.filter((d) => d.candidates[0].confidence < LOW_CONFIDENCE),
        answers,
        async (d, a) => {
          const id = `scan-${n++}`;
          const final = applyAnswers(d, a);
          await persistScan(
            db,
            {
              id,
              plantId: null,
              photoPath: `photos/${id}.jpg`,
              diagnoserId: d.diagnoserId,
              modelResult: d.candidates,
              answers: a,
              finalResult: final.candidates,
            },
            't',
          );
          const row = await db.getFirstAsync<{ low_confidence: number }>(
            'SELECT low_confidence FROM scans WHERE id = ?',
            [id],
          );
          expect(row?.low_confidence).toBe(1);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('storage sequences', () => {
  test('any mix of saves keeps one scan row, the first created_at and the last plant link', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.option(fc.constantFrom('p1', 'p2', 'p3'), { nil: null }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (plantIds) => {
          const db = await createTestDb();
          await migrate(db);
          for (const [i, plantId] of plantIds.entries()) {
            await persistScan(
              db,
              {
                id: 's',
                plantId,
                photoPath: 'photos/s.jpg',
                diagnoserId: 'fake-v1',
                modelResult: [{ conditionId: 'sunburn', confidence: 0.7 }],
                answers: {},
                finalResult: [{ conditionId: 'sunburn', confidence: 0.7 }],
              },
              `t${i}`,
            );
          }
          const rows = await db.getAllAsync<{ plant_id: string | null; created_at: string }>(
            'SELECT plant_id, created_at FROM scans',
            [],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].created_at).toBe('t0');
          expect(rows[0].plant_id).toBe([...plantIds].reverse().find((p) => p !== null) ?? null);
          db.close();
        },
      ),
      { numRuns: 150 },
    );
  });

  test('any number of feedback answers leaves exactly one live row: the last one (#16)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('yes', 'not_sure', 'no') as fc.Arbitrary<'yes' | 'no'>, {
          minLength: 1,
          maxLength: 8,
        }),
        async (verdicts) => {
          const db = await createTestDb();
          await migrate(db);
          for (const [i, verdict] of verdicts.entries()) {
            await db.withTransactionAsync(() =>
              replaceFeedback(db, { id: `f${i}`, scanId: 's', verdict, userGuess: null }, `t${i}`),
            );
          }
          const live = await db.getAllAsync<{ id: string }>(
            'SELECT id FROM scan_feedback WHERE deleted_at IS NULL',
            [],
          );
          expect(live).toEqual([{ id: `f${verdicts.length - 1}` }]);
          db.close();
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('names and rooms (#11)', () => {
  test('validation never throws, and an accepted value is trimmed, visible and short enough', () => {
    fc.assert(
      fc.property(text, (raw) => {
        for (const [result, max] of [
          [validateName(raw), NAME_MAX],
          [validateRoom(raw), 30],
        ] as const) {
          if (!result.ok) continue;
          expect(result.value).toBe(result.value.trim());
          expect(result.value.replace(/[\p{Cf}\s]/gu, '').length).toBeGreaterThan(0);
          expect(charCount(result.value)).toBeLessThanOrEqual(max);
        }
      }),
      { numRuns: RUNS },
    );
  });

  test('only invisible characters is always "empty"', () => {
    fc.assert(
      fc.property(fc.array(tricky, { minLength: 0, maxLength: 50 }), (parts) => {
        expect(validateName(parts.join(''))).toEqual({ ok: false, reason: 'empty' });
      }),
      { numRuns: RUNS },
    );
  });

  test('limitChars keeps a whole-character prefix of at most max characters', () => {
    fc.assert(
      fc.property(text, fc.integer({ min: 0, max: 50 }), (raw, max) => {
        const out = limitChars(raw, max);
        expect(charCount(out)).toBeLessThanOrEqual(max);
        expect(raw.startsWith(out)).toBe(true);
        if (charCount(raw) <= max) expect(out).toBe(raw);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('room choices (#12)', () => {
  const room = fc.oneof(
    fc.constantFrom('Kitchen', 'kitchen', 'KITCHEN', ' Kitchen ', 'Balcony', 'balcony', 'Bedroom'),
    fc.string({ maxLength: 8 }),
  );

  // Independent of the code under test: same room = same letters, ignoring case and edges.
  const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  test('no two choices are the same room, and every input room is offered', () => {
    fc.assert(
      fc.property(fc.array(room, { maxLength: 20 }), (rooms) => {
        const out = uniqueRooms(rooms);
        for (let i = 0; i < out.length; i++)
          for (let j = i + 1; j < out.length; j++) expect(sameRoom(out[i], out[j])).toBe(false);
        for (const r of rooms) expect(out.some((kept) => sameRoom(kept, r))).toBe(true);
        // First spelling wins.
        for (const kept of out) expect(rooms.find((r) => sameRoom(r, kept))).toBe(kept);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('fake diagnoser', () => {
  test('same photo, same answer; a fresh copy every time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        async (width, height, sizeBytes) => {
          const photo = { uri: 'x', width, height, sizeBytes };
          const a = await fakeDiagnoser.diagnose(photo);
          const b = await fakeDiagnoser.diagnose(photo);
          expect(a).toEqual(b);
          expect(a.candidates).not.toBe(b.candidates);
          expect(a.candidates.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('isInAppCache', () => {
  test('a path with an empty, "." or ".." segment is never in the cache', () => {
    const segment = fc.oneof(
      fc.constantFrom('.', '..', '', 'scans', 'a.jpg'),
      fc.stringMatching(/^[a-z0-9.]{1,6}$/),
    );
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 6 }), (segments) => {
        const uri = `${CACHE}/${segments.join('/')}`;
        const bad = segments.some((s) => s === '' || s === '.' || s === '..');
        expect(isInAppCache(uri)).toBe(!bad);
      }),
      { numRuns: RUNS },
    );
  });

  test('anything outside the cache prefix is refused', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (uri) => {
        if (!uri.startsWith(`${CACHE}/`)) expect(isInAppCache(uri)).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });
});
