import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { goBackOr } from '@/lib/goBack';

import { useAccount } from './store';

/** Back to where the account screens were opened from; Settings when opened by a link. */
export function leaveAccount(): void {
  goBackOr('/settings');
}

/** After a sign-in: the account screen, with nothing from the sign-in steps left behind it. */
export function showAccount(): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/account');
}

/**
 * On a sign-in step: once signed in (even by a check that finished after Back), show the account.
 * Only the screen in focus acts, so the steps beneath it don't dismiss a second time.
 */
export function useShowAccountWhenSignedIn(): void {
  const signedIn = useAccount().status === 'signed_in';
  useFocusEffect(
    useCallback(() => {
      if (signedIn) showAccount();
    }, [signedIn]),
  );
}
