import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme/tokens';

export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={[type.chip, styles.text]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  text: { color: colors.text },
});
