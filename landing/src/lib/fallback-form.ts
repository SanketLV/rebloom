import { MESSAGES, isEmail, joinWaitlist, joinedAs, normalizeEmail, type JoinResult, type Source } from './waitlist';

// WaitlistForm's flow on a plain-DOM form: the crash fallback (RootBoundary) has no React state, and a
// WaitlistForm request that outlives a crash reports into the fallback's form here.
const parts = (form: HTMLFormElement) => ({
  input: form.elements.namedItem('email') as HTMLInputElement | null,
  trap: form.elements.namedItem('rb_hp') as HTMLInputElement | null,
  status: form.querySelector('[role="status"]'),
});

// quiet: for sends nobody just tapped (queued, or finishing after a crash): don't yank focus to the field.
export function showResult(form: HTMLFormElement, result: JoinResult, sent: string, quiet = false) {
  const { input, status } = parts(form);
  if (!input || !status) return;
  if (result === 'invalid') {
    status.textContent = MESSAGES.invalid;
    input.setAttribute('aria-invalid', 'true');
    if (!quiet) input.focus();
    return;
  }
  input.removeAttribute('aria-invalid');
  status.textContent = result === 'joined' && input.value !== sent ? joinedAs(sent) : MESSAGES[result];
  if (result === 'joined' && input.value === sent) input.value = '';
}

// address: send this instead of the field (a queued sign-up: the address that was submitted).
export async function sendFromFallback(form: HTMLFormElement, { quiet = false, address }: { quiet?: boolean; address?: string } = {}) {
  const { input, trap, status } = parts(form);
  if (!input || !status || 'busy' in form.dataset) return;  // the marker is '', so test presence
  let sent: string;
  if (address === undefined) {
    input.value = normalizeEmail(input.value);
    sent = input.value;
    if (!sent || !input.checkValidity()) return showResult(form, 'invalid', sent, quiet);
  } else {
    sent = normalizeEmail(address);
    if (!isEmail(sent)) return showResult(form, 'invalid', sent, quiet);
  }
  if (trap?.value) { status.textContent = MESSAGES.joined; return; }
  form.dataset.busy = '';
  status.textContent = MESSAGES.sending;
  const result = await joinWaitlist(sent, form.dataset.source as Source);
  delete form.dataset.busy;
  showResult(form, result, sent, quiet);
}
