import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyPlants } from '@/plants/components/EmptyPlants';
import { PlantRow } from '@/plants/components/PlantRow';
import { listPlants, type PlantSummary } from '@/storage/plantsRepo';
import { colors, spacing, type } from '@/theme/tokens';

type Load =
  { status: 'loading' } | { status: 'ready'; plants: PlantSummary[] } | { status: 'failed' };

// Artboard 11 My Plants (list rows only) and EmptyPlants.
export default function MyPlantsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  // Reload whenever the tab comes into view, e.g. right after a save.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listPlants(db).then(
        (plants) => active && setLoad({ status: 'ready', plants }),
        () => active && setLoad({ status: 'failed' }),
      );
      return () => {
        active = false;
      };
    }, [db]),
  );

  const header = (
    <Text accessibilityRole="header" style={[type.screenTitle, styles.title]}>
      My Plants
    </Text>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
      {load.status === 'ready' && load.plants.length > 0 ? (
        <FlatList
          data={load.plants}
          keyExtractor={(plant) => plant.id}
          renderItem={({ item }) => <PlantRow plant={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.fill}>
          <View style={styles.padded}>{header}</View>
          {load.status === 'ready' && <EmptyPlants onScan={() => router.push('/scan')} />}
          {load.status === 'failed' && (
            <Text accessibilityRole="alert" style={[type.body, styles.error]}>
              {"Couldn't load your plants."}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
  title: { color: colors.text, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  error: { color: colors.severe, padding: spacing.lg },
});
