import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { colors, touchTarget } from '@/theme/tokens';

import { TextField } from '../TextField';

test('shows its label, reports typing, and is at least 44pt tall', async () => {
  const onChangeText = jest.fn();
  await render(<TextField label="Email" value="" onChangeText={onChangeText} />);
  const field = screen.getByLabelText('Email');
  await fireEvent.changeText(field, 'sam@example.com');
  expect(onChangeText).toHaveBeenCalledWith('sam@example.com');
  expect(screen.getByText('Email', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(field).toHaveStyle({ minHeight: touchTarget + 10 });
});

test('an error is shown, read with the field, and marks the border', async () => {
  await render(
    <TextField label="6-digit code" value="12" onChangeText={jest.fn()} error="That code isn't right." />,
  );
  expect(screen.getByText("That code isn't right.", { includeHiddenElements: true })).toBeOnTheScreen();
  const field = screen.getByLabelText('6-digit code');
  expect(field.props.accessibilityHint).toBe("That code isn't right.");
  expect(field).toHaveStyle({ borderColor: colors.severe });
});

test('passes keyboard and autofill props through to the input', async () => {
  await render(
    <TextField
      label="Email"
      value=""
      onChangeText={jest.fn()}
      keyboardType="email-address"
      autoComplete="email"
      autoCorrect={false}
    />,
  );
  const field = screen.getByLabelText('Email');
  expect(field.props.keyboardType).toBe('email-address');
  expect(field.props.autoComplete).toBe('email');
  expect(field.props.autoCorrect).toBe(false);
});

// Review round 1, #3: accessibilityLiveRegion is Android-only, so iOS heard nothing.
test('a new error is announced to screen readers, once', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
  const view = await render(<TextField label="Email" value="" onChangeText={jest.fn()} />);
  expect(announce).not.toHaveBeenCalled();
  await view.rerender(<TextField label="Email" value="" onChangeText={jest.fn()} error="You're offline." />);
  await view.rerender(<TextField label="Email" value="x" onChangeText={jest.fn()} error="You're offline." />);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith("You're offline.");
  announce.mockRestore();
});

// Review round 1, #10: the label is in the input's own accessibility label; don't read it twice.
test('the visible label and error are not separate screen-reader stops', async () => {
  await render(<TextField label="Email" value="" onChangeText={jest.fn()} error="Check the address." />);
  expect(screen.queryByText('Email')).toBeNull(); // hidden from accessibility
  expect(screen.getByText('Email', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText('Check the address.')).toBeNull();
  expect(screen.getByLabelText('Email').props.accessibilityHint).toBe('Check the address.');
});
