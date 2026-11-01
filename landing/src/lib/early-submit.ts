// Inlined into the <head> of index.html (vite.config.ts, with cfg from lib/waitlist.ts), so it runs before the
// forms exist. The forms are pre-rendered and live from first paint, but React attaches their handlers only after
// the bundle loads. Until then a submit would be a native POST to the page (a 404/405 on a static host, email
// lost), so this blocks it and remembers the form's source and address. WaitlistForm sends it as soon as it
// mounts, or RootBoundary does if the page crashed. If React hasn't arrived after 15 s (bundle blocked, failed,
// or unparseable), the guard sends the request itself, and later taps straight away.
// Feedback is CSS keyed off attributes on <html> (outside React's tree, so no hydration mismatch; src/index.css),
// plus the same words in #rb-early-status, a live region in index.html outside #root, for screen readers.
// It must stay self-contained (it is serialized with toString) and use only syntax Safari 14 understands.
type Result = 'joined' | 'invalid' | 'unreachable' | 'timeout';
export type GuardConfig = { url: string; key: string; timeoutMs: number; messages: Record<Result | 'sending', string> };

export function earlySubmitGuard(w: Window, cfg: GuardConfig) {
  const pending: { source: string; email: string }[] = (w.__rbPending = []);
  const html = w.document.documentElement;
  const say = (text: string) => { const live = w.document.getElementById('rb-early-status'); if (live) live.textContent = text; };
  // " hero final" / " hero:joined": space-separated tokens, matched in CSS with ~=.
  const tokens = (name: 'rbQueued' | 'rbDone') => (html.dataset[name] || '').split(' ').filter(Boolean);
  const setTokens = (name: 'rbQueued' | 'rbDone', list: string[]) => {
    if (list.length) html.dataset[name] = ' ' + list.join(' ');
    else delete html.dataset[name];
  };
  const showJoining = (source: string) => {
    setTokens('rbDone', tokens('rbDone').filter(t => t.split(':')[0] !== source));
    if (tokens('rbQueued').indexOf(source) < 0) setTokens('rbQueued', tokens('rbQueued').concat(source));
    say(cfg.messages.sending);
  };
  const send = (source: string, email: string) => {
    const finish = (result: Result) => {
      setTokens('rbQueued', tokens('rbQueued').filter(s => s !== source));
      setTokens('rbDone', tokens('rbDone').filter(t => t.split(':')[0] !== source).concat(source + ':' + result));
      say(cfg.messages[result]);
    };
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctrl) w.setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    w.fetch(cfg.url, {
      method: 'POST',
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_source: source }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(
      r => finish(r.status === 204 ? 'joined' : r.status === 400 ? 'invalid' : 'unreachable'),
      err => finish(err && err.name === 'AbortError' ? 'timeout' : 'unreachable'),
    );
  };
  let direct = false;
  let timer = 0;

  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement;
    const source = form.dataset && form.dataset.source;
    if (w.__rbHydrated || !source) return;
    e.preventDefault();
    const field = form.elements.namedItem('email') as HTMLInputElement | null;
    const trap = form.elements.namedItem('rb_hp') as HTMLInputElement | null;
    // Same cleanup as lib/waitlist.ts normalizeEmail. Nothing to send: let React show the invalid message later.
    const email = field ? field.value.replace(/\p{Cf}/gu, '').trim() : '';
    if (!email || (trap && trap.value)) return;
    showJoining(source);
    if (direct) { send(source, email); return; }
    let queued = false;
    for (const p of pending) if (p.source === source) { p.email = email; queued = true; }
    if (!queued) pending.push({ source, email });
    if (!timer) timer = w.setTimeout(() => {
      if (w.__rbHydrated) return;
      direct = true;
      for (const p of pending.splice(0)) send(p.source, p.email);
    }, 15000);
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
