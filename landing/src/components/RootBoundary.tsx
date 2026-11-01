import { Component, createRef, type FormEvent, type ReactNode } from 'react';
import { takePending } from '../lib/early-submit';
import { MESSAGES, joinWaitlist, normalizeEmail, type Source } from '../lib/waitlist';

// Without a boundary, React removes the whole page on an uncaught error (say, an in-app browser missing an API),
// leaving it blank. Instead, put back the pre-rendered HTML: static, but readable. Its forms have no endpoint to
// POST to, so they're handled here with the same request (sendFromFallback), and sign-ups queued before the
// crash are sent too.
export class RootBoundary extends Component<{ children: ReactNode; fallbackHtml: string }, { failed: boolean }> {
  state = { failed: false };
  fallback = createRef<HTMLDivElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    window.__rbHydrated = true;  // the guard stands down; this component owns the forms now
    for (const { source, email } of takePending()) {
      const form = this.fallback.current?.querySelector<HTMLFormElement>(`form[data-source="${source}"]`);
      const input = form?.elements.namedItem('email') as HTMLInputElement | null;
      if (!form || !input) continue;
      if (!input.value) input.value = email;
      void sendFromFallback(form);
    }
  }

  onSubmit = (e: FormEvent<HTMLDivElement>) => {
    e.preventDefault();
    void sendFromFallback(e.target as HTMLFormElement);
  };

  render() {
    return this.state.failed
      ? <div ref={this.fallback} onSubmit={this.onSubmit} dangerouslySetInnerHTML={{ __html: this.props.fallbackHtml }} />
      : this.props.children;
  }
}

// WaitlistForm's flow on plain DOM (no React state in the fallback): clean, validate, bot trap, send once.
async function sendFromFallback(form: HTMLFormElement) {
  const input = form.elements.namedItem('email') as HTMLInputElement | null;
  const trap = form.elements.namedItem('rb_hp') as HTMLInputElement | null;
  const status = form.querySelector('[role="status"]');
  if (!input || !status || form.dataset.busy) return;
  input.value = normalizeEmail(input.value);
  if (!input.value || !input.checkValidity()) { status.textContent = MESSAGES.invalid; return; }
  if (trap?.value) { status.textContent = MESSAGES.joined; return; }
  const sent = input.value;
  form.dataset.busy = '';
  status.textContent = MESSAGES.sending;
  const result = await joinWaitlist(sent, form.dataset.source as Source);
  delete form.dataset.busy;
  status.textContent = MESSAGES[result];
  if (result === 'joined' && input.value === sent) input.value = '';
}
