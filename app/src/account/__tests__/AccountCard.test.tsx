import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import type { AccountState } from '../store';

let mockState: AccountState = { status: 'guest' };
const mockRefresh = jest.fn(async () => {});

jest.mock('../store', () => ({
  useAccount: () => mockState,
  refreshAccount: () => mockRefresh(),
}));

// eslint-disable-next-line import/first
import SettingsScreen from '@/app/settings';

const AccountRoute = () => <Text>account route</Text>;

async function renderSettings(state: AccountState) {
  mockState = state;
  await renderRouter(
    { settings: SettingsScreen, 'account/index': AccountRoute },
    { initialUrl: '/settings' },
  );
}

const sam = { id: 'u-1', email: 'sam@example.com', provider: 'google' };

test('guest: plants on this phone only, "Save plants" opens the account screen', async () => {
  await renderSettings({ status: 'guest' });
  expect(screen.getByText('Guest')).toBeOnTheScreen();
  expect(screen.getByText('Plants are saved on this phone only')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save plants' }));
  expect(screen).toHavePathname('/account');
});

test('signed in: the email and method, "Account" opens the account screen', async () => {
  await renderSettings({ status: 'signed_in', user: sam });
  expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
  expect(screen.getByText('Signed in with Google')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Account' }));
  expect(screen).toHavePathname('/account');
});

test.each([
  ['email', 'Signed in with email'],
  ['apple', 'Signed in with Apple'],
  [null, 'Signed in'],
  ['github', 'Signed in'],
])('method %s → %s', async (provider, line) => {
  await renderSettings({ status: 'signed_in', user: { ...sam, provider } });
  expect(screen.getByText(line)).toBeOnTheScreen();
});

test('the server ended the session: "Signed out" and "Sign in"', async () => {
  await renderSettings({ status: 'expired' });
  expect(screen.getByText('Signed out')).toBeOnTheScreen();
  expect(screen.getByText('Sign in again to keep your account')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen).toHavePathname('/account');
});

test('after a delete: guest, and says the account is deleted', async () => {
  await renderSettings({ status: 'guest', notice: 'deleted' });
  expect(screen.getByText('Your account is deleted.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save plants' })).toBeOnTheScreen();
});

test('offline: says so, and "Try again" reads the account again', async () => {
  await renderSettings({ status: 'offline' });
  expect(screen.getByText("Can't check your account right now")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

test('loading: a busy card with no buttons yet', async () => {
  await renderSettings({ status: 'loading' });
  expect(screen.getByLabelText('Checking your account')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Save plants' })).toBeNull();
});

test('backend not configured: no account card at all', async () => {
  await renderSettings({ status: 'unconfigured' });
  expect(screen.queryByText('Guest')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save plants' })).toBeNull();
  expect(screen.getByText(/Becomes artboard 16 Settings/)).toBeOnTheScreen();
});

test('long emails do not push the button off the card', async () => {
  const email = `${'a'.repeat(60)}@${'b'.repeat(60)}.com`;
  await renderSettings({ status: 'signed_in', user: { ...sam, email } });
  expect(screen.getByText(email).props.numberOfLines).toBe(1);
});
