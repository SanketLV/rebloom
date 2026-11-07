import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { noteCodeSent, RESEND_SECONDS, resendDeadline, secondsUntilResend } from './codeSends';

export { RESEND_SECONDS } from './codeSends';

/**
 * "Send a new code" waits RESEND_SECONDS after each send to `email`. The deadline is a clock time
 * kept per address, so time in the background, or on another screen, counts. Screen readers hear
 * it at the start and when it's ready (announced on iOS too: review rule), never every second.
 */
export function useResendTimer(email: string) {
  const [deadline, setDeadline] = useState(() => resendDeadline(email));
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilResend(email));
  // After "Send a new code" one sentence says both things (two in a row get cut off on iOS).
  const sentAgain = useRef(false);

  useEffect(() => {
    if (deadline <= Date.now()) return;
    AccessibilityInfo.announceForAccessibility(
      sentAgain.current
        ? `We sent a new code. You can send another in ${RESEND_SECONDS} seconds.`
        : `You can send a new code in ${secondsUntilResend(email)} seconds.`,
    );
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        AccessibilityInfo.announceForAccessibility('You can send a new code now.');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, email]);

  const restart = useCallback(() => {
    sentAgain.current = true;
    noteCodeSent(email);
    setDeadline(resendDeadline(email));
    setSecondsLeft(RESEND_SECONDS);
  }, [email]);

  return { secondsLeft, ready: secondsLeft === 0, restart };
}
