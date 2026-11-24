import type { Answers, Candidate, ConditionId, Diagnosis, OptionId, QuestionAnswer } from './types';

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

// Re-weights the same candidates by the user's answers, so answers can reorder
// the top 3 but never add a condition or make the result more certain.
export function applyAnswers(diagnosis: Diagnosis, answers: Answers): Diagnosis {
  const rules = Object.values(answers).flatMap((answer) =>
    answer && answer !== 'not_sure' && RULES[answer] ? [RULES[answer]] : [],
  );
  if (rules.length === 0) return diagnosis;

  return reweight(diagnosis, (c) =>
    rules.reduce((value, rule) => value * ((c.conditionId && rule[c.conditionId]) || 1), 1),
  );
}

// Multiplies each candidate by its factor and scales back to the same total, then caps each at the
// highest confidence the input had: answers can reorder candidates, but no candidate ends up more
// certain than the model's best guess (review.md: combining signals never raises confidence).
function reweight(diagnosis: Diagnosis, factor: (c: Candidate) => number): Diagnosis {
  const weighted = diagnosis.candidates.map((c) => ({ ...c, confidence: c.confidence * factor(c) }));
  const before = diagnosis.candidates.reduce((total, c) => total + c.confidence, 0);
  const after = weighted.reduce((total, c) => total + c.confidence, 0);
  const scale = after > 0 ? before / after : 0;
  const ceiling = Math.max(0, ...diagnosis.candidates.map((c) => c.confidence));

  return {
    ...diagnosis,
    candidates: weighted
      .map((c) => ({ ...c, confidence: Math.min(c.confidence * scale, ceiling) }))
      .sort((a, b) => b.confidence - a.confidence),
  };
}

// Kindwise's yes/no question: each answer points at one disease. Same weights as our questions.
export function applyQuestionAnswer(diagnosis: Diagnosis, answer: QuestionAnswer | undefined): Diagnosis {
  const question = diagnosis.question;
  if (!question || !answer || answer === 'not_sure') return diagnosis;
  const [up, down] = answer === 'yes' ? [question.yes.id, question.no.id] : [question.no.id, question.yes.id];
  return reweight(diagnosis, (c) =>
    c.disease?.id === up ? BOOST : c.disease?.id === down ? LOWER : 1,
  );
}
