import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  // While an action runs: disabled, announced as busy, shows a spinner.
  busy?: boolean;
  disabled?: boolean;
  // What a disabled button says instead, e.g. "Pick an answer".
  disabledLabel?: string;
};

// The one primary action on a screen (56pt, `primary` fill).
export function Button({ label, onPress, busy = false, disabled = false, disabledLabel }: Props) {
  const off = disabled || busy;
  const text = disabled && disabledLabel ? disabledLabel : label;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[type.button, disabled ? styles.disabledText : styles.text]}>{text}</Text>
      )}
    </Pressable>
  );
}

// A secondary action as a text link ("Not now", "Retake photo").
export function TextButton({ label, onPress, disabled = false }: Pick<Props, 'label' | 'onPress' | 'disabled'>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      <Text style={[type.bodyStrong, styles.link]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  disabled: { backgroundColor: colors.disabled },
  pressed: { opacity: 0.85 },
  text: { color: colors.onPrimary },
  disabledText: { color: colors.textSecondary },
  textButton: { minHeight: touchTarget, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xs },
  link: { color: colors.primary, fontFamily: type.button.fontFamily },
});
