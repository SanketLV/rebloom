// Waitlist → Supabase join_waitlist() (supabase/migrations/*_waitlist.sql). The publishable key is public by
// design: visitors can only call that function, which validates again and never reveals who is on the list.
export const WAITLIST = {
  url: 'https://vhxcgmupopeochwvmwcv.supabase.co/rest/v1/rpc/join_waitlist',
  key: 'sb_publishable_FsACOB5IUTE3GTxtxbwXsA_DgNlcwzg',
  // Slow 3G from a cold connection needs several round trips; 10s gave false failures after a real insert.
  timeoutMs: 25000,
};

export type Source = 'hero' | 'final';
export type JoinResult = 'joined' | 'invalid' | 'unreachable' | 'timeout';

export const MESSAGES = {
  joined: "You're on the list. We'll email you once, on launch day.",
  invalid: 'Enter an email like name@example.com.',
  sending: 'Joining…',
  timeout: "This is taking a while. Tap Join again if it doesn't confirm; joining twice is safe.",
  unreachable: "Couldn't reach the waitlist. Check your connection and try again.",
} as const;

// review.md: strip invisible characters and trim before validating user text.
export const normalizeEmail = (raw: string) => raw.replace(/\p{Cf}/gu, '').trim();

// Not AbortSignal.timeout(): iOS 15 and older (incl. Instagram/TikTok in-app browsers there) lack it.
const timeoutSignal = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

export async function joinWaitlist(email: string, source: Source): Promise<JoinResult> {
  try {
    const r = await fetch(WAITLIST.url, {
      method: 'POST',
      headers: { apikey: WAITLIST.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_source: source }),
      signal: timeoutSignal(WAITLIST.timeoutMs),
    });
    if (r.status === 204) return 'joined';
    if (r.status === 400) return 'invalid';
    return 'unreachable';
  } catch (err) {
    return (err as Error).name === 'AbortError' ? 'timeout' : 'unreachable';
  }
}
