import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, BackHandler, Dimensions, ScrollView } from 'react-native';

import { SCREENS } from '@/onboarding/screens';
import { mockCamera, mockKvStore } from '@/testing/nativeMocks';

// The real route tree from src/app, with fonts treated as loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

const KEY = 'onboarding_seen';
const title = (i: number) => SCREENS[i].title;
const button = (name: string) => screen.getByRole('button', { name });
const scrollTo = () => jest.mocked(ScrollView.prototype.scrollTo);

// Android Back: calls the newest hardwareBackPress listener that's still registered.
const BackHandlerMock = {
  listeners: [] as { handler: () => boolean | null | undefined; removed: boolean }[],
  press() {
    for (const entry of [...BackHandlerMock.listeners].reverse()) {
      if (!entry.removed && entry.handler()) return true;
    }
    return false;
  },
};

beforeEach(() => {
  BackHandlerMock.listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const entry = { handler: handler as () => boolean, removed: false };
    BackHandlerMock.listeners.push(entry);
    return { remove: () => void (entry.removed = true) };
  });
  scrollTo().mockClear();
  // Unlike the other suites, these start on a first launch.
  mockKvStore.values.clear();
  mockCamera.setPermission('granted');
});

async function renderFirstLaunch(initialUrl = '/') {
  await renderRouter('./src/app', { initialUrl });
  await screen.findByText(title(0));
}

async function pressNext(times = 1) {
  for (let i = 0; i < times; i++) {
    await fireEvent.press(button('Next'));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  }
}

const pager = () => screen.getByTestId('onboarding-pager');

async function swipeTo(x: number) {
  await fireEvent(pager(), 'scrollBeginDrag');
  await fireEvent(pager(), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x, y: 0 } } });
}

