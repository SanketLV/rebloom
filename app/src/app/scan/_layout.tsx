import { Stack } from 'expo-router';
import { useState } from 'react';

import { sweepTempPhotos } from '@/photos/photos';
import { ScanSessionProvider } from '@/scan/session';

// The scan flow: camera → analyzing → questions → result, inside the
// full-screen modal. The session lives exactly as long as this layout.
export default function ScanLayout() {
  // Sweep before anything renders: no photo of this scan exists yet, so a
  // leftover from a killed app or a late write is all it can hit.
  useState(() => {
    sweepTempPhotos();
    return true;
  });

  return (
    <ScanSessionProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Back on Analyzing cancels the run; the swipe would race it. */}
        <Stack.Screen name="analyzing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="questions" />
        <Stack.Screen name="result" />
        <Stack.Screen name="treatment" />
      </Stack>
    </ScanSessionProvider>
  );
}
