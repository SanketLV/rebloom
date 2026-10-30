import { CONDITIONS } from './conditions';
import type { Diagnosis } from './types';

// Below this, the app asks for a better photo instead of trusting the result.
export const LOW_CONFIDENCE = 0.5;

export function isLowConfidence(diagnosis: Diagnosis): boolean {
  return (diagnosis.candidates[0]?.confidence ?? 0) < LOW_CONFIDENCE;
}

// Questions header card: "Overwatering or root rot?"
export function headerLabel(diagnosis: Diagnosis): string {
  const names = diagnosis.candidates.slice(0, 2).map((c) => CONDITIONS[c.conditionId].shortName);
  const text = names.join(' or ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}?`;
}

// Results from a fake engine carry a "Demo" label wherever they're shown.
export function isDemoDiagnoser(diagnoserId: string): boolean {
  return diagnoserId.startsWith('fake');
}
