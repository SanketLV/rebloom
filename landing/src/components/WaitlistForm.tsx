import { useRef, useState, type FormEvent } from 'react';
import { MESSAGES, joinWaitlist, normalizeEmail, type Source } from '../lib/waitlist';

export function WaitlistForm({ source }: { source: Source }) {
  const email = useRef<HTMLInputElement>(null);
  const trap = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState('');
  const ids = { email: `email-${source}`, status: `status-${source}` };

  const markInvalid = () => {
    setStatus(MESSAGES.invalid);
    setInvalid(true);
    email.current!.focus();
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = email.current!;
    if (busyRef.current) return;
    input.value = normalizeEmail(input.value);
    if (!input.value || !input.checkValidity()) return markInvalid();
    setInvalid(false);
    if (trap.current!.value) return setStatus(MESSAGES.joined);  // bot trap filled: look done, send nothing

    const sent = input.value;
    busyRef.current = true;
    setBusy(true);  // read-only while in flight; aria-disabled, not disabled, which drops keyboard focus
    setStatus(MESSAGES.sending);
    const result = await joinWaitlist(sent, source);
    busyRef.current = false;
    setBusy(false);
    if (result === 'invalid') return markInvalid();
    // Keep what they typed after a failure so a retry is one tap; joining twice is harmless.
    setStatus(MESSAGES[result]);
    if (result === 'joined' && input.value === sent) input.value = '';  // never wipe something changed meanwhile
  }

  return (
    <form className="waitlist w-[min(100%,460px)]" data-source={source} method="post" noValidate onSubmit={onSubmit}>
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
