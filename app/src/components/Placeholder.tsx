import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/theme/tokens';

type Props = {
  title: string;
  // Which design canvas artboard replaces this screen, e.g. "10 Today".
  artboard: string;
  action?: ReactNode;
  // Off for screens with a native header, which already clears the notch.
  insetTop?: boolean;
};

export function Placeholder({ title, artboard, action, insetTop = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, insetTop && { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.screenTitle, styles.title]}>
          {title}
        </Text>
        {action}
      </View>
      <Text style={[type.caption, styles.note]}>Becomes artboard {artboard}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl - spacing.xs, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { flexShrink: 1, color: colors.text },
  note: { color: colors.textSecondary },
});
