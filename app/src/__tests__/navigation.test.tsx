import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import { mockCamera } from '@/testing/nativeMocks';

// The real route tree from src/app, with fonts treated as loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

// Android Back: calls the newest hardwareBackPress listener that's still
// registered. If none handles it, the OS default runs: pop if there's history,
// otherwise leave the app (here: nothing happens, so the path stays put).
const androidBack = {
  listeners: [] as { handler: () => boolean | null | undefined; removed: boolean }[],
  async press() {
    await act(async () => {
      for (const entry of [...androidBack.listeners].reverse()) {
        if (!entry.removed && entry.handler()) return;
      }
      if (router.canGoBack()) router.back();
    });
  },
};

beforeEach(() => {
  androidBack.listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const entry = { handler: handler as () => boolean, removed: false };
    androidBack.listeners.push(entry);
    return { remove: () => void (entry.removed = true) };
  });
  // Navigation, not permissions, is under test here.
  mockCamera.setPermission('granted');
});

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

// Cold start from a rebloom:// link: no history under the route, so a plain
// router.back() has nowhere to go. Every exit must still leave the screen.
describe('cold link with no history', () => {
  test('Close camera on /scan goes to Today', async () => {
    await renderRouter('./src/app', { initialUrl: '/scan' });
    const close = await screen.findByRole('button', { name: 'Close camera' });
    expect(screen).toHavePathname('/scan');

    await fireEvent.press(close);
    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeSelected();
  });

  test('Back on /scan/treatment goes to Today', async () => {
    await renderRouter('./src/app', { initialUrl: '/scan/treatment' });
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(screen).toHavePathname('/scan/treatment');

    await fireEvent.press(back);
    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeSelected();
  });

  test('Settings has a Back button that goes to Today', async () => {
    await renderRouter('./src/app', { initialUrl: '/settings' });
    await screen.findByRole('header', { name: 'Settings' });
    expect(screen).toHavePathname('/settings');

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeSelected();
  });

  // No scan in progress: these redirect to the camera, which must still close.
  test.each(['/scan/analyzing', '/scan/questions', '/scan/result'])(
    '%s lands on the camera, and Close camera goes to Today',
    async (initialUrl) => {
      await renderRouter('./src/app', { initialUrl });
      const close = await screen.findByRole('button', { name: 'Close camera' });
      expect(screen).toHavePathname('/scan');

      await fireEvent.press(close);
      expect(screen).toHavePathname('/');
      expect(await screen.findByRole('tab', { name: 'Today' })).toBeSelected();
    },
  );
});

// With history the native back button stays (it isn't in the jest tree); the
// fallback must not add a second one beside it.
test('Settings opened from Today shows no fallback Back', async () => {
  await renderApp();
  await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
  await screen.findByRole('header', { name: 'Settings' });
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
});

// Android system Back on a cold link: with nothing beneath, the OS default
// would close the app. It must go to Today, like the on-screen exit.
describe('Android Back on a cold link', () => {
  test.each([
    ['/scan', 'button', 'Close camera'],
    ['/scan/treatment', 'header', 'Treatment plan'],
    ['/settings', 'header', 'Settings'],
  ] as const)('%s goes to Today', async (initialUrl, role, name) => {
    await renderRouter('./src/app', { initialUrl });
    await screen.findByRole(role, { name });
    expect(screen).toHavePathname(initialUrl);

    await androidBack.press();
    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeSelected();
  });

  test('on /scan, Back closes the camera-permission sheet before leaving', async () => {
    mockCamera.setPermission('undetermined');
    await renderRouter('./src/app', { initialUrl: '/scan' });
    await screen.findByRole('button', { name: 'Choose a photo instead' });

    await androidBack.press();
    expect(screen).toHavePathname('/scan');
    expect(await screen.findByText('Camera is off')).toBeOnTheScreen();

    await androidBack.press();
    expect(screen).toHavePathname('/');
  });
});

describe('Android Back with history is unchanged', () => {
  test('Settings opened from Today returns to Today', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
    await screen.findByRole('header', { name: 'Settings' });

    await androidBack.press();
    expect(screen).toHavePathname('/');
  });

  test('Scan opened from My Plants returns to My Plants', async () => {
    await renderApp('/plants');
    await fireEvent.press(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByRole('button', { name: 'Close camera' });

    await androidBack.press();
    expect(screen).toHavePathname('/plants');
  });
});
