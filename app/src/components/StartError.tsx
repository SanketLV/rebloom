import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme/tokens';

import { Button } from './Button';

const TITLE = "Rebloom couldn't start";

// Shown when the local database can't open or migrate, instead of a blank app.
export function StartError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[type.title, styles.center, styles.title]}>
        {TITLE}
      </Text>
      <Text style={[type.body, styles.center, styles.body]}>
        Your plants are still on your phone. Try again, or restart the app.
      </Text>
      <Button label="Retry" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: colors.bg },
  center: { textAlign: 'center' },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
});
