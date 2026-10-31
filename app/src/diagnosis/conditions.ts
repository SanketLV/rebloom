import type { Condition, ConditionId } from './types';

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
