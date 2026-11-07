import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hiddenBehindSheet } from '@/components/BottomSheet';
import { ChevronLeftIcon, CloseIcon } from '@/components/icons';
import { IconButton } from '@/components/IconButton';
import { useAndroidBackOr } from '@/lib/goBack';
import { colors, spacing, type } from '@/theme/tokens';

type Props = {
  // The button top left: Close (×) on the sign-in screen, Back (‹) elsewhere.
  top: { kind: 'close' | 'back'; onPress: () => void };
  title?: string;
  body?: ReactNode;
  children?: ReactNode;
  // Stays above the keyboard: the screen's main buttons.
  footer?: ReactNode;
  // Sheets, drawn over the screen (rendered last, as BottomSheet asks).
  overlay?: ReactNode;
  // While a sheet is open the screen behind it is hidden from screen readers.
  sheetOpen?: boolean;
};

// The frame of every account screen (artboards 18–18c): scrolls at large text sizes, and keeps
// the main button reachable above the keyboard.
export function AccountScreen({ top, title, body, children, footer, overlay, sheetOpen = false }: Props) {
  const insets = useSafeAreaInsets();
  // Opened cold from a link, Android Back would close the app. Off while a sheet handles Back.
  useAndroidBackOr('/settings', !sheetOpen);
  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        {...hiddenBehindSheet(sheetOpen)}>
        <ScrollView
          style={styles.screen}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
          <IconButton label={top.kind === 'close' ? 'Close' : 'Back'} onPress={top.onPress}>
            {top.kind === 'close' ? (
              <CloseIcon color={colors.text} />
            ) : (
              <ChevronLeftIcon color={colors.text} />
            )}
          </IconButton>
          {title ? (
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {body}
            </View>
          ) : null}
          {children}
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { paddingBottom: spacing.xl + insets.bottom }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Small({ children }: { children: ReactNode }) {
  return <Text style={styles.small}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl },
  heading: { gap: spacing.sm + 2 },
  title: { ...type.title, fontSize: 30, lineHeight: 33, color: colors.text },
  body: { ...type.body, color: colors.textSecondary },
  small: { ...type.small, color: colors.textSecondary, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm + 2 },
});
