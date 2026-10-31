import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomSheet } from '../BottomSheet';

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
const pressBack = (listener: BackListener) => listener({} as Parameters<BackListener>[0]);

afterEach(() => jest.restoreAllMocks());

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
  const onClose = jest.fn();
  return {
    onClose,
    view: render(
      <SafeAreaProvider initialMetrics={metrics}>
        <BottomSheet visible label="Photo tips" onClose={onClose} {...props}>
          <Text>Hold steady</Text>
        </BottomSheet>
      </SafeAreaProvider>,
    ),
  };
}

test('shows its content as a modal dialog when visible', async () => {
  const { view } = renderSheet();
  await view;
  const sheet = screen.getByLabelText('Photo tips');
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(screen.getByText('Hold steady')).toBeOnTheScreen();
});

test('renders nothing when hidden', async () => {
  const { view } = renderSheet({ visible: false });
  await view;
  expect(screen.queryByText('Hold steady')).toBeNull();
});

test('tapping the dimmed area closes it', async () => {
  const { view, onClose } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Android Back closes it and is consumed', async () => {
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler);
    return { remove: jest.fn() };
  });
  const { view, onClose } = renderSheet();
  await view;
  expect(listeners).toHaveLength(1);
  expect(pressBack(listeners[0])).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a sheet that cannot be dismissed ignores Back and the dimmed area', async () => {
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler);
    return { remove: jest.fn() };
  });
  const { view, onClose } = renderSheet({ dismissible: false });
  await view;
  expect(pressBack(listeners[0])).toBe(true);
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test('clears the bottom safe area', async () => {
  const { view } = renderSheet();
  await view;
  const sheet = screen.getByLabelText('Photo tips');
  const style = [sheet.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});
  expect(style.paddingBottom).toBeGreaterThanOrEqual(34);
});
