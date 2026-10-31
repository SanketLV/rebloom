import type { Answers, ConditionId, Diagnosis, OptionId } from './types';

const BOOST = 1.6;
const LOWER = 0.6;

// How each answer shifts the candidates (spec "Re-ranking by answers").
// First-guess weights: tune once real model output and day-7 labels exist.
export const RULES: Partial<Record<OptionId, Partial<Record<ConditionId, number>>>> = {
  water_2_3_days: { overwatering: BOOST, root_rot: BOOST, underwatering: LOWER },
  water_2_weeks: { underwatering: BOOST, overwatering: LOWER, root_rot: LOWER },
  light_direct_sun: { sunburn: BOOST, low_light: LOWER },
  light_low: { low_light: BOOST, sunburn: LOWER },
  change_repotted: { root_rot: BOOST },
  change_moved: { sunburn: BOOST, low_light: BOOST },
};

// Re-weights the same candidates by the user's answers, keeping their total
// confidence, so answers can reorder the top 3 but never add a condition.
export function applyAnswers(diagnosis: Diagnosis, answers: Answers): Diagnosis {
  const rules = Object.values(answers).flatMap((answer) =>
    answer && answer !== 'not_sure' && RULES[answer] ? [RULES[answer]] : [],
  );
  if (rules.length === 0) return diagnosis;

  const weighted = diagnosis.candidates.map((c) => ({
    conditionId: c.conditionId,
    confidence: rules.reduce((value, rule) => value * (rule[c.conditionId] ?? 1), c.confidence),
  }));
  const before = diagnosis.candidates.reduce((total, c) => total + c.confidence, 0);
  const after = weighted.reduce((total, c) => total + c.confidence, 0);
  const scale = after > 0 ? before / after : 0;

  return {
    diagnoserId: diagnosis.diagnoserId,
    candidates: weighted
      .map((c) => ({ conditionId: c.conditionId, confidence: c.confidence * scale }))
      .sort((a, b) => b.confidence - a.confidence),
  };
}
