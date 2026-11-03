import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { cameraColors, colors } from '@/theme/tokens';

import { Button, TextButton } from '../Button';

test('on a dark photo, the button is light and its label dark', async () => {
  await render(<Button label="Next" tone="onDark" onPress={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Next' })).toHaveStyle({
    backgroundColor: cameraColors.text,
  });
  expect(screen.getByText('Next')).toHaveStyle({ color: colors.text });
});

test('on a dark photo, the text button is light', async () => {
  await render(<TextButton label="Skip" tone="onDark" onPress={jest.fn()} />);
  expect(screen.getByText('Skip')).toHaveStyle({ color: cameraColors.text });
});

test('labels on a dark photo stop growing at 1.3× so they fit the button', async () => {
  await render(
    <>
      <Button label="Next" tone="onDark" onPress={jest.fn()} />
      <TextButton label="Skip" tone="onDark" onPress={jest.fn()} />
    </>,
  );
  expect(screen.getByText('Next').props.maxFontSizeMultiplier).toBe(1.3);
  expect(screen.getByText('Skip').props.maxFontSizeMultiplier).toBe(1.3);
});

test('a busy spinner stays visible on the light on-dark fill', async () => {
  await render(<Button label="Next" tone="onDark" busy onPress={jest.fn()} />);
  // The label is gone while busy, so this color can only be the spinner's.
  expect(JSON.stringify(screen.toJSON())).toContain(colors.text);
});

test('the default tone stays unchanged', async () => {
  await render(<Button label="Save plant" onPress={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Save plant' })).toHaveStyle({
    backgroundColor: colors.primary,
  });
  expect(screen.getByText('Save plant').props.maxFontSizeMultiplier).toBeUndefined();
});

test('a button can show an icon beside its label', async () => {
  await render(
    <Button label="Scan a plant" icon={<Text>icon</Text>} tone="onDark" onPress={jest.fn()} />,
  );
  expect(screen.getByText('icon')).toBeOnTheScreen();
  expect(screen.getByText('Scan a plant')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan a plant' })).toHaveStyle({
    flexDirection: 'row',
  });
});

test('a label beside an icon can shrink and wrap instead of running off the button', async () => {
  await render(<Button label="Scan a plant" icon={<Text>icon</Text>} onPress={jest.fn()} />);
  expect(screen.getByText('Scan a plant')).toHaveStyle({ flexShrink: 1 });
});

test('a button with no icon keeps the column layout, where long labels wrap', async () => {
  await render(<Button label="See treatment plan anyway" onPress={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'See treatment plan anyway' })).not.toHaveStyle({
    flexDirection: 'row',
  });
});

test('a button fires onPress', async () => {
  const onPress = jest.fn();
  await render(<Button label="Save plant" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save plant' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a busy button is disabled, says so, and ignores presses', async () => {
  const onPress = jest.fn();
  await render(<Button label="Save plant" onPress={onPress} busy />);
  const button = screen.getByRole('button', { name: 'Save plant' });
  expect(button).toBeDisabled();
  expect(button).toBeBusy();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('a disabled button can show a different label', async () => {
  await render(
    <Button label="Continue" disabledLabel="Pick an answer" disabled onPress={jest.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Pick an answer' })).toBeDisabled();
});

test('a text button fires onPress and is at least 44pt tall', async () => {
  const onPress = jest.fn();
  await render(<TextButton label="Not now" onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Not now' });
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  const style = [button.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
});
