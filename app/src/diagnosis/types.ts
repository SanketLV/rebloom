export type ConditionId =
  | 'overwatering'
  | 'root_rot'
  | 'underwatering'
  | 'low_light'
  | 'sunburn'
  | 'spider_mites'
  | 'healthy';

export type Severity = 'none' | 'mild' | 'moderate' | 'severe';

// `shortName` reads mid-sentence: "Overwatering or root rot?".
export type Condition = {
  id: ConditionId;
  name: string;
  shortName: string;
  subtitle: string;
  severity: Severity;
};

// A problem Kindwise named. Kept on the candidate even when it maps to one of our conditions, so
// its treatment notes can be found by id.
export type Disease = { id: string; name: string; commonNames: string[]; description: string | null };

// `conditionId` is one of our 7, or null for a Kindwise disease we don't map (then `disease` is set).
export type Candidate = { conditionId: ConditionId | null; confidence: number; disease?: Disease };

export type Species = { name: string; commonNames: string[]; probability: number };

// Kindwise's care notes, plain text, for the treatment-plan spec.
export type Treatment = { prevention: string[]; biological: string[]; chemical: string[] };

// Kindwise's follow-up yes/no question. Each answer points at one disease.
export type KindwiseQuestion = {
  text: string;
  yes: { id: string; name: string };
  no: { id: string; name: string };
};

export type QuestionAnswer = 'yes' | 'no' | 'not_sure';

// Top 3 candidates, most likely first. Confidences are 0–1. The rest only comes from Kindwise.
export type Diagnosis = {
  diagnoserId: string;
  candidates: Candidate[];
  species?: Species[];
  question?: KindwiseQuestion | null;
  // By Kindwise disease id.
  treatment?: Record<string, Treatment>;
  // Free scans left this month, when the server said.
  scansLeft?: number | null;
};

// The resized photo a diagnoser reads (800px on the longest side).
export type PreparedPhoto = { uri: string; width: number; height: number; sizeBytes: number };

// Kindwise (through the diagnose function) replaces the fake behind this interface. `scanId` makes
// a retry of the same scan free.
export interface Diagnoser {
  id: string;
  diagnose(photo: PreparedPhoto, options: { scanId: string }): Promise<Diagnosis>;
}

export type QuestionId = 'watering' | 'light' | 'recent_change';

export type OptionId =
  | 'water_2_3_days'
  | 'water_weekly'
  | 'water_2_weeks'
  | 'water_when_dry'
  | 'light_direct_sun'
  | 'light_bright_indirect'
  | 'light_medium'
  | 'light_low'
  | 'change_repotted'
  | 'change_moved'
  | 'change_heater_ac'
  | 'change_none';

export type Answer = OptionId | 'not_sure';

export type Answers = Partial<Record<QuestionId, Answer>>;
