import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

// A screen opened cold from a rebloom:// link has no history under it, and
// router.back() would do nothing. Go to `fallback` instead, replacing this
// screen so Back can't return to it.
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

// The same for Android system Back, which would otherwise close the app on a
// cold-linked screen. With history it does nothing, so the normal pop runs.
// Pass `enabled: false` while a sheet on the screen is open: the sheet's own
// Back listener registers first, and this one, being newer, would run first.
export function useAndroidBackOr(fallback: Href, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) return false;
        router.replace(fallback);
        return true;
      });
      return () => subscription.remove();
    }, [fallback, enabled]),
  );
}
