import type { OptionId, QuestionId } from './types';

// `chip` is the short form shown under "Based on your answers" on Result.
export type Option = { id: OptionId; label: string; chip: string };
export type Question = { id: QuestionId; text: string; options: Option[] };

// Copy from the Questions artboard.
export const QUESTIONS: Question[] = [
  {
    id: 'watering',
    text: 'How often do you water it?',
    options: [
      { id: 'water_2_3_days', label: 'Every 2–3 days', chip: 'Watered every 2–3 days' },
      { id: 'water_weekly', label: 'About once a week', chip: 'Watered weekly' },
      { id: 'water_2_weeks', label: 'Every 2 weeks or less', chip: 'Watered every 2+ weeks' },
      { id: 'water_when_dry', label: 'When the soil feels dry', chip: 'Watered when dry' },
    ],
  },
  {
    id: 'light',
    text: 'How much light does it get?',
    options: [
      { id: 'light_direct_sun', label: 'Direct sun for hours', chip: 'Hours of direct sun' },
      {
        id: 'light_bright_indirect',
        label: 'Bright, indirect light',
        chip: 'Bright, indirect light',
      },
      { id: 'light_medium', label: 'Medium light', chip: 'Medium light' },
      { id: 'light_low', label: 'Low light, dark corner', chip: 'Low light' },
    ],
  },
  {
    id: 'recent_change',
    text: 'Has anything changed recently?',
    options: [
      { id: 'change_repotted', label: 'Repotted it', chip: 'Recently repotted' },
      { id: 'change_moved', label: 'Moved it to a new spot', chip: 'Recently moved' },
      { id: 'change_heater_ac', label: 'A heater or AC nearby', chip: 'Heater or AC nearby' },
      { id: 'change_none', label: 'Nothing has changed', chip: 'No recent changes' },
    ],
  },
];
