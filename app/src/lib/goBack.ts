import { router, type Href } from 'expo-router';

// A screen opened cold from a rebloom:// link has no history under it, and
// router.back() would do nothing. Go to `fallback` instead, replacing this
// screen so Back can't return to it.
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
