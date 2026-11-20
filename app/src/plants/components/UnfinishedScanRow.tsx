import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { photoUri } from '@/photos/photos';
import type { UnfinishedScan } from '@/storage/plantsRepo';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

// Same values as scan/resumePending's PendingState (not imported: rows stay off the backend graph).
type PendingState = 'finishing' | 'retry' | 'ready' | 'other_account';

const scannedOn = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

// A scan sent but not saved as a plant (design 9). Text, not color alone, says where it stands.
// Every row can be removed, whatever state it is stuck in (review round 2): that is its exit.
export function UnfinishedScanRow({
  scan,
  state,
  onOpen,
  onRemove,
}: {
  scan: UnfinishedScan;
  state: PendingState;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const title = `Scan from ${scannedOn(scan.createdAt)}`;
  const line =
    state === 'ready'
      ? 'Diagnosis ready · See result'
      : state === 'retry'
        ? "Diagnosis didn't finish · Try again"
        : state === 'other_account'
          ? 'Scanned with another account: switch back to finish it'
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
  const openable = state === 'ready' || state === 'retry';
  return (
    <View testID="unfinished-scan-row" style={styles.row}>
      {openable ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${line}`}
          style={styles.main}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${title}. ${line}`} style={styles.main}>
          {body}
        </View>
      )}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title.charAt(0).toLowerCase()}${title.slice(1)}`}
        hitSlop={spacing.xs}
        style={styles.remove}>
        <Text style={[type.small, styles.removeText]}>Remove</Text>
      </Pressable>
    </View>
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
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  remove: { minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.textSecondary, textDecorationLine: 'underline' },
  photo: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.photoBg },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { color: colors.textSecondary },
  warning: { color: colors.warning },
});
