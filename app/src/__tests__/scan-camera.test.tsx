import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { AppState, Linking } from 'react-native';

import { CACHE, DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { mockCamera, mockPicker } from '@/testing/nativeMocks';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

afterEach(() => jest.restoreAllMocks());

// Waits for the camera screen, which is hidden from screen readers while a sheet is open.
async function openScan() {
  const view = await renderRouter('./src/app', { initialUrl: '/scan' });
  await screen.findByRole('button', { name: 'Close camera', includeHiddenElements: true });
  return view;
}

const shutter = () => screen.getByRole('button', { name: 'Take photo' });

describe('opening Scan', () => {
  test('sweeps temp photos left by an earlier scan before the camera starts', async () => {
    fakeFs.put(`${CACHE}/scans/left-over.jpg`);
    fakeFs.put(`${DOCUMENT}/photos/saved.jpg`);
    await openScan();
    expect(fakeFs.has(`${CACHE}/scans/left-over.jpg`)).toBe(false);
    expect(fakeFs.has(`${DOCUMENT}/photos/saved.jpg`)).toBe(true);
  });
});

describe('camera permission', () => {
  test('first time: explains, asks, then shows the camera', async () => {
    await openScan();
    expect(screen.getByText('Rebloom needs your camera to scan leaves')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-view')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(mockCamera.request).toHaveBeenCalled();
    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
    expect(screen.queryByText('Rebloom needs your camera to scan leaves')).toBeNull();
  });

  test('already granted: straight to the camera', async () => {
    mockCamera.setPermission('granted');
    await openScan();
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen();
    expect(screen.queryByText('Rebloom needs your camera to scan leaves')).toBeNull();
  });

  test('blocked for good: offers Settings and a photo instead', async () => {
    mockCamera.setPermission('denied', false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await openScan();
    expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  test('choosing a photo instead opens the gallery and moves on', async () => {
    mockCamera.setPermission('denied', false);
    const view = await openScan();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo instead' }));
    expect(mockPicker.launch).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'] }),
    );
    expect(view).toHavePathname('/scan/analyzing');
  });

  test('granted in Settings: back in the app, the camera starts', async () => {
    mockCamera.setPermission('denied', false);
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.push(handler as (state: string) => void);
      return { remove: jest.fn() };
    });
    await openScan();
    expect(screen.queryByTestId('camera-view')).toBeNull();

    mockCamera.setPermission('granted');
    await act(async () => listeners.forEach((listener) => listener('active')));
    expect(mockCamera.get).toHaveBeenCalled();
    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
  });

  test('closing the sheet while the camera is off leaves a way forward on screen', async () => {
    mockCamera.setPermission('denied', false);
    await openScan();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Rebloom needs your camera to scan leaves')).toBeNull();
    expect(screen.getByText('Camera is off')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose a photo instead' })).toBeOnTheScreen();
  });
});

describe('taking a photo', () => {
  beforeEach(() => mockCamera.setPermission('granted'));

  test('the shutter waits until the camera is ready', async () => {
    mockCamera.autoReady = false;
    await openScan();
    expect(shutter()).toBeDisabled();
    await act(async () => mockCamera.becomeReady());
    expect(shutter()).toBeEnabled();
  });

  test('a photo starts the scan and opens Analyzing', async () => {
    const view = await openScan();
    await fireEvent.press(shutter());
    expect(mockCamera.takePicture).toHaveBeenCalledTimes(1);
    expect(view).toHavePathname('/scan/analyzing');
  });

  test('a double tap takes one photo', async () => {
    await openScan();
    await act(async () => {
      fireEvent.press(shutter());
      fireEvent.press(shutter());
    });
    expect(mockCamera.takePicture).toHaveBeenCalledTimes(1);
  });

  test('cancelling the gallery stays on the camera with no error', async () => {
    mockPicker.next = undefined;
    const view = await openScan();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose from photos' }));
    expect(mockPicker.launch).toHaveBeenCalled();
    expect(view).toHavePathname('/scan');
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen();
  });

  test('photo tips open and close', async () => {
    await openScan();
    await fireEvent.press(screen.getByRole('button', { name: 'Photo tips' }));
    expect(screen.getByText('Tips for a good scan')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('Tips for a good scan')).toBeNull();
  });

  test('shows the framing prompt and the offline promise', async () => {
    await openScan();
    expect(screen.getByText('Fill the frame with the sick leaf')).toBeOnTheScreen();
    expect(screen.getByText('Runs on your phone · works offline')).toBeOnTheScreen();
  });
});

test('cancelling the gallery while the camera is still blocked shows the permission sheet again', async () => {
  mockCamera.setPermission('denied', false);
  mockPicker.next = undefined;
  await openScan();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo instead' }));
  expect(mockPicker.launch).toHaveBeenCalled();
  expect(await screen.findByText('Rebloom needs your camera to scan leaves')).toBeOnTheScreen();
});
