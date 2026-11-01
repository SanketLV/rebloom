import { Component, type ReactNode } from 'react';

// Without a boundary, React removes the whole page on an uncaught error (say, an in-app browser missing an API),
// leaving it blank. Instead, put back the pre-rendered HTML: static, but readable, and its forms then do the
// native POST, which the early-submit guard lets through once it's told hydration is over.
export class RootBoundary extends Component<{ children: ReactNode; fallbackHtml: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    window.__rbHydrated = true;
  }

  render() {
    return this.state.failed
      ? <div dangerouslySetInnerHTML={{ __html: this.props.fallbackHtml }} />
      : this.props.children;
  }
}
