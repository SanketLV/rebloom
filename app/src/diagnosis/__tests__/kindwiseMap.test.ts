import { isLowConfidence, isSpeciesUnsure, SPECIES_UNSURE } from '../confidence';
import { conditionFor, fromServer, KINDWISE_ID } from '../kindwiseMap';

const disease = (id: string, name: string, probability: number, extra: object = {}) => ({
  id,
  name,
  common_names: [],
  probability,
  description: null,
  treatment: { prevention: [], biological: [], chemical: [] },
  ...extra,
});

const body = (overrides: object = {}) => ({
  is_plant: { probability: 0.98, binary: true },
  is_healthy: { probability: 0.12, binary: false },
  species: [{ name: 'Monstera deliciosa', common_names: ['Swiss cheese plant'], probability: 0.91 }],
  diseases: [
    disease('d1', 'water excess or uneven watering', 0.64, {
      description: 'Too much water.',
      treatment: { prevention: ['Let the soil dry.'], biological: [], chemical: [] },
    }),
    disease('d2', 'fungal leaf spot', 0.21),
  ],
  question: {
    text: 'Is the soil wet a day after watering?',
    yes: { id: 'd1', name: 'water excess or uneven watering' },
    no: { id: 'd2', name: 'fungal leaf spot' },
  },
  scans_left: 2,
  resets_at: '2026-12-01T00:00:00Z',
  ...overrides,
});

test('maps the server body: kindwise-v1, species, mapped and unmapped diseases, treatment, question', () => {
  const d = fromServer(body());
  expect(d.diagnoserId).toBe(KINDWISE_ID);
  expect(d.species).toEqual([{ name: 'Monstera deliciosa', commonNames: ['Swiss cheese plant'], probability: 0.91 }]);
  expect(d.candidates).toEqual([
    {
      conditionId: 'overwatering',
      confidence: 0.64,
      disease: { id: 'd1', name: 'water excess or uneven watering', commonNames: [], description: 'Too much water.' },
    },
    { conditionId: null, confidence: 0.21, disease: { id: 'd2', name: 'fungal leaf spot', commonNames: [], description: null } },
  ]);
  expect(d.treatment).toEqual({
    d1: { prevention: ['Let the soil dry.'], biological: [], chemical: [] },
    d2: { prevention: [], biological: [], chemical: [] },
  });
  expect(d.question?.yes.id).toBe('d1');
  expect(d.scansLeft).toBe(2);
});

test('names are matched after normalizing case, spaces, accents and invisible characters', () => {
  expect(conditionFor('  Water Deficiency ')).toBe('underwatering');
  expect(conditionFor('water​ deficiency')).toBe('underwatering');
  expect(conditionFor('wáter deficiency')).toBe('underwatering');
  expect(conditionFor('fungal leaf spot')).toBeNull();
  expect(conditionFor('')).toBeNull();
});

test('two Kindwise diseases mapping to one condition keep the higher probability, never the sum', () => {
  const d = fromServer(
    body({
      diseases: [
        disease('a', 'water excess or uneven watering', 0.3),
        disease('b', 'overwatering', 0.25),
        disease('c', 'fungi', 0.2),
      ],
    }),
  );
  expect(d.candidates.map((c) => [c.conditionId, c.confidence])).toEqual([
    ['overwatering', 0.3],
    [null, 0.2],
  ]);
  expect(isLowConfidence(d)).toBe(true);
});

test('a healthy plant → one "healthy" candidate with Kindwise\'s probability', () => {
  const d = fromServer(body({ is_healthy: { probability: 0.88, binary: true }, diseases: [], question: null }));
  expect(d.candidates).toEqual([{ conditionId: 'healthy', confidence: 0.88 }]);
  expect(d.question).toBeNull();
});

test('healthy but unsure stays low confidence', () => {
  const d = fromServer(body({ is_healthy: { probability: 0.45, binary: true } }));
  expect(isLowConfidence(d)).toBe(true);
});

test('species under 0.30 is "not sure"', () => {
  expect(SPECIES_UNSURE).toBe(0.3);
  expect(isSpeciesUnsure(fromServer(body()))).toBe(false);
  expect(isSpeciesUnsure(fromServer(body({ species: [{ name: 'X', common_names: [], probability: 0.29 }] })))).toBe(true);
  expect(isSpeciesUnsure(fromServer(body({ species: [] })))).toBe(true);
});

test('a broken body maps to safe defaults: no candidates (low confidence), no species, no question', () => {
  for (const raw of [null, 'x', 42, {}, { diseases: 'no', species: [{}], question: { text: 1 } }]) {
    const d = fromServer(raw);
    expect(d.candidates).toEqual([]);
    expect(d.species).toEqual([]);
    expect(d.question).toBeNull();
    expect(d.scansLeft).toBeNull();
    expect(isLowConfidence(d)).toBe(true);
  }
});

test('no more than 3 candidates, sorted by confidence', () => {
  const d = fromServer(
    body({
      diseases: [
        disease('a', 'a', 0.1),
        disease('b', 'b', 0.4),
        disease('c', 'c', 0.3),
        disease('d', 'd', 0.2),
      ],
    }),
  );
  expect(d.candidates.map((c) => c.disease?.id)).toEqual(['b', 'c', 'd']);
});
