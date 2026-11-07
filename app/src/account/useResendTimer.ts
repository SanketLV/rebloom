import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const RESEND_SECONDS = 60;

const secondsUntil = (deadline: number) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

/**
 * "Send a new code" waits RESEND_SECONDS after each send. The deadline is a clock time, so time
 * spent in the background counts. Screen readers hear it at the start and when it's ready
 * (announced on iOS too: review rule), never every second.
 */
export function useResendTimer() {
  const [deadline, setDeadline] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `You can send a new code in ${RESEND_SECONDS} seconds.`,
    );
    const timer = setInterval(() => {
      const left = secondsUntil(deadline);
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        AccessibilityInfo.announceForAccessibility('You can send a new code now.');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const restart = useCallback(() => {
    setDeadline(Date.now() + RESEND_SECONDS * 1000);
    setSecondsLeft(RESEND_SECONDS);
  }, []);

  return { secondsLeft, ready: secondsLeft === 0, restart };
}
