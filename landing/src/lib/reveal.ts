// Scroll reveal for [data-reveal] items. Runs after hydration and hides only what's fully below the viewport, so
// server HTML, visitors without JS, a failed bundle and the RootBoundary fallback all show everything.
// The state is a DOM attribute React doesn't render, so hydration and re-renders leave it alone. Styles: index.css.
export function startReveal(): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};

  const fold = window.innerHeight;
  const items = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(el => el.getBoundingClientRect().top >= fold);
  if (!items.length) return () => {};

  const io = new IntersectionObserver(entries => {
    // Stagger per batch: a laptop row arrives together and staggers, a phone's single item doesn't wait.
    let inBatch = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      io.unobserve(el);
      el.style.transitionDelay = `${inBatch++ * 60}ms`;
      el.dataset.revealState = 'shown';
    }
  }, { rootMargin: '0px 0px -10% 0px' });

  for (const el of items) {
    el.dataset.revealState = 'hidden';
    io.observe(el);
  }
  return () => io.disconnect();
}
