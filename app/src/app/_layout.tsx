import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LogBox } from 'react-native';

import { StartError } from '@/components/StartError';
import { OnboardingContext, useOnboardingGate } from '@/onboarding/context';
import { sweepOrphanPhotos } from '@/photos/photos';
import type { Db } from '@/storage/db';
import { migrate } from '@/storage/migrations';
import { fontAssets } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

// Expo Router 58 (checked up to 58.0.32): a Stack with Stack.Protected sends REMOVE_ROUTES
// for its guarded screens before the navigator is registered, so dev mode reports it as
// unhandled. Nothing needed removing, so navigation is unaffected. Dev-only message.
// ponytail: delete once an expo-router release stops sending it.
LogBox.ignoreLogs([/The action 'REMOVE_ROUTES' .* was not handled by any navigator/]);

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
      <RootStack />
    </SQLiteProvider>
  );
}

// Inside SQLiteProvider on purpose: the provider is memoized and ignores `children`,
// so `seen` must be state of a component below it, or finishing onboarding never
// reaches the Stack's guards.
function RootStack() {
  const { seen, onboarding } = useOnboardingGate();
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <OnboardingContext.Provider value={onboarding}>
        <Stack>
          <Stack.Protected guard={!seen}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={seen}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="scan"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen name="account" options={{ headerShown: false }} />
            <Stack.Screen
              name="settings"
              options={{
                // The screen shows its own large heading, so the bar shows only Back.
                title: '',
                // Without this, iOS labels the back button with the hidden "(tabs)" group name.
                headerBackTitle: 'Back',
                headerTintColor: colors.text,
              }}
            />
          </Stack.Protected>
        </Stack>
      </OnboardingContext.Provider>
    </ThemeProvider>
  );
}
