import { Component, createRef, type FormEvent, type ReactNode } from 'react';
import { takePending } from '../lib/early-submit';
import { sendFromFallback } from '../lib/fallback-form';

type State = { failed: boolean; typed: Record<string, string> };

// Without a boundary, React removes the whole page on an uncaught error (say, an in-app browser missing an API),
// leaving it blank. Instead, put back the pre-rendered HTML: static, but readable. Its forms have no endpoint to
// POST to, so they're handled here with the same request (lib/fallback-form.ts); addresses typed before the
// crash are carried over, and sign-ups queued before it are sent.
export class RootBoundary extends Component<{ children: ReactNode; fallbackHtml: string }, State> {
  state: State = { failed: false, typed: {} };
  fallback = createRef<HTMLDivElement>();

  // Runs before the fallback replaces the live forms, so their typed values can still be read.
  static getDerivedStateFromError(): State {
    const typed: Record<string, string> = {};
    for (const form of document.querySelectorAll<HTMLFormElement>('form[data-source]')) {
      const input = form.elements.namedItem('email') as HTMLInputElement | null;
      if (input?.value) typed[form.dataset.source!] = input.value;
    }
    return { failed: true, typed };
  }

  componentDidCatch() {
    window.__rbHydrated = true;  // the guard stands down; this component owns the forms now
    const form = (source: string) => this.fallback.current?.querySelector<HTMLFormElement>(`form[data-source="${source}"]`);
    for (const [source, value] of Object.entries(this.state.typed)) {
      const input = form(source)?.elements.namedItem('email') as HTMLInputElement | null;
      if (input) input.value = value;
    }
    for (const { source, email } of takePending()) {
      const f = form(source);
      if (f) void sendFromFallback(f, { quiet: true, address: email });
    }
  }

  onSubmit = (e: FormEvent<HTMLDivElement>) => {
    e.preventDefault();
    void sendFromFallback(e.target as HTMLFormElement);
  };

  render() {
    return this.state.failed
      ? <div ref={this.fallback} onSubmit={this.onSubmit}
          onInput={e => (e.target as HTMLElement).removeAttribute('aria-invalid')}
          dangerouslySetInnerHTML={{ __html: this.props.fallbackHtml }} />
      : this.props.children;
  }
}
