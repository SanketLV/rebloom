import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors, touchTarget } from '@/theme/tokens';

import { TextField } from '../TextField';

test('shows its label, reports typing, and is at least 44pt tall', async () => {
  const onChangeText = jest.fn();
  await render(<TextField label="Email" value="" onChangeText={onChangeText} />);
  const field = screen.getByLabelText('Email');
  await fireEvent.changeText(field, 'sam@example.com');
  expect(onChangeText).toHaveBeenCalledWith('sam@example.com');
  expect(screen.getByText('Email')).toBeOnTheScreen();
  expect(field).toHaveStyle({ minHeight: touchTarget + 10 });
});

test('an error is shown, read with the field, and marks the border', async () => {
  await render(
    <TextField label="6-digit code" value="12" onChangeText={jest.fn()} error="That code isn't right." />,
  );
  expect(screen.getByText("That code isn't right.")).toBeOnTheScreen();
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
