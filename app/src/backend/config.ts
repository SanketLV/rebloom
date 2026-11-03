// Which Supabase project the app talks to, from the two public EXPO_PUBLIC_ variables
// (app/.env.example). Missing or unusable values mean "no backend": every backend call then
// returns `not_configured` and the app works exactly as it does offline.

export type BackendConfig =
  | { configured: true; url: string; key: string }
  | { configured: false };

type BackendEnv = { url?: string; key?: string };

// Scheme, then a host with no spaces or path characters, then anything without spaces.
const HTTPS_URL = /^https:\/\/[^\s/?#@]+[^\s]*$/i;
const HTTP_OR_HTTPS_URL = /^https?:\/\/[^\s/?#@]+[^\s]*$/i;

/** Pure: plain `http://` (a local stack on the LAN) is accepted in development builds only. */
export function readBackendConfig(env: BackendEnv, isDev: boolean): BackendConfig {
  const url = (env.url ?? '').trim();
  const key = (env.key ?? '').trim();
  if (!url || !key) return { configured: false };
  if (!(isDev ? HTTP_OR_HTTPS_URL : HTTPS_URL).test(url)) return { configured: false };
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
