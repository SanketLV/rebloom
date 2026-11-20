import type { Candidate, Condition, ConditionId, Severity } from './types';

export const CONDITION_IDS = [
  'overwatering',
  'root_rot',
  'underwatering',
  'low_light',
  'sunburn',
  'spider_mites',
  'healthy',
] as const satisfies readonly ConditionId[];

export const CONDITIONS: Record<ConditionId, Condition> = {
  overwatering: {
    id: 'overwatering',
    name: 'Overwatering',
    shortName: 'overwatering',
    subtitle: 'Roots stressed by soggy soil',
    severity: 'moderate',
  },
  root_rot: {
    id: 'root_rot',
    name: 'Root rot (early)',
    shortName: 'root rot',
    subtitle: 'Roots starting to decay in wet soil',
    severity: 'severe',
  },
  underwatering: {
    id: 'underwatering',
    name: 'Underwatering',
    shortName: 'underwatering',
    subtitle: 'Leaves drying out from too little water',
    severity: 'mild',
  },
  low_light: {
    id: 'low_light',
    name: 'Not enough light',
    shortName: 'not enough light',
    subtitle: 'Slow, pale growth from too little light',
    severity: 'mild',
  },
  sunburn: {
    id: 'sunburn',
    name: 'Sunburn',
    shortName: 'sunburn',
    subtitle: 'Leaf scorch from strong direct sun',
    severity: 'moderate',
  },
  spider_mites: {
    id: 'spider_mites',
    name: 'Spider mites',
    shortName: 'spider mites',
    subtitle: 'Tiny pests feeding on the leaves',
    severity: 'moderate',
  },
  healthy: {
    id: 'healthy',
    name: 'Looks healthy',
    shortName: 'nothing wrong',
    subtitle: 'No clear sign of a problem',
    severity: 'none',
  },
};

// Kindwise names are lower case ("water excess or uneven watering"); scientific names start with a
// capital and stay as they are.
const sentenceCase = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

export function candidateName(c: Candidate): string {
  if (c.conditionId) return CONDITIONS[c.conditionId].name;
  return c.disease ? sentenceCase(c.disease.name) : 'Unknown problem';
}

// Reads mid-sentence: "Overwatering or fungal leaf spot?".
export function candidateShortName(c: Candidate): string {
  if (c.conditionId) return CONDITIONS[c.conditionId].shortName;
  const name = c.disease?.name ?? 'unknown problem';
  return /^[A-Z][a-z]+ [a-z]/.test(name) ? name : name.toLowerCase();
}

// Our subtitle, or the first sentence of Kindwise's description.
export function candidateSubtitle(c: Candidate): string | null {
  if (c.conditionId) return CONDITIONS[c.conditionId].subtitle;
  const description = c.disease?.description?.trim();
  if (!description) return null;
  return description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? description;
}

// No severity for diseases we don't map: we don't invent one (design 3).
export function candidateSeverity(c: Candidate): Severity | null {
  return c.conditionId ? CONDITIONS[c.conditionId].severity : null;
}
