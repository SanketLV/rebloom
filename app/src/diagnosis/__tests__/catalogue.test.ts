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

// Kindwise diagnoses (kindwise-diagnosis spec): a candidate is one of our conditions, or a disease
// Kindwise named that we don't map.
describe('candidate names', () => {
  const { candidateName, candidateShortName, candidateSubtitle, candidateSeverity } =
    jest.requireActual('../conditions') as typeof import('../conditions');
  const disease = (name: string, description: string | null = null) => ({
    id: 'd1',
    name,
    commonNames: [],
    description,
  });

  test('our conditions keep their catalogue name, subtitle and severity', () => {
    const c = { conditionId: 'overwatering' as const, confidence: 0.6, disease: disease('water excess') };
    expect(candidateName(c)).toBe('Overwatering');
    expect(candidateShortName(c)).toBe('overwatering');
    expect(candidateSubtitle(c)).toBe('Roots stressed by soggy soil');
    expect(candidateSeverity(c)).toBe('moderate');
  });

  test('an unmapped Kindwise disease shows its name in sentence case, its first sentence, no severity', () => {
    const c = {
      conditionId: null,
      confidence: 0.2,
      disease: disease('fungal leaf spot', 'Spots caused by fungi. They spread in damp air.'),
    };
    expect(candidateName(c)).toBe('Fungal leaf spot');
    expect(candidateShortName(c)).toBe('fungal leaf spot');
    expect(candidateSubtitle(c)).toBe('Spots caused by fungi.');
    expect(candidateSeverity(c)).toBeNull();
  });

  test('a scientific name keeps its case; a missing description gives no subtitle', () => {
    const c = { conditionId: null, confidence: 0.2, disease: disease('Pseudomonas syringae') };
    expect(candidateName(c)).toBe('Pseudomonas syringae');
    expect(candidateSubtitle(c)).toBeNull();
  });

  test('a candidate with neither a condition nor a disease never crashes', () => {
    const c = { conditionId: null, confidence: 0.2 };
    expect(candidateName(c)).toBe('Unknown problem');
    expect(candidateSubtitle(c)).toBeNull();
  });
});
