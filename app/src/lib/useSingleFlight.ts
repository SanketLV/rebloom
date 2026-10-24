import { useRef, useState } from 'react';

// Runs an async action at most once at a time, so a double tap on "Save"
// saves once. While it runs, `busy` is true and further calls resolve to
// undefined without running the action.
export function useSingleFlight<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  async function run(...args: Args): Promise<Result | undefined> {
    // A ref, not state: two taps in the same frame both see a stale `busy`.
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action(...args);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { run, busy };
}
