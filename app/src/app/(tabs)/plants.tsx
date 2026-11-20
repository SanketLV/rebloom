import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyPlants } from '@/plants/components/EmptyPlants';
import { PlantRow } from '@/plants/components/PlantRow';
import { UnfinishedScanRow } from '@/plants/components/UnfinishedScanRow';
import { finishPendingScans, type PendingState } from '@/scan/resumePending';
import {
  listPlants,
  listUnfinishedScans,
  type PlantSummary,
  type UnfinishedScan,
} from '@/storage/plantsRepo';
import { colors, spacing, type } from '@/theme/tokens';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; plants: PlantSummary[]; unfinished: UnfinishedScan[] }
  | { status: 'failed' };

// Artboard 11 My Plants (list rows only) and EmptyPlants.
export default function MyPlantsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // What the last pass learned about each pending scan (kindwise-diagnosis plan D4).
  const [pending, setPending] = useState<Record<string, PendingState>>({});

  // Reload whenever the tab comes into view, e.g. right after a save. Then finish scans whose call
  // was cut off, and reload if any changed. Only here: an app start sends nothing.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const read = () =>
        Promise.all([listPlants(db), listUnfinishedScans(db)]).then(
          ([plants, unfinished]) => active && setLoad({ status: 'ready', plants, unfinished }),
          () => active && setLoad({ status: 'failed' }),
        );
      void read().then(async () => {
        const states = await finishPendingScans(db);
        if (!active) return;
        setPending(states);
        if (Object.values(states).some((state) => state === 'ready')) await read();
      });
      return () => {
        active = false;
      };
    }, [db]),
  );

  const stateOf = (scan: UnfinishedScan): PendingState =>
    scan.status === 'ready' ? 'ready' : (pending[scan.id] ?? 'finishing');
  const open = (scan: UnfinishedScan) =>
    router.push({ pathname: '/scan/resume', params: { id: scan.id } });

  const header = (
    <Text accessibilityRole="header" style={[type.screenTitle, styles.title]}>
      My Plants
    </Text>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
      {load.status === 'ready' && (load.plants.length > 0 || load.unfinished.length > 0) ? (
        <FlatList
          data={load.plants}
          keyExtractor={(plant) => plant.id}
          renderItem={({ item }) => <PlantRow plant={item} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {header}
              {load.unfinished.map((scan) => (
                <UnfinishedScanRow
                  key={scan.id}
                  scan={scan}
                  state={stateOf(scan)}
                  onOpen={() => open(scan)}
                />
              ))}
            </View>
          }
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
  headerBlock: { gap: spacing.md },
  error: { color: colors.severe, padding: spacing.lg },
});
