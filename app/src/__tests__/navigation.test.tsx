import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { mockCamera } from '@/testing/nativeMocks';

// The real route tree from src/app, with fonts treated as loaded.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => [true, null] }));

// Navigation, not permissions, is under test here.
beforeEach(() => mockCamera.setPermission('granted'));

// Screens appear once the local database has opened.
async function renderApp(initialUrl = '/') {
  await renderRouter('./src/app', { initialUrl });
  await screen.findByRole('tab', { name: 'Today' });
}

test('profile icon on Today opens Settings', async () => {
  await renderApp();
  await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
  expect(screen).toHavePathname('/settings');
});

test('Scan opens the camera modal and close returns to Today', async () => {
  await renderApp();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan' }));
  expect(screen).toHavePathname('/scan');

  await fireEvent.press(screen.getByRole('button', { name: 'Close camera' }));
  expect(screen).toHavePathname('/');
});

test('closing Scan returns to the tab it was opened from', async () => {
  await renderApp('/plants');
  await fireEvent.press(screen.getByRole('button', { name: 'Scan' }));
  expect(screen).toHavePathname('/scan');

  await fireEvent.press(screen.getByRole('button', { name: 'Close camera' }));
  expect(screen).toHavePathname('/plants');
});

test('tab bar switches between Today and My Plants', async () => {
  await renderApp();
  await fireEvent.press(screen.getByRole('tab', { name: 'My Plants' }));
  expect(screen).toHavePathname('/plants');
  expect(screen.getByRole('tab', { name: 'My Plants' })).toBeSelected();
});
