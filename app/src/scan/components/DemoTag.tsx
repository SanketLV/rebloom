import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme/tokens';

// Marks results from the fake diagnoser, so nobody takes them for a real diagnosis.
export function DemoTag({ full = false }: { full?: boolean }) {
  return (
    <View style={styles.tag}>
      <Text style={[type.label, styles.text]}>{full ? 'Demo diagnosis' : 'Demo'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentTint,
  },
  text: { color: colors.accent },
});
