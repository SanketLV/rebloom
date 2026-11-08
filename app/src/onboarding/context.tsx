import { createContext, useContext, useRef, useState } from 'react';

import { readSeen, saveSeen } from './seen';

type Onboarding = {
  // Leaves the flow for good. Only the first call counts, so a double tap leaves once.
  finish(thenScan?: boolean): void;
  // True once after finish(true), for the tabs layout to open the camera.
  takeScanRequest(): boolean;
};

export const OnboardingContext = createContext<Onboarding>({
  finish() {},
  takeScanRequest: () => false,
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

// For the root layout, which gates its routes on `seen`.
export function useOnboardingGate() {
  // Read before the first render, so neither the intro nor Today flashes by mistake.
  const [seen, setSeen] = useState(readSeen);
  const finished = useRef(false);
  const scanRequest = useRef(false);

  const onboarding: Onboarding = {
    finish(thenScan = false) {
      if (finished.current) return;
      finished.current = true;
      scanRequest.current = thenScan;
      saveSeen();
      setSeen(true);
    },
    takeScanRequest() {
      const requested = scanRequest.current;
      scanRequest.current = false;
      return requested;
    },
  };

  return { seen, onboarding };
}
