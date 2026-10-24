import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { colors, spacing, type } from '@/theme/tokens';

import { PhotoTips } from './TipsSheet';

type Props = { visible: boolean; onRetake: () => void; onUseAnyway: () => void };

const TITLE = "We couldn't get a clear read";

// RetakeSheet artboard. Blur isn't detected, so the copy doesn't claim it is.
// Back means retake, matching Back on Analyzing.
export function LowConfidenceSheet({ visible, onRetake, onUseAnyway }: Props) {
  return (
    <BottomSheet visible={visible} label={TITLE} onClose={onRetake}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.sheetTitle, styles.title]}>
          {TITLE}
        </Text>
        <Text style={[type.caption, styles.body]}>A sharper photo gives a more confident diagnosis.</Text>
      </View>
      <PhotoTips />
      <Button label="Retake photo" onPress={onRetake} />
      <TextButton label="Use it anyway" onPress={onUseAnyway} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
});
