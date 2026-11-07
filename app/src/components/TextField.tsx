import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

type Props = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  // Shown under the field, marks its border, and is read with it by screen readers.
  error?: string | null;
  // Large centred digits (the sign-in code).
  big?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

// A labelled text input (artboards 18a, 18b).
export function TextField({ label, error, big = false, ...input }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, big && styles.big, !!error && styles.error]}
      />
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  label: { ...type.label, color: colors.textSecondary, letterSpacing: 0 },
  input: {
    ...type.bodyStrong,
    fontSize: 17,
    minHeight: touchTarget + 10,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    color: colors.text,
  },
  big: {
    ...type.title,
    minHeight: 68,
    textAlign: 'center',
    letterSpacing: 14,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  error: { borderColor: colors.severe },
  errorText: { ...type.caption, color: colors.severe, fontFamily: type.bodyStrong.fontFamily },
});
