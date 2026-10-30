import { fakeDiagnoser } from './fakeDiagnoser';
import type { Diagnoser } from './types';

// The one place to swap in the on-device model.
export const diagnoser: Diagnoser = fakeDiagnoser;
