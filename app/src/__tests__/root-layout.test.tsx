import { screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';

let mockFontState: [boolean, Error | null] = [true, null];
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => mockFontState }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const Child = () => <Text>child screen</Text>;

beforeEach(() => jest.mocked(SplashScreen.hideAsync).mockClear());

test('renders the app and hides the splash once fonts load', async () => {
  mockFontState = [true, null];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(screen.getByText('child screen')).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('still renders with system fonts when font loading fails', async () => {
  mockFontState = [false, new Error('font download failed')];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(screen.getByText('child screen')).toBeOnTheScreen();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('keeps the splash up while fonts are loading', async () => {
  mockFontState = [false, null];
  await renderRouter({ _layout: RootLayout, index: Child });
  expect(screen.queryByText('child screen')).toBeNull();
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
});