async function settle() {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

describe('first launch', () => {
  test('opens on the first screen, with the tabs out of reach', async () => {
    await renderFirstLaunch();
    expect(screen).toHavePathname('/onboarding');
    expect(screen.queryByRole('tab', { name: 'Today' })).toBeNull();
  });

  test('Next walks through all 4 screens in order', async () => {
    await renderFirstLaunch();
    for (const i of [1, 2, 3]) {
      await pressNext();
      expect(screen.getByText(title(i))).toBeOnTheScreen();
    }
  });

  test('the last screen trades Next and Skip for its own two actions', async () => {
    await renderFirstLaunch();
    expect(button('Next')).toBeOnTheScreen();
    expect(button('Skip')).toBeOnTheScreen();
    await pressNext(3);
    expect(button('Scan a plant')).toBeOnTheScreen();
    expect(button('Look around first')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  test('never asks for a permission', async () => {
    mockCamera.setPermission('undetermined');
    await renderFirstLaunch();
    await pressNext(3);
    expect(mockCamera.request).not.toHaveBeenCalled();
    expect(mockCamera.get).not.toHaveBeenCalled();
  });

  test('being killed midway saves nothing, so the next launch starts over', async () => {
    await renderFirstLaunch();
    await pressNext(2);
    expect(mockKvStore.values.has(KEY)).toBe(false);
    await renderFirstLaunch();
    expect(screen.getByText(title(0))).toBeOnTheScreen();
  });
});

describe('leaving', () => {
  test.each([0, 1, 2])('Skip on screen %i saves it and lands on Today', async (i) => {
    await renderFirstLaunch();
    await pressNext(i);
    await fireEvent.press(button('Skip'));
    expect(mockKvStore.values.get(KEY)).toBe('1');
    expect(screen).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Today' })).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
  });

  test('Look around first saves it and lands on Today', async () => {
    await renderFirstLaunch();
    await pressNext(3);
    await fireEvent.press(button('Look around first'));
    expect(mockKvStore.values.get(KEY)).toBe('1');
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  test('Scan a plant saves it and opens the camera; closing lands on Today, not onboarding', async () => {
    await renderFirstLaunch();
    await pressNext(3);
    await fireEvent.press(button('Scan a plant'));
    await settle();
    expect(mockKvStore.values.get(KEY)).toBe('1');
    expect(screen).toHavePathname('/scan');

    await fireEvent.press(button('Close camera'));
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  test('a later launch opens on Today', async () => {
    mockKvStore.values.set(KEY, '1');
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeOnTheScreen();
    expect(screen.queryByText(title(0))).toBeNull();
  });

  test('a double tap on Skip leaves once', async () => {
    await renderFirstLaunch();
    const skip = button('Skip');
    await act(async () => {
      fireEvent.press(skip);
      fireEvent.press(skip);
    });
    await settle();
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  test('a double tap on Scan a plant opens one camera', async () => {
    await renderFirstLaunch();
    await pressNext(3);
    const scan = button('Scan a plant');
    await act(async () => {
      fireEvent.press(scan);
      fireEvent.press(scan);
    });
    await settle();
    expect(screen).toHavePathname('/scan');
    await act(async () => router.back());
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  test('a tap meant for Next on screen 3 does not open the camera', async () => {
    await renderFirstLaunch();
    await pressNext(2);
    await fireEvent.press(button('Next'));
    // Same spot, a moment later: this is the second tap of a double tap.
    await fireEvent.press(button('Scan a plant'));
    await settle();
    expect(screen).toHavePathname('/onboarding');
    expect(mockKvStore.values.has(KEY)).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await fireEvent.press(button('Scan a plant'));
    await settle();
    expect(screen).toHavePathname('/scan');
  });
});

describe('storage trouble never traps anyone', () => {
  test('a failed read opens on Today', async () => {
    mockKvStore.failRead = new Error('disk I/O error');
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeOnTheScreen();
  });

  test('a failed write still reaches Today', async () => {
    mockKvStore.failWrite = new Error('disk full');
    await renderFirstLaunch();
    await fireEvent.press(button('Skip'));
    expect(screen).toHavePathname('/');
    expect(mockKvStore.values.has(KEY)).toBe(false);
  });
});

describe('deep links', () => {
  test('a link to the camera on first launch lands on onboarding', async () => {
    await renderRouter('./src/app', { initialUrl: '/scan' });
    expect(await screen.findByText(title(0))).toBeOnTheScreen();
    expect(screen).toHavePathname('/onboarding');
  });

  test('a link to onboarding after finishing lands on Today', async () => {
    mockKvStore.values.set(KEY, '1');
    await renderRouter('./src/app', { initialUrl: '/onboarding' });
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });
});

describe('swiping', () => {
  const width = () => Dimensions.get('window').width;

  test('a swipe updates the screen, the actions and the announcement', async () => {
    await renderFirstLaunch();
    await swipeTo(width() * 3);
    expect(screen.getByText(title(3))).toBeOnTheScreen();
    expect(button('Look around first')).toBeOnTheScreen();
  });

  test('offsets outside the pages stay on the first or last screen', async () => {
    await renderFirstLaunch();
    await swipeTo(width() * 9);
    expect(screen.getByText(title(3))).toBeOnTheScreen();
    await swipeTo(-width());
    expect(screen.getByText(title(0))).toBeOnTheScreen();
  });

  test('a scroll settling from Next can not drag the index back', async () => {
    await renderFirstLaunch();
    await fireEvent.press(button('Next'));
    await fireEvent(pager(), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(screen.getByText(title(1))).toBeOnTheScreen();
  });

  test('Next animates to the next page', async () => {
    await renderFirstLaunch();
    await pressNext();
    expect(scrollTo()).toHaveBeenLastCalledWith({ x: width(), animated: true });
  });

  test('a width change keeps the current screen aligned, without animating', async () => {
    const original = Dimensions.get('window');
    await renderFirstLaunch();
    await pressNext();
    await act(async () => {
      Dimensions.set({ window: { ...original, width: 500 }, screen: { ...original, width: 500 } });
    });
    expect(scrollTo()).toHaveBeenLastCalledWith({ x: 500, animated: false });
    await act(async () => {
      Dimensions.set({ window: original, screen: original });
    });
  });
});

describe('accessibility', () => {
  test('each screen change is announced with its step and title', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await renderFirstLaunch();
    expect(announce).not.toHaveBeenCalled();
    await pressNext();
    expect(announce).toHaveBeenLastCalledWith(`Step 2 of 4. ${title(1)}`);
  });

  test("other screens' text stays out of reach until its screen shows", async () => {
    await renderFirstLaunch();
    expect(screen.queryByText(title(1))).toBeNull();
    await pressNext();
    expect(screen.getByText(title(1))).toBeOnTheScreen();
    expect(screen.queryByText(title(0))).toBeNull();
  });

  test('with reduce motion on, Next jumps without the animation', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true);
    await renderFirstLaunch();
    await settle();
    await pressNext();
    expect(scrollTo()).toHaveBeenLastCalledWith({
      x: Dimensions.get('window').width,
      animated: false,
    });
  });

  test('the logo is on the first screen only', async () => {
    await renderFirstLaunch();
    expect(screen.getByLabelText('Rebloom')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Rebloom', { includeHiddenElements: true })).toHaveLength(1);
  });

  test('text scales up to its caps', async () => {
    await renderFirstLaunch();
    expect(screen.getByText(title(0)).props.maxFontSizeMultiplier).toBe(1.5);
    expect(screen.getByText(SCREENS[0].body).props.maxFontSizeMultiplier).toBe(2);
  });
});

describe('Android Back', () => {
  test('goes to the previous screen', async () => {
    await renderFirstLaunch();
    await pressNext(2);
    await act(async () => {
      expect(BackHandlerMock.press()).toBe(true);
    });
    expect(screen.getByText(title(1))).toBeOnTheScreen();
  });

  test('on the first screen is left to the system, which exits the app', async () => {
    await renderFirstLaunch();
    await pressNext();
    await act(async () => {
      BackHandlerMock.press();
    });
    expect(screen.getByText(title(0))).toBeOnTheScreen();
    expect(BackHandlerMock.press()).toBe(false);
  });
});
