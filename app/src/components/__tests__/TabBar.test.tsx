import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { TabBar } from '../TabBar';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

async function renderBar({ focusedIndex = 0, bottomInset = 0 } = {}) {
  const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) };
  const navigateToTab = jest.fn();
  const routes = [
    { key: 'index-key', name: 'index' },
    { key: 'plants-key', name: 'plants' },
  ];
  const props = {
    state: { index: focusedIndex, routes },
    descriptors: {
      'index-key': { options: { title: 'Today' } },
      'plants-key': { options: { title: 'My Plants' } },
    },
    emitter,
    navigateToTab,
    insets: { top: 0, right: 0, bottom: bottomInset, left: 0 },
  } as unknown as BottomTabBarProps;
  await render(<TabBar {...props} />);
  return { emitter, navigateToTab };
}

beforeEach(() => mockPush.mockClear());

test('renders Today and My Plants as tabs and Scan as a button', async () => {
  await renderBar();
  expect(screen.getByRole('tab', { name: 'Today' })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'My Plants' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan' })).toBeOnTheScreen();
});

test('marks only the focused tab as selected', async () => {
  await renderBar({ focusedIndex: 1 });
  expect(screen.getByRole('tab', { name: 'My Plants' })).toBeSelected();
  expect(screen.getByRole('tab', { name: 'Today' })).not.toBeSelected();
});

test('Scan opens the scan modal instead of switching tabs', async () => {
  const { navigateToTab } = await renderBar();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan' }));
  expect(mockPush).toHaveBeenCalledWith('/scan');
  expect(navigateToTab).not.toHaveBeenCalled();
});

test('pressing an unfocused tab emits tabPress and navigates', async () => {
  const { emitter, navigateToTab } = await renderBar();
  await fireEvent.press(screen.getByRole('tab', { name: 'My Plants' }));
  expect(emitter.emit).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'tabPress', target: 'plants-key', canPreventDefault: true }),
  );
  expect(navigateToTab).toHaveBeenCalledWith('plants-key');
});

test('pressing the focused tab does not navigate', async () => {
  const { navigateToTab } = await renderBar();
  await fireEvent.press(screen.getByRole('tab', { name: 'Today' }));
  expect(navigateToTab).not.toHaveBeenCalled();
});

test('a prevented tabPress does not navigate', async () => {
  const { emitter, navigateToTab } = await renderBar();
  emitter.emit.mockReturnValue({ defaultPrevented: true });
  await fireEvent.press(screen.getByRole('tab', { name: 'My Plants' }));
  expect(navigateToTab).not.toHaveBeenCalled();
});

test('bottom padding clears the home indicator', async () => {
  await renderBar({ bottomInset: 34 });
  expect(screen.getByTestId('tab-bar')).toHaveStyle({ paddingBottom: 42 });
});

test('bottom padding stays comfortable with no inset', async () => {
  await renderBar();
  expect(screen.getByTestId('tab-bar')).toHaveStyle({ paddingBottom: 16 });
});
