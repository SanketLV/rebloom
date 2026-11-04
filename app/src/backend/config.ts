// Which Supabase project the app talks to, from the two public EXPO_PUBLIC_ variables
// (app/.env.example). Missing or unusable values mean "no backend": every backend call then
// returns `not_configured` and the app works exactly as it does offline.

export type BackendConfig = { configured: true; url: string; key: string } | { configured: false };

type BackendEnv = { url?: string; key?: string };

// Parsed with the same URL parser supabase-js uses, so anything accepted here also makes a
// client (a looser check let `https://[` through, and creating the client then threw).
function usableUrl(url: string, isDev: boolean): boolean {
  if (/\s/.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const schemeOk = parsed.protocol === 'https:' || (isDev && parsed.protocol === 'http:');
  return schemeOk && parsed.hostname !== '' && !parsed.username && !parsed.password;
}

/** Pure: plain `http://` (a local stack on the LAN) is accepted in development builds only. */
export function readBackendConfig(env: BackendEnv, isDev: boolean): BackendConfig {
  const url = (env.url ?? '').trim();
  const key = (env.key ?? '').trim();
  if (!url || !key || !usableUrl(url, isDev)) return { configured: false };
  return { configured: true, url, key };
}

/** The app's config. Dot access on `process.env` so Expo inlines the values at build time. */
export function getBackendConfig(): BackendConfig {
  return readBackendConfig(
    {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    __DEV__,
  );
}
