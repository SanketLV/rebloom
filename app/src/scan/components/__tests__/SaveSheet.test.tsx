import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SaveSheet } from '../SaveSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(props: Partial<React.ComponentProps<typeof SaveSheet>> = {}) {
  const onSave = jest.fn(async () => {});
  const onClose = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SaveSheet visible rooms={['Balcony']} onSave={onSave} onClose={onClose} {...props} />
    </SafeAreaProvider>,
  );
  return { view, onSave: (props.onSave as jest.Mock | undefined) ?? onSave, onClose };
}

const nameField = () => screen.getByLabelText('Name');
const saveButton = () => screen.getByRole('button', { name: 'Save plant' });

test('starts with "My plant" and no room', async () => {
  const { view, onSave } = renderSheet();
  await view;
  expect(nameField().props.value).toBe('My plant');
  await fireEvent.press(saveButton());
  expect(onSave).toHaveBeenCalledWith({ name: 'My plant', room: null });
});

test('a blank name cannot be saved', async () => {
  const { view, onSave } = renderSheet();
  await view;
  await fireEvent.changeText(nameField(), '    ');
  expect(saveButton()).toBeDisabled();
  await fireEvent.press(saveButton());
  expect(onSave).not.toHaveBeenCalled();
});

test('a pasted name is cut to 40 whole characters', async () => {
  const { view } = renderSheet();
  await view;
  await fireEvent.changeText(nameField(), '🌱'.repeat(41));
  expect(nameField().props.value).toBe('🌱'.repeat(40));
  expect(nameField().props.maxLength).toBeUndefined();
});

test('offers the usual rooms plus the ones already used, once each', async () => {
  const { view } = renderSheet({ rooms: ['Balcony', 'Kitchen'] });
  await view;
  for (const room of ['Living room', 'Bedroom', 'Kitchen', 'Balcony']) {
    expect(screen.getAllByRole('button', { name: room })).toHaveLength(1);
  }
});

test('picking a room saves it, and tapping it again clears it', async () => {
  const { view, onSave } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Kitchen' }));
  expect(screen.getByRole('button', { name: 'Kitchen' })).toBeSelected();
  await fireEvent.press(saveButton());
  expect(onSave).toHaveBeenLastCalledWith({ name: 'My plant', room: 'Kitchen' });

  await fireEvent.press(screen.getByRole('button', { name: 'Kitchen' }));
  expect(screen.getByRole('button', { name: 'Kitchen' })).not.toBeSelected();
});

test('"+ New room" adds a room of up to 30 characters', async () => {
  const { view, onSave } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'New room' }));
  await fireEvent.changeText(
    screen.getByLabelText('New room name'),
    'Sunroom upstairs by the window!!',
  );
  expect(screen.getByLabelText('New room name').props.value).toHaveLength(30);
  await fireEvent.press(saveButton());
  expect(onSave).toHaveBeenCalledWith({ name: 'My plant', room: 'Sunroom upstairs by the window' });
});

test('a double tap on Save saves once', async () => {
  let finish!: () => void;
  const onSave = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const { view } = renderSheet({ onSave });
  await view;
  await act(async () => {
    fireEvent.press(saveButton());
    fireEvent.press(saveButton());
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

test('a failed save says so and keeps the sheet open', async () => {
  const onSave = jest.fn(async () => {
    throw new Error('disk full');
  });
  const { view, onClose } = renderSheet({ onSave });
  await view;
  await fireEvent.press(saveButton());
  expect(screen.getByText("Couldn't save the plant. Try again.")).toBeOnTheScreen();
  expect(saveButton()).toBeOnTheScreen();
  expect(onClose).not.toHaveBeenCalled();
});

test('"Not now" closes the sheet', async () => {
  const { view, onClose } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(onClose).toHaveBeenCalled();
});
