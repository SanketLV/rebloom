import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, spacing, type } from '@/theme/tokens';

// EmptyPlants artboard. Copy promises only what exists today: no care
// tracking or recovery yet, and no "Add a plant without scanning".
export function EmptyPlants({ onScan }: { onScan: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[type.title, styles.center, styles.title]}>
        No plants yet
      </Text>
      <Text style={[type.body, styles.center, styles.body]}>
        Scan a plant, then save it here to keep its diagnosis.
      </Text>
      <View style={styles.action}>
        <Button label="Scan your first plant" onPress={onScan} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: spacing.md + 2, paddingHorizontal: spacing.xxl },
  center: { textAlign: 'center' },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
  action: { marginTop: spacing.sm },
});
