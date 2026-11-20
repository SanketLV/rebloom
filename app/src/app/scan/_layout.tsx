import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { sweepTempPhotos } from '@/photos/photos';
import { discardUnsavedScan } from '@/scan/saveScan';
import { ScanSessionProvider } from '@/scan/session';

// The scan flow: camera → analyzing → questions → result, inside the
// full-screen modal. The session lives exactly as long as this layout.
export default function ScanLayout() {
  const db = useSQLiteContext();
  // On open, before the user can take a photo: no photo of this scan exists
  // yet, so a leftover from a killed app or a late write is all it can hit.
  useEffect(() => {
    sweepTempPhotos();
  }, []);

  return (
    // A scan nobody saved goes with its row and stored photo (best effort: My Plants shows it otherwise).
    <ScanSessionProvider onDiscard={(scanId) => void discardUnsavedScan(db, scanId).catch(() => {})}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Back on Analyzing cancels the run; the swipe would race it. */}
        <Stack.Screen name="analyzing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="questions" />
        <Stack.Screen name="result" />
        <Stack.Screen name="treatment" />
        <Stack.Screen name="resume" options={{ animation: 'none' }} />
      </Stack>
    </ScanSessionProvider>
  );
}
