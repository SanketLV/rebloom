import { useEffect, type ComponentRef, type Ref } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

type Props = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  // Shown under the field, marks its border, is read with it and is announced when it appears.
  error?: string | null;
  // Guidance while typing (e.g. the address's shape): shown and read with the field, never announced.
  hint?: string | null;
  // Large centred digits (the sign-in code).
  big?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

// A labelled text input (artboards 18a, 18b).
// Screen readers get the label and the error from the input itself, and hear each new error
// (announced on iOS too: accessibilityLiveRegion is Android-only).
const notRead = { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const };

export function TextField({ label, error, hint, big = false, ...input }: Props) {
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} {...notRead}>
        {label}
      </Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? undefined}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, big && styles.big, !!error && styles.error]}
      />
      {error || hint ? (
        <Text style={error ? styles.errorText : styles.hintText} {...notRead}>
          {error ?? hint}
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
  hintText: { ...type.caption, color: colors.textSecondary },
  errorText: { ...type.caption, color: colors.severe, fontFamily: type.bodyStrong.fontFamily },
});
