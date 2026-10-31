import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { StartError } from '@/components/StartError';
import { sweepOrphanPhotos } from '@/photos/photos';
import type { Db } from '@/storage/db';
import { migrate } from '@/storage/migrations';
import { fontAssets, fonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

// Light only until the Night Greenhouse dark mode exists.
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.line,
    primary: colors.primary,
  },
};

// Nothing is saving yet, so any photo no scan points to is safe to delete.
async function openDb(db: Db) {
  await migrate(db);
  await sweepOrphanPhotos(db);
}

// Mounted only once fonts and the database are ready (or have failed).
function HideSplash() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  // On a font error, carry on with system fonts rather than block the app.
  const fontsReady = loaded || !!error;
  const [dbError, setDbError] = useState<Error | null>(null);
  // Bumped by Retry to remount the provider and open the database again.
  const [attempt, setAttempt] = useState(0);

  if (!fontsReady) return null;

  if (dbError) {
    return (
      <>
        <HideSplash />
        <StatusBar style="dark" />
        <StartError
          onRetry={() => {
            setDbError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </>
    );
  }

  return (
    // Renders its children only after `openDb` has run.
    <SQLiteProvider key={attempt} databaseName="rebloom.db" onInit={openDb} onError={setDbError}>
      <HideSplash />
      <ThemeProvider value={theme}>
        <StatusBar style="dark" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Settings',
              // Without this, iOS labels the back button with the hidden "(tabs)" group name.
              headerBackTitle: 'Back',
              headerTitleStyle: { fontFamily: fonts.body700 },
              headerTintColor: colors.text,
            }}
          />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
