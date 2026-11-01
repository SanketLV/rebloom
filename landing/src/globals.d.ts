// Set by the inline early-submit guard (src/lib/early-submit.ts) and read by WaitlistForm.
interface Window {
  __rbPending?: { source: string; email: string }[];
  __rbHydrated?: boolean;
}
