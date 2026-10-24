import { act, fireEvent, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import { mockSqlite } from '@/testing/nativeMocks';

let mockFontState: [boolean, Error | null] = [true, null];
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => mockFontState }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const Child = () => <Text>child screen</Text>;

beforeEach(() => jest.mocked(SplashScreen.hideAsync).mockClear());

test('renders the app and hides the splash once fonts and the database are ready', async () => {
  mockFontState = [true, null];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(await screen.findByText('child screen')).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('still renders with system fonts when font loading fails', async () => {
  mockFontState = [false, new Error('font download failed')];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(await screen.findByText('child screen')).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('keeps the splash up while fonts are loading', async () => {
  mockFontState = [false, null];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(screen.queryByText('child screen')).toBeNull();
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
});

test('keeps the splash up while the database is opening', async () => {
  mockFontState = [true, null];
  const release = mockSqlite.hold();
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(screen.queryByText('child screen')).toBeNull();
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

  await act(async () => release());
  expect(await screen.findByText('child screen')).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('the database is migrated before any screen shows', async () => {
  mockFontState = [true, null];
  await renderRouter({ _layout: RootLayout, index: Child });
  await screen.findByText('child screen');
  expect(await mockSqlite.db().getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
});

test('a database that fails to open shows a start error with Retry, never a blank app', async () => {
  mockFontState = [true, null];
  mockSqlite.failNextInit = new Error('disk I/O error');
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(await screen.findByRole('header', { name: "Rebloom couldn't start" })).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('child screen')).toBeOnTheScreen();
});
