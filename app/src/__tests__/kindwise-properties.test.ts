// Mass verification for the Kindwise diagnosis (review.md, high risk): thousands of generated
// server answers and answer sequences.

import * as fc from 'fast-check';

import { isLowConfidence, LOW_CONFIDENCE } from '@/diagnosis/confidence';
import { fromServer } from '@/diagnosis/kindwiseMap';
import { applyAnswers, applyQuestionAnswer } from '@/diagnosis/rerank';
import type { Answers, Diagnosis, QuestionAnswer } from '@/diagnosis/types';
import { QUESTIONS } from '@/diagnosis/questions';
import { migrate } from '@/storage/migrations';
import { getScan, insertPendingScan, markReady, parseCandidates, persistScan } from '@/storage/scansRepo';
import { createTestDb } from '@/testing/sqljs';

const RUNS = 2_000;

// Names that map onto our conditions, mixed with ones that don't, odd spacing and invisibles.
const diseaseName = fc.oneof(
  fc.constantFrom('water deficiency', 'water excess or uneven watering', 'overwatering', 'root rot', 'sunburn', 'tetranychidae'),
  fc.constantFrom('Fungi', 'fungal leaf spot', 'Pseudomonas syringae', ' Water Deficiency ', 'water​deficiency'),
  fc.string(),
);
const probability = fc.oneof(fc.double({ min: -2, max: 3, noNaN: false }), fc.constant(Number.NaN), fc.string(), fc.constant(null));
const disease = fc.record(
  {
    id: fc.oneof(fc.string({ minLength: 1 }), fc.integer()),
    name: diseaseName,
    common_names: fc.oneof(fc.array(fc.oneof(fc.string(), fc.integer())), fc.constant(null)),
    probability,
    description: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
    treatment: fc.oneof(fc.anything(), fc.record({ prevention: fc.array(fc.string()) })),
  },
  { requiredKeys: [] },
);
const body = fc.oneof(
  fc.anything(),
  fc.record(
    {
      is_healthy: fc.record({ binary: fc.oneof(fc.boolean(), fc.anything()), probability }, { requiredKeys: [] }),
      species: fc.oneof(fc.array(fc.record({ name: fc.string(), common_names: fc.anything(), probability }, { requiredKeys: [] }), { maxLength: 8 }), fc.anything()),
      diseases: fc.oneof(fc.array(disease, { maxLength: 8 }), fc.anything()),
      question: fc.anything(),
      scans_left: fc.anything(),
    },
    { requiredKeys: [] },
  ),
);

// The largest probability the server body offered for a problem (or health), clamped like the map.
function maxOffered(raw: unknown): number {
  const clamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const b = (raw ?? {}) as { diseases?: unknown; is_healthy?: { probability?: unknown } };
  const fromDiseases = Array.isArray(b.diseases)
    ? b.diseases.map((d) => clamp((d as { probability?: unknown } | null)?.probability))
    : [];
  return Math.max(0, clamp(b.is_healthy?.probability), ...fromDiseases);
}

test('any server answer maps without throwing: at most 3, confidences 0..1, never above what was offered', () => {
  fc.assert(
    fc.property(body, (raw) => {
      const d = fromServer(raw);
      expect(d.candidates.length).toBeLessThanOrEqual(3);
      expect(d.species?.length ?? 0).toBeLessThanOrEqual(3);
      for (const c of d.candidates) {
        expect(c.confidence).toBeGreaterThanOrEqual(0);
        expect(c.confidence).toBeLessThanOrEqual(1);
        expect(c.conditionId !== null || c.disease !== undefined).toBe(true);
      }
      // Merging several Kindwise names into one condition never adds them up.
      expect(d.candidates[0]?.confidence ?? 0).toBeLessThanOrEqual(maxOffered(raw) + 1e-12);
      // A weak photo stays weak.
      if (maxOffered(raw) < LOW_CONFIDENCE) expect(isLowConfidence(d)).toBe(true);
    }),
    { numRuns: RUNS },
  );
});

const answers = fc.record(
  Object.fromEntries(QUESTIONS.map((q) => [q.id, fc.constantFrom(...q.options.map((o) => o.id), 'not_sure' as const)])),
  { requiredKeys: [] },
) as fc.Arbitrary<Answers>;
const questionAnswer = fc.constantFrom<QuestionAnswer | undefined>('yes', 'no', 'not_sure', undefined);

test('answers re-order but never make the result more certain overall', () => {
  fc.assert(
    fc.property(body, questionAnswer, answers, (raw, qa, ours) => {
      const model = fromServer(raw);
      const final = applyAnswers(applyQuestionAnswer(model, qa), ours);
      const total = (d: Diagnosis) => d.candidates.reduce((sum, c) => sum + c.confidence, 0);
      expect(total(final)).toBeCloseTo(total(model), 9);
      expect(final.candidates.map((c) => c.disease?.id ?? c.conditionId).sort()).toEqual(
        model.candidates.map((c) => c.disease?.id ?? c.conditionId).sort(),
      );
    }),
    { numRuns: RUNS },
  );
});

test('a stored Kindwise scan reads back the same, and an unsure photo stays flagged after any answers', async () => {
  await fc.assert(
    fc.asyncProperty(body, questionAnswer, answers, async (raw, qa, ours) => {
      const db = await createTestDb();
      await migrate(db);
      const model = fromServer(raw);
      await insertPendingScan(db, { id: 's', photoPath: 'photos/s.jpg', diagnoserId: model.diagnoserId }, 't');
      await markReady(db, 's', model, 't');
      const stored = await getScan(db, 's');
      expect(stored?.diagnosis?.candidates).toEqual(parseCandidates(JSON.stringify(model.candidates.map((c) => ({
        condition_id: c.conditionId,
        confidence: c.confidence,
        ...(c.disease ? { disease: { id: c.disease.id, name: c.disease.name, common_names: c.disease.commonNames, description: c.disease.description } } : {}),
      })))));
      expect(stored?.diagnosis?.candidates).toEqual(model.candidates);

      const final = applyAnswers(applyQuestionAnswer(model, qa), ours);
      await persistScan(db, { id: 's', plantId: 'p', photoPath: 'photos/s.jpg', diagnoserId: model.diagnoserId, modelResult: model.candidates, answers: ours, finalResult: final.candidates, questionAnswer: qa ?? null }, 't');
      const row = await db.getFirstAsync<{ low_confidence: number }>('SELECT low_confidence FROM scans', []);
      if (isLowConfidence(model)) expect(row?.low_confidence).toBe(1);
    }),
    { numRuns: 300 },
  );
});
