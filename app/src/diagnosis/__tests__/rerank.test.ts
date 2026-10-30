import { applyAnswers } from '../rerank';
import type { Answers, ConditionId, Diagnosis, OptionId } from '../types';

const diagnosis = (...pairs: [ConditionId, number][]): Diagnosis => ({
  diagnoserId: 'test',
  candidates: pairs.map(([conditionId, confidence]) => ({ conditionId, confidence })),
});

const confidenceOf = (d: Diagnosis, id: ConditionId) =>
  d.candidates.find((c) => c.conditionId === id)!.confidence;

const sum = (d: Diagnosis) => d.candidates.reduce((total, c) => total + c.confidence, 0);

// The spec's rules table. `healthy` is never touched by a rule, so it's the yardstick.
const TABLE: [OptionId, ConditionId[], ConditionId[]][] = [
  ['water_2_3_days', ['overwatering', 'root_rot'], ['underwatering']],
  ['water_2_weeks', ['underwatering'], ['overwatering', 'root_rot']],
  ['light_direct_sun', ['sunburn'], ['low_light']],
  ['light_low', ['low_light'], ['sunburn']],
  ['change_repotted', ['root_rot'], []],
  ['change_moved', ['sunburn', 'low_light'], []],
];

const QUESTION_OF: Record<string, keyof Answers> = {
  water: 'watering',
  light: 'light',
  change: 'recent_change',
};
const answerFor = (option: OptionId): Answers => ({ [QUESTION_OF[option.split('_')[0]]]: option });

describe.each(TABLE)('%s', (option, boosts, lowers) => {
  test.each(boosts)('boosts %s against an untouched condition', (target) => {
    const before = diagnosis([target, 0.3], ['healthy', 0.3]);
    const after = applyAnswers(before, answerFor(option));
    expect(confidenceOf(after, target)).toBeGreaterThan(confidenceOf(after, 'healthy'));
  });

  // jest rejects an empty table, and some rules only boost.
  if (lowers.length > 0) {
    test.each(lowers)('lowers %s against an untouched condition', (target) => {
      const before = diagnosis([target, 0.3], ['healthy', 0.3]);
      const after = applyAnswers(before, answerFor(option));
      expect(confidenceOf(after, target)).toBeLessThan(confidenceOf(after, 'healthy'));
    });
  }
});

test('watering every 2–3 days moves overwatering above underwatering', () => {
  const before = diagnosis(['underwatering', 0.45], ['overwatering', 0.35], ['low_light', 0.1]);
  const after = applyAnswers(before, { watering: 'water_2_3_days' });
  expect(after.candidates.map((c) => c.conditionId)).toEqual([
    'overwatering',
    'underwatering',
    'low_light',
  ]);
});

test('keeps the same 3 conditions, the same total, values in [0, 1], sorted', () => {
  const before = diagnosis(['overwatering', 0.5], ['root_rot', 0.3], ['low_light', 0.15]);
  const after = applyAnswers(before, {
    watering: 'water_2_3_days',
    light: 'light_low',
    recent_change: 'change_repotted',
  });
  expect(after.candidates.map((c) => c.conditionId).sort()).toEqual([
    'low_light',
    'overwatering',
    'root_rot',
  ]);
  expect(sum(after)).toBeCloseTo(sum(before), 9);
  for (const c of after.candidates) {
    expect(c.confidence).toBeGreaterThanOrEqual(0);
    expect(c.confidence).toBeLessThanOrEqual(1);
  }
  const values = after.candidates.map((c) => c.confidence);
  expect(values).toEqual([...values].sort((a, b) => b - a));
});

test.each<[string, Answers]>([
  ['no answers', {}],
  [
    '"I\'m not sure" everywhere',
    { watering: 'not_sure', light: 'not_sure', recent_change: 'not_sure' },
  ],
  [
    'answers with no rule',
    { watering: 'water_weekly', light: 'light_medium', recent_change: 'change_none' },
  ],
])('%s changes nothing', (_label, answers) => {
  const before = diagnosis(['overwatering', 0.5], ['root_rot', 0.3], ['low_light', 0.15]);
  expect(applyAnswers(before, answers)).toEqual(before);
});

test('keeps the diagnoser id and does not mutate its input', () => {
  const before = diagnosis(['underwatering', 0.45], ['overwatering', 0.35], ['low_light', 0.1]);
  const copy = structuredClone(before);
  const after = applyAnswers(before, { watering: 'water_2_3_days' });
  expect(before).toEqual(copy);
  expect(after.diagnoserId).toBe('test');
});

test('all-zero confidences stay zero instead of dividing by zero', () => {
  const before = diagnosis(['overwatering', 0], ['root_rot', 0], ['low_light', 0]);
  const after = applyAnswers(before, { watering: 'water_2_3_days' });
  for (const c of after.candidates) expect(c.confidence).toBe(0);
});
