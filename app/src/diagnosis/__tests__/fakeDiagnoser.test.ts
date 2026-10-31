import { isLowConfidence } from '../confidence';
import { CONDITION_IDS } from '../conditions';
import { FAKE_FIXTURES, fakeDiagnoser } from '../fakeDiagnoser';
import type { PreparedPhoto } from '../types';

const photo = (
  width: number,
  height: number,
  sizeBytes: number,
  uri = 'file:///cache/scans/a.jpg',
): PreparedPhoto => ({
  uri,
  width,
  height,
  sizeBytes,
});

test('id marks it as a fake', () => {
  expect(fakeDiagnoser.id).toBe('fake-v1');
});

test('the same photo always gets the same result', async () => {
  const first = await fakeDiagnoser.diagnose(photo(800, 600, 123_456));
  const second = await fakeDiagnoser.diagnose(photo(800, 600, 123_456));
  expect(second).toEqual(first);
});

test('the uri (which holds a random scan id) has no effect', async () => {
  const a = await fakeDiagnoser.diagnose(photo(800, 600, 98_765, 'file:///cache/scans/one.jpg'));
  const b = await fakeDiagnoser.diagnose(photo(800, 600, 98_765, 'file:///cache/scans/two.jpg'));
  expect(b).toEqual(a);
});

test('has 8 fixtures, 2 of them low confidence (about 1 in 4)', () => {
  expect(FAKE_FIXTURES).toHaveLength(8);
  expect(
    FAKE_FIXTURES.filter((f) => isLowConfidence({ diagnoserId: 'x', candidates: f })),
  ).toHaveLength(2);
});

test('across many photos both low and normal results come up, each a valid top 3', async () => {
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      fakeDiagnoser.diagnose(photo(800, 600 + i, 50_000 + i * 977)),
    ),
  );
  expect(results.some(isLowConfidence)).toBe(true);
  expect(results.some((r) => !isLowConfidence(r))).toBe(true);
  for (const result of results) {
    expect(result.diagnoserId).toBe('fake-v1');
    expect(result.candidates).toHaveLength(3);
    const ids = result.candidates.map((c) => c.conditionId);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(CONDITION_IDS).toContain(id);
    const values = result.candidates.map((c) => c.confidence);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(values.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  }
});

test('returned results are copies, so callers cannot change the fixtures', async () => {
  const result = await fakeDiagnoser.diagnose(photo(800, 600, 1));
  result.candidates[0].confidence = 0;
  const again = await fakeDiagnoser.diagnose(photo(800, 600, 1));
  expect(again.candidates[0].confidence).toBeGreaterThan(0);
});
