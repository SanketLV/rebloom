import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { ExpandIcon, FocusIcon, TodayIcon } from '@/components/icons';
import { colors, radius, spacing, type } from '@/theme/tokens';

const TIPS: { text: string; Icon: ComponentType<{ color: string; size?: number }> }[] = [
  { text: 'Hold steady and tap the leaf to focus', Icon: FocusIcon },
  { text: 'Get close so the sick leaf fills the frame', Icon: ExpandIcon },
  { text: 'Use daylight from a window, not a lamp', Icon: TodayIcon },
];

// The tips list from the RetakeSheet artboard; also used by LowConfidenceSheet.
export function PhotoTips() {
  return (
    <View style={styles.list}>
      {TIPS.map(({ text, Icon }) => (
        <View key={text} style={styles.tip}>
          <View style={styles.icon}>
            <Icon color={colors.text} size={18} />
          </View>
          <Text style={[type.bodyStrong, styles.text]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

export function TipsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} label="Tips for a good scan" onClose={onClose}>
      <Text accessibilityRole="header" style={[type.sheetTitle, styles.title]}>
        Tips for a good scan
      </Text>
      <PhotoTips />
      <Button label="Got it" onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text },
  list: { gap: spacing.md },
  tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm - 2,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, color: colors.text },
});
