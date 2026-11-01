// Inlined into the <head> of index.html (vite.config.ts), so it runs before the forms exist.
// The forms are pre-rendered and live from first paint, but React attaches their handlers only after the bundle
// loads. Until then a submit would be a native POST to the page (a 404/405 on a static host, email lost), so this
// blocks it and remembers the form's source and address; WaitlistForm sends it as soon as it mounts.
// It must stay self-contained (it is serialized with toString) and use only syntax Safari 14 understands.
export function earlySubmitGuard(w: Window) {
  const pending: { source: string; email: string }[] = (w.__rbPending = []);
  w.document.addEventListener('submit', e => {
    const form = e.target as HTMLFormElement;
    const source = form.dataset && form.dataset.source;
    if (w.__rbHydrated || !source) return;
    e.preventDefault();
    const field = form.elements.namedItem('email') as HTMLInputElement | null;
    const email = field ? field.value : '';
    for (const p of pending) if (p.source === source) { p.email = email; return; }
    pending.push({ source, email });
  }, true);
}
