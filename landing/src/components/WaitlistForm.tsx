import { useEffect, useRef, useState, type FormEvent } from 'react';
import { takePending } from '../lib/early-submit';
import { showResult } from '../lib/fallback-form';
import { MESSAGES, isEmail, joinWaitlist, joinedAs, normalizeEmail, type Source } from '../lib/waitlist';

export function WaitlistForm({ source }: { source: Source }) {
  const form = useRef<HTMLFormElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const trap = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState('');
  const ids = { email: `email-${source}`, status: `status-${source}` };

  // quiet: a sign-up queued before React loaded is sent on mount, wherever the visitor has scrolled since;
  // don't yank the page to the field.
  const markInvalid = (quiet = false) => {
    setStatus(MESSAGES.invalid);
    setInvalid(true);
    if (!quiet) email.current!.focus();
  };

  // address: send this instead of the field: a sign-up queued before React loaded sends the address that was
  // submitted, even if the visitor typed another one afterwards without submitting it.
  async function submit(quiet = false, address?: string) {
    const input = email.current!;
    if (busyRef.current) return;
    let sent: string;
    if (address === undefined) {
      input.value = normalizeEmail(input.value);
      sent = input.value;
      if (!sent || !input.checkValidity()) return markInvalid(quiet);
    } else {
      sent = normalizeEmail(address);
      if (!isEmail(sent)) return markInvalid(quiet);
    }
    setInvalid(false);
    if (trap.current!.value) return setStatus(MESSAGES.joined);  // bot trap filled: look done, send nothing

    busyRef.current = true;
    setBusy(true);  // read-only while in flight; aria-disabled, not disabled, which drops keyboard focus
    setStatus(MESSAGES.sending);
    const result = await joinWaitlist(sent, source);
    busyRef.current = false;
    // The page crashed meanwhile and RootBoundary swapped in the static fallback: report into its form instead.
    if (!form.current?.isConnected) {
      const fallback = document.querySelector<HTMLFormElement>(`form[data-source="${source}"]`);
      if (fallback) showResult(fallback, result, sent, true);
      return;
    }
    setBusy(false);
    if (result === 'invalid') return markInvalid(quiet);
    // Keep what they typed after a failure so a retry is one tap; joining twice is harmless. If the field no
    // longer shows the address that joined, name it rather than imply the one on screen.
    setStatus(result === 'joined' && input.value !== sent ? joinedAs(sent) : MESSAGES[result]);
    if (result === 'joined' && input.value === sent) input.value = '';  // never wipe something changed meanwhile
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void submit(); };

  // Hydrated: the inline guard (src/lib/early-submit.ts) stops queueing, and a sign-up it queued before React
  // loaded is sent now. Matched by source, not element, in case React had to re-create the DOM.
  useEffect(() => {
    window.__rbHydrated = true;
    const [queued] = takePending(source);
    if (queued) void submit(true, queued.email);
    // Mount only: the queue is drained once.
  }, []);

  return (
    <form ref={form} className="waitlist w-[min(100%,460px)]" data-source={source} method="post" noValidate onSubmit={onSubmit}>
      <div className="waitlist-row flex gap-2 rounded-full border border-surface/30 bg-surface/10 p-1.5">
        <label className="sr-only" htmlFor={ids.email}>Email</label>
        <input
          ref={email} id={ids.email} name="email" type="email" autoComplete="email" placeholder="you@example.com"
          maxLength={254} required aria-describedby={ids.status} aria-invalid={invalid || undefined} readOnly={busy}
          onInput={() => setInvalid(false)}
          className="h-12 min-w-0 flex-1 border-0 bg-transparent px-4 font-sans text-[16px] font-medium leading-[normal] text-surface"
        />
        <button
          type="submit" aria-disabled={busy}
          className="h-12 flex-none cursor-pointer rounded-full border-0 bg-surface px-[22px] font-sans text-[16px] font-bold leading-[normal] text-olive hover:bg-bg"
        >Join the waitlist</button>
      </div>
      {/* Bot trap: people never see or reach it, form-filling bots do. */}
      <div className="absolute -left-[9999px] h-px w-px opacity-0" inert>
        <input ref={trap} name="rb_hp" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="mt-2 min-h-[1.4em] text-[15px] font-semibold" id={ids.status} role="status" aria-live="polite">{status}</p>
    </form>
  );
}
