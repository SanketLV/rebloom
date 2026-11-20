import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '@/theme/tokens';

export const TOAST_MS = 4000;

type Props = {
  message: string;
  // Called once after TOAST_MS; the parent stops rendering the toast.
  onHide: () => void;
};

// A short confirmation pinned to the bottom of the screen. Not a live region: the screen reader
// is told where the action happens (announceForAccessibility), so it isn't announced twice.
// ponytail: no enter/exit animation; add a fade if it feels abrupt.
export function Toast({ message, onHide }: Props) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const timer = setTimeout(onHide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [onHide]);
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, spacing.lg) + spacing.lg }]}>
      <View testID="toast" style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.xl, right: spacing.xl, alignItems: 'center' },
  toast: {
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  text: { ...type.bodyStrong, color: colors.surface, textAlign: 'center' },
});
