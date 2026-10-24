import { useEffect, type ReactNode } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, scrim, spacing } from '@/theme/tokens';

type Props = {
  visible: boolean;
  // Read out by screen readers when the sheet opens.
  label: string;
  onClose: () => void;
  // Off for sheets the user must answer (Back and the dimmed area do nothing).
  dismissible?: boolean;
  children: ReactNode;
};

// Sheet over the current screen, drawn in-tree rather than as an RN Modal:
// a Modal over the native full-screen scan modal can swallow navigation on
// iOS when a sheet button closes the sheet and navigates in the same tick.
// Render it last inside the screen, and hide the screen behind it from
// screen readers with `hiddenBehindSheet`.
export function BottomSheet({ visible, label, onClose, dismissible = true, children }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissible) onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, dismissible, onClose]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {dismissible ? (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      )}
      <KeyboardAvoidingView
        style={styles.anchor}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none">
        <View
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.handle} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// Spread onto the screen content behind an open sheet.
export function hiddenBehindSheet(open: boolean) {
  return {
    accessibilityElementsHidden: open,
    importantForAccessibility: open ? ('no-hide-descendants' as const) : ('auto' as const),
  };
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.disabled,
  },
});
