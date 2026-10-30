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

export type Candidate = { conditionId: ConditionId; confidence: number };

// Top 3 candidates, most likely first. Confidences are 0–1 and sum to at most 1.
export type Diagnosis = { diagnoserId: string; candidates: Candidate[] };

// The resized photo a diagnoser reads (800px on the longest side).
export type PreparedPhoto = { uri: string; width: number; height: number; sizeBytes: number };

// The on-device model replaces the fake behind this interface.
export interface Diagnoser {
  id: string;
  diagnose(photo: PreparedPhoto): Promise<Diagnosis>;
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
