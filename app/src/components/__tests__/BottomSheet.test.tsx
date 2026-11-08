import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, Text } from 'react-native';
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
  const label = screen.getByLabelText('Photo tips');
  expect(label.props.accessible).toBe(true);
  expect(label.parent).not.toBeNull();
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
  const sheet = screen.getByLabelText('Photo tips').parent!;
  const style = [sheet.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});
  expect(style.paddingBottom).toBeGreaterThanOrEqual(34);
});

// Swarm Medium 6: opening a sheet was silent for screen readers.
// CodeRabbit: the focus event only works on an accessibility element (RN needs accessible={true}
// on the receiving node) — the sheet's plain View isn't one, so iOS silently kept the old focus.
test('an opening sheet moves screen-reader focus onto its labelled element', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  focus.mockClear();
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <BottomSheet visible={false} label="Sign out" onClose={jest.fn()}>
        <Text>Sign out?</Text>
      </BottomSheet>
    </SafeAreaProvider>,
  );
  expect(focus).not.toHaveBeenCalled();
  await view.rerender(
    <SafeAreaProvider initialMetrics={metrics}>
      <BottomSheet visible label="Sign out" onClose={jest.fn()}>
        <Text>Sign out?</Text>
      </BottomSheet>
    </SafeAreaProvider>,
  );
  expect(focus).toHaveBeenCalledTimes(1);
  const target = screen.getByLabelText('Sign out');
  expect(target.props.accessible).toBe(true);
  // Which node the focus went to, checked by props rather than instance equality: comparing two
  // ReactTestInstances structurally walks the fiber tree (cyclically) and never finishes.
  const [received, eventType] = focus.mock.calls[0] as unknown as [
    { props: { accessible?: boolean; accessibilityLabel?: string } },
    string,
  ];
  expect(eventType).toBe('focus');
  expect(received.props).toMatchObject({ accessible: true, accessibilityLabel: 'Sign out' });
  focus.mockRestore();
});
