import { Image, StyleSheet, Text, View } from 'react-native';

import { CONDITIONS } from '@/diagnosis/conditions';
import { isDemoDiagnoser } from '@/diagnosis/confidence';
import { photoUri } from '@/photos/photos';
import { DemoTag } from '@/scan/components/DemoTag';
import type { PlantSummary } from '@/storage/plantsRepo';
import { colors, radius, spacing, type } from '@/theme/tokens';

// Saved date in the user's own format; stored as UTC.
const savedOn = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

// One row of My Plants. Status badges and plant detail come with the My Plants spec.
export function PlantRow({ plant }: { plant: PlantSummary }) {
  const condition = plant.conditionId ? CONDITIONS[plant.conditionId] : null;
  const details = [plant.room, `Saved ${savedOn(plant.createdAt)}`].filter(Boolean).join(' · ');
  return (
    <View testID="plant-row" style={styles.row}>
      {plant.photoPath ? (
        <Image
          source={{ uri: photoUri(plant.photoPath) }}
          style={styles.photo}
          accessibilityLabel={`Photo of ${plant.name}`}
        />
      ) : (
        <View style={styles.photo} />
      )}
      <View style={styles.text}>
        <Text style={[type.bodyStrong, styles.name]} numberOfLines={2}>
          {plant.name}
        </Text>
        <Text style={[type.small, styles.muted]}>{details}</Text>
        {condition && (
          <View style={styles.diagnosis}>
            <Text style={[type.chip, styles.condition]}>{condition.name}</Text>
            {plant.diagnoserId && isDemoDiagnoser(plant.diagnoserId) && <DemoTag />}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  photo: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.photoBg },
  text: { flex: 1, gap: 2 },
  name: { color: colors.text, fontFamily: type.button.fontFamily },
  muted: { color: colors.textSecondary },
  diagnosis: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  condition: { color: colors.text },
});
