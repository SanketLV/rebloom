import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme/tokens';

// `value` is 0–1.
export function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Confidence"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[type.chip, styles.label]}>Confidence</Text>
        <Text style={[type.chip, styles.value]}>{percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.text },
  value: { color: colors.primary },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
