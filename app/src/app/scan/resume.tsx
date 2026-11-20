import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { photoUri } from '@/photos/photos';
import { useScanSession } from '@/scan/session';
import { getScan } from '@/storage/scansRepo';
import { colors } from '@/theme/tokens';

// Opens an unfinished scan from My Plants: a ready one at its questions, one the server lost
// (Try again) back through Analyzing with its stored photo. Never in the Back history.
export default function ResumeScanScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const session = useScanSession();
  const db = useSQLiteContext();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const scan = typeof id === 'string' ? await getScan(db, id).catch(() => null) : null;
      if (!active) return;
      if (!scan || scan.status === 'done') {
        setMissing(true);
        return;
      }
      session.resume({
        scanId: scan.id,
        photo: { uri: photoUri(scan.photoPath), width: 0, height: 0, sizeBytes: 0 },
        diagnosis: scan.diagnosis,
      });
      router.replace(scan.diagnosis ? '/scan/questions' : '/scan/analyzing');
    })();
    return () => {
      active = false;
    };
    // Runs once for the scan it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (missing) return <Redirect href="/plants" />;
  return (
    <View style={styles.wrap} accessibilityLabel="Opening your scan">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
