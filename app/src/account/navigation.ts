import { router } from 'expo-router';

import { goBackOr } from '@/lib/goBack';

/** Back to where the account screens were opened from; Settings when opened by a link. */
export function leaveAccount(): void {
  goBackOr('/settings');
}

/** After a sign-in: the account screen, with nothing from the sign-in steps left behind it. */
export function showAccount(): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/account');
}
