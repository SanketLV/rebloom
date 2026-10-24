import { StyleSheet, Text, View } from 'react-native';

import { Button, TextButton } from '@/components/Button';
import { colors, spacing, type } from '@/theme/tokens';

type Props = { onRetry: () => void; onScanAnother: () => void };

const TITLE = "We couldn't read this photo";

// ErrorState artboard layout, with copy for a photo that couldn't be read.
export function ErrorState({ onRetry, onScanAnother }: Props) {
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[type.title, styles.center, styles.title]}>
        {TITLE}
      </Text>
      <Text style={[type.body, styles.center, styles.body]}>
        Something went wrong while checking it. Try again, or scan another plant.
      </Text>
      <View style={styles.actions}>
        <Button label="Try again" onPress={onRetry} />
        <TextButton label="Scan another plant" onPress={onScanAnother} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: colors.bg },
  center: { textAlign: 'center' },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.sm },
});
