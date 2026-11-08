import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
  const focusTarget = useRef<ComponentRef<typeof Text>>(null);

  // Move screen-reader focus into the sheet as it opens, so its label is read. The event only
  // takes on an accessibility element (RN requires accessible on the receiver, and the sheet's
  // plain container View isn't one): it goes to the invisible label Text holding the title.
  useEffect(() => {
    if (visible && focusTarget.current) AccessibilityInfo.sendAccessibilityEvent(focusTarget.current, 'focus');
  }, [visible]);

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.handle} />
          {/* The invisible node the focus event targets. No text children: the label would then
              appear twice in the tree for text queries; `accessibilityLabel` alone is read out. */}
          <Text ref={focusTarget} accessible accessibilityLabel={label} style={styles.focusLabel} />
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
  anchor: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
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
  // Off-screen to the eye, present to screen readers: the node the sheet's focus event targets.
  focusLabel: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
});
