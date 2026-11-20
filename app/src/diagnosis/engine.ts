import { getBackendConfig } from '@/backend/config';

import { fakeDiagnoser } from './fakeDiagnoser';
import { kindwiseDiagnoser } from './kindwiseDiagnoser';
import type { Diagnoser } from './types';

const current = (): Diagnoser => (getBackendConfig().configured ? kindwiseDiagnoser : fakeDiagnoser);

// The one swap point: Kindwise when the backend is set up, the fake ("Demo") otherwise.
export const diagnoser: Diagnoser = {
  get id() {
    return current().id;
  },
  diagnose: (photo, options) => current().diagnose(photo, options),
};
