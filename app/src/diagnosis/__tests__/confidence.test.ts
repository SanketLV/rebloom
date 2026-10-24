import { CONDITIONS, CONDITION_IDS } from '../conditions';
import { headerLabel, isDemoDiagnoser, isLowConfidence, LOW_CONFIDENCE } from '../confidence';
import type { ConditionId, Diagnosis } from '../types';

const diagnosis = (...pairs: [ConditionId, number][]): Diagnosis => ({
  diagnoserId: 'test',
  candidates: pairs.map(([conditionId, confidence]) => ({ conditionId, confidence })),
});

test('the low-confidence threshold is 0.50', () => {
  expect(LOW_CONFIDENCE).toBe(0.5);
});

test.each([
  [0.4999, true],
  [0.5, false],
  [0.51, false],
])('top result at %s → low confidence is %s', (top, low) => {
  expect(isLowConfidence(diagnosis(['overwatering', top], ['root_rot', 0.1]))).toBe(low);
});

test('no candidates counts as low confidence', () => {
  expect(isLowConfidence(diagnosis())).toBe(true);
});

test('header card names the top two causes', () => {
  expect(headerLabel(diagnosis(['overwatering', 0.6], ['root_rot', 0.2], ['low_light', 0.1]))).toBe(
    'Overwatering or root rot?',
  );
});

test('header card with a single candidate names just that one', () => {
  expect(headerLabel(diagnosis(['sunburn', 0.9]))).toBe('Sunburn?');
});

test('every condition has a lowercase short name for the header card', () => {
  for (const id of CONDITION_IDS) {
    const { shortName } = CONDITIONS[id];
    expect(shortName).toBe(shortName.toLowerCase());
    expect(shortName.length).toBeGreaterThan(0);
  }
});

test('fake diagnosers are demo diagnosers, real ones are not', () => {
  expect(isDemoDiagnoser('fake-v1')).toBe(true);
  expect(isDemoDiagnoser('tflite-v1')).toBe(false);
});
