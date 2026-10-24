import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeedbackSheet } from '../FeedbackSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(onSubmit: jest.Mock = jest.fn(async () => {})) {
  const onClose = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FeedbackSheet
        visible
        conditionName="Overwatering"
        alternatives={[
          { id: 'underwatering', name: 'Underwatering' },
          { id: 'low_light', name: 'Not enough light' },
        ]}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </SafeAreaProvider>,
  );
  return { view, onSubmit, onClose };
}

test('asks about the diagnosis by name', async () => {
  const { view } = renderSheet();
  await view;
  expect(screen.getByRole('header', { name: 'Was "Overwatering" right?' })).toBeOnTheScreen();
});

test.each([
  ['Yes', 'yes'],
  ['Not sure', 'not_sure'],
])('"%s" saves straight away and thanks the user', async (button, verdict) => {
  const { view, onSubmit } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: button }));
  expect(onSubmit).toHaveBeenCalledWith({ verdict, userGuess: null });
  expect(screen.getByText('Thanks! Your answer is saved.')).toBeOnTheScreen();
});

test('"No" asks what it is, offering the other causes or something else', async () => {
  const { view, onSubmit } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'No' }));
  expect(screen.getByRole('header', { name: 'What do you think it is?' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Underwatering' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Not enough light' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Something else' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save my answer' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('radio', { name: 'Not enough light' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save my answer' }));
  expect(onSubmit).toHaveBeenCalledWith({ verdict: 'no', userGuess: 'low_light' });
  expect(screen.getByText('Thanks! Your answer is saved.')).toBeOnTheScreen();
});

test('"Something else" is stored as such', async () => {
  const { view, onSubmit } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'No' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save my answer' }));
  expect(onSubmit).toHaveBeenCalledWith({ verdict: 'no', userGuess: 'something_else' });
});

test('never promises a second look', async () => {
  const { view } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'No' }));
  expect(screen.queryByText(/second look/i)).toBeNull();
});

test('a failed save says so and lets the user try again', async () => {
  const onSubmit = jest
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockResolvedValueOnce(undefined);
  const { view } = renderSheet(onSubmit);
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
  expect(screen.getByText("Couldn't save your answer. Try again.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
  expect(screen.getByText('Thanks! Your answer is saved.')).toBeOnTheScreen();
});

test('Done closes the sheet', async () => {
  const { view, onClose } = renderSheet();
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(onClose).toHaveBeenCalled();
});
