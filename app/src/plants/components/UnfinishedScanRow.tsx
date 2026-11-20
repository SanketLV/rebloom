import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { photoUri } from '@/photos/photos';
import type { UnfinishedScan } from '@/storage/plantsRepo';
import { colors, radius, spacing, type } from '@/theme/tokens';

// Same values as scan/resumePending's PendingState (not imported: rows stay off the backend graph).
type PendingState = 'finishing' | 'retry' | 'ready';

const scannedOn = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

// A scan sent but not saved as a plant (design 9). Text, not color alone, says where it stands.
export function UnfinishedScanRow({
  scan,
  state,
  onOpen,
}: {
  scan: UnfinishedScan;
  state: PendingState;
  onOpen: () => void;
}) {
  const title = `Scan from ${scannedOn(scan.createdAt)}`;
  const line =
    state === 'ready'
      ? 'Diagnosis ready · See result'
      : state === 'retry'
        ? "Diagnosis didn't finish · Try again"
        : 'Finishing diagnosis…';
  const body = (
    <>
      <Image
        source={{ uri: photoUri(scan.photoPath) }}
        style={styles.photo}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.text}>
        <Text style={[type.bodyStrong, styles.title]}>{title}</Text>
        <View style={styles.status}>
          {state === 'finishing' && <ActivityIndicator size="small" color={colors.textSecondary} />}
          <Text style={[type.small, state === 'retry' ? styles.warning : styles.muted]}>{line}</Text>
        </View>
      </View>
    </>
  );
  if (state === 'finishing') {
    return (
      <View testID="unfinished-scan-row" accessible accessibilityLabel={`${title}. ${line}`} style={styles.row}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID="unfinished-scan-row"
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      style={styles.row}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 64 + spacing.md * 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  photo: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.photoBg },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { color: colors.textSecondary },
  warning: { color: colors.warning },
});
