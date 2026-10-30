import { CONDITIONS, CONDITION_IDS } from '../conditions';
import { QUESTIONS } from '../questions';

test('the catalogue has the 7 conditions the spec requires', () => {
  expect(CONDITION_IDS).toEqual([
    'overwatering',
    'root_rot',
    'underwatering',
    'low_light',
    'sunburn',
    'spider_mites',
    'healthy',
  ]);
  expect(CONDITIONS.overwatering.name).toBe('Overwatering');
  expect(CONDITIONS.root_rot.name).toBe('Root rot (early)');
  expect(CONDITIONS.low_light.name).toBe('Not enough light');
});

test('every condition has a name, subtitle and severity', () => {
  for (const id of CONDITION_IDS) {
    const condition = CONDITIONS[id];
    expect(condition.id).toBe(id);
    expect(condition.name.length).toBeGreaterThan(0);
    expect(condition.subtitle.length).toBeGreaterThan(0);
    expect(['none', 'mild', 'moderate', 'severe']).toContain(condition.severity);
  }
  expect(CONDITIONS.healthy.severity).toBe('none');
});

// Copy from the Questions artboard, word for word.
test('questions match the artboard exactly', () => {
  expect(QUESTIONS.map((q) => [q.id, q.text, q.options.map((o) => o.label)])).toEqual([
    [
      'watering',
      'How often do you water it?',
      ['Every 2–3 days', 'About once a week', 'Every 2 weeks or less', 'When the soil feels dry'],
    ],
    [
      'light',
      'How much light does it get?',
      ['Direct sun for hours', 'Bright, indirect light', 'Medium light', 'Low light, dark corner'],
    ],
    [
      'recent_change',
      'Has anything changed recently?',
      ['Repotted it', 'Moved it to a new spot', 'A heater or AC nearby', 'Nothing has changed'],
    ],
  ]);
});

test('option ids are unique across all questions and every option has a chip label', () => {
  const options = QUESTIONS.flatMap((q) => q.options);
  expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
  for (const option of options) expect(option.chip.length).toBeGreaterThan(0);
});
