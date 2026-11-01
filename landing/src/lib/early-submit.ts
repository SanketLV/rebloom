// Inlined into the <head> of index.html (vite.config.ts), so it runs before the forms exist.
// The forms are pre-rendered and live from first paint, but React attaches their handlers only after the bundle
// loads. Until then a submit would be a native POST to the page (a 404/405 on a static host, email lost), so this
// blocks it and remembers the form's source and address. WaitlistForm sends it as soon as it mounts, or
// RootBoundary does if the page crashed. Feedback ("Joining…", then a still-loading hint after 15 s) is CSS keyed
// off attributes on <html>, outside React's tree, so it can't cause a hydration mismatch (src/index.css). CSS text
// isn't announced, so the same words go into #rb-early-status, a live region in index.html outside #root.
// It must stay self-contained (it is serialized with toString) and use only syntax Safari 14 understands.
export function earlySubmitGuard(w: Window) {
  const pending: { source: string; email: string }[] = (w.__rbPending = []);
  const html = w.document.documentElement;
  const say = (text: string) => { const live = w.document.getElementById('rb-early-status'); if (live) live.textContent = text; };
  let slowTimer = 0;
  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement;
    const source = form.dataset && form.dataset.source;
    if (w.__rbHydrated || !source) return;
    e.preventDefault();
    const queued = html.dataset.rbQueued || '';
    if ((queued + ' ').indexOf(' ' + source + ' ') < 0) html.dataset.rbQueued = queued + ' ' + source;
    if (!slowTimer) {
      say('Joining…');
      slowTimer = w.setTimeout(() => {
        if (w.__rbHydrated) return;
        html.dataset.rbSlow = '';
        say('Still loading. Check your connection, then reload the page.');
      }, 15000);
    }
    const field = form.elements.namedItem('email') as HTMLInputElement | null;
    const email = field ? field.value : '';
    for (const p of pending) if (p.source === source) { p.email = email; return; }
    pending.push({ source, email });
  };
  w.document.addEventListener('submit', onSubmit, true);
  return () => w.document.removeEventListener('submit', onSubmit, true);
}

// Removes and returns the queued sign-ups (all, or one form's), and clears their "Joining…" marker.
export function takePending(source?: string) {
  const queue = window.__rbPending ?? [];
  const taken = queue.filter(p => !source || p.source === source);
  for (const p of taken) queue.splice(queue.indexOf(p), 1);  // in place: the guard holds this array
  const html = document.documentElement;
  const left = (html.dataset.rbQueued ?? '').split(' ').filter(s => s && !taken.some(p => p.source === s));
  if (left.length) html.dataset.rbQueued = ` ${left.join(' ')}`;
  else {
    delete html.dataset.rbQueued;
    const live = document.getElementById('rb-early-status');
    if (live) live.textContent = '';  // the form's own status takes over from here
  }
  return taken;
}
