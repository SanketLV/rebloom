import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import {
  buttonHeight,
  cameraColors,
  colors,
  radius,
  spacing,
  touchTarget,
  type,
} from '@/theme/tokens';

// Keeps labels on a dark photo inside their fixed-height buttons at large text sizes.
const ON_DARK_FONT_SCALE = 1.3;

type Props = {
  label: string;
  onPress: () => void;
  // While an action runs: disabled, announced as busy, shows a spinner.
  busy?: boolean;
  disabled?: boolean;
  // What a disabled button says instead, e.g. "Pick an answer".
  disabledLabel?: string;
  // `onDark`: over a dark photo, where the `primary` fill would disappear.
  tone?: 'default' | 'onDark';
  // Decorative, beside the label.
  icon?: ReactNode;
};

// The one primary action on a screen (56pt, `primary` fill).
export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  disabledLabel,
  tone = 'default',
  icon,
}: Props) {
  const off = disabled || busy;
  const text = disabled && disabledLabel ? disabledLabel : label;
  const onDark = tone === 'onDark';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        styles.button,
        onDark && styles.onDark,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={onDark ? colors.text : colors.onPrimary} />
      ) : (
        <>
          {icon}
          <Text
            maxFontSizeMultiplier={onDark ? ON_DARK_FONT_SCALE : undefined}
            style={[
              type.button,
              disabled ? styles.disabledText : onDark ? styles.onDarkText : styles.text,
            ]}>
            {text}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// A secondary action as a text link ("Not now", "Retake photo").
export function TextButton({
  label,
  onPress,
  disabled = false,
  tone = 'default',
}: Pick<Props, 'label' | 'onPress' | 'disabled' | 'tone'>) {
  const onDark = tone === 'onDark';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      <Text
        maxFontSizeMultiplier={onDark ? ON_DARK_FONT_SCALE : undefined}
        style={[type.bodyStrong, styles.link, onDark && styles.onDarkLink]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  onDark: { backgroundColor: cameraColors.text },
  onDarkText: { color: colors.text },
  onDarkLink: { color: cameraColors.text },
  disabled: { backgroundColor: colors.disabled },
  pressed: { opacity: 0.85 },
  text: { color: colors.onPrimary },
  disabledText: { color: colors.textSecondary },
  textButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  link: { color: colors.primary, fontFamily: type.button.fontFamily },
});
