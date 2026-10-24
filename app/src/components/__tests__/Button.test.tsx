import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, TextButton } from '../Button';

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
