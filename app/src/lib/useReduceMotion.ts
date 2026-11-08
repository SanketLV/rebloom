import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // A change event is newer than the first read, so the read must not overwrite it.
    let changed = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled && !changed) setReduceMotion(enabled);
      })
      // Unknown: keep the animation, which is what most people get.
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}
