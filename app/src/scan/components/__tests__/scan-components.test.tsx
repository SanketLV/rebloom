import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Chip } from '../Chip';
import { ConfidenceBar } from '../ConfidenceBar';
import { DemoTag } from '../DemoTag';
import { ErrorState } from '../ErrorState';
import { LowConfidenceSheet } from '../LowConfidenceSheet';
import { PermissionSheet } from '../PermissionSheet';
import { TipsSheet } from '../TipsSheet';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// Promises the app can't keep yet (spec "copy changes").
const BROKEN_PROMISES = [/second look/i, /blurry/i, /closer look/i, /sent/i, /trial/i, /monstera/i];
type Node = { children?: (Node | string)[] | null } | string | null;
const textOf = (node: Node | Node[]): string =>
  Array.isArray(node)
    ? node.map(textOf).join(' ')
    : typeof node === 'string'
      ? node
      : node?.children
        ? textOf(node.children)
        : '';
const allText = () => textOf(screen.toJSON() as Node | Node[]);

// Renders, then checks the copy never makes a promise the app can't keep.
async function show(ui: ReactElement) {
  await render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
  const text = allText();
  expect(text.trim().length).toBeGreaterThan(0);
  for (const phrase of BROKEN_PROMISES) expect(text).not.toMatch(phrase);
}

describe('DemoTag', () => {
  test('short and full forms', async () => {
    await show(<DemoTag />);
    expect(screen.getByText('Demo')).toBeOnTheScreen();
  });

  test('full form for the result', async () => {
    await show(<DemoTag full />);
    expect(screen.getByText('Demo diagnosis')).toBeOnTheScreen();
  });
});

test('ConfidenceBar shows the percentage and exposes it to screen readers', async () => {
  await show(<ConfidenceBar value={0.823} />);
  expect(screen.getByText('82%')).toBeOnTheScreen();
  const bar = screen.getByRole('progressbar', { name: 'Confidence' });
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 82 });
});

test('Chip shows its label', async () => {
  await show(<Chip label="Recently repotted" />);
  expect(screen.getByText('Recently repotted')).toBeOnTheScreen();
});

describe('PermissionSheet', () => {
  const handlers = () => ({
    onAllow: jest.fn(),
    onOpenSettings: jest.fn(),
    onChoosePhoto: jest.fn(),
    onClose: jest.fn(),
  });

  test('asks for the camera, with a photo as the alternative', async () => {
    const h = handlers();
    await show(<PermissionSheet visible canAskAgain {...h} />);
    expect(screen.getByText('Rebloom needs your camera to scan leaves')).toBeOnTheScreen();
    expect(screen.getByText('Scans run on your phone.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo instead' }));
    expect(h.onAllow).toHaveBeenCalled();
    expect(h.onChoosePhoto).toHaveBeenCalled();
  });

  test('once the camera is blocked, it sends the user to Settings instead', async () => {
    const h = handlers();
    await show(<PermissionSheet visible canAskAgain={false} {...h} />);
    expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(h.onOpenSettings).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose a photo instead' })).toBeOnTheScreen();
  });
});

test('TipsSheet lists the three photo tips and closes', async () => {
  const onClose = jest.fn();
  await show(<TipsSheet visible onClose={onClose} />);
  expect(screen.getByText('Tips for a good scan')).toBeOnTheScreen();
  expect(screen.getByText('Hold steady and tap the leaf to focus')).toBeOnTheScreen();
  expect(screen.getByText('Get close so the sick leaf fills the frame')).toBeOnTheScreen();
  expect(screen.getByText('Use daylight from a window, not a lamp')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
  expect(onClose).toHaveBeenCalled();
});

test('LowConfidenceSheet is honest about why and offers both ways on', async () => {
  const onRetake = jest.fn();
  const onUseAnyway = jest.fn();
  await show(<LowConfidenceSheet visible onRetake={onRetake} onUseAnyway={onUseAnyway} />);
  expect(screen.getByText("We couldn't get a clear read")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Retake photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Use it anyway' }));
  expect(onRetake).toHaveBeenCalledTimes(1);
  expect(onUseAnyway).toHaveBeenCalledTimes(1);
});

test('ErrorState offers Try again and Scan another plant', async () => {
  const onRetry = jest.fn();
  const onScanAnother = jest.fn();
  await show(<ErrorState onRetry={onRetry} onScanAnother={onScanAnother} />);
  expect(screen.getByRole('header', { name: "We couldn't read this photo" })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Scan another plant' }));
  expect(onRetry).toHaveBeenCalled();
  expect(onScanAnother).toHaveBeenCalled();
});
