import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, BackHandler, Platform } from 'react-native';

import { resetAccountForTests } from '@/account/store';
import AccountLayout from '@/app/account/_layout';
import CodeScreen from '@/app/account/code';
import EmailScreen from '@/app/account/email';
import AccountRoute from '@/app/account/index';
import SettingsScreen from '@/app/settings';
import type { Result, SessionEvent, SessionUser } from '@/backend/session';

// The real store and screens; the backend is mocked at its boundary.
let mockEmit: (event: SessionEvent) => void = () => {};
let mockUser: SessionUser | null = null;
jest.mock('@/backend/session', () => ({
  onSessionChange: (listener: (event: SessionEvent) => void) => {
    mockEmit = listener;
    return () => {};
  },
  getCurrentUser: async () => ({ ok: true, value: mockUser }),
  signOut: jest.fn(async () => {
    mockEmit({ type: 'signed_out', reason: 'user' });
    return { ok: true, value: null };
  }),
}));
jest.mock('@/backend/auth', () => ({
  sendEmailCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  deleteAccount: jest.fn(),
}));

const auth = jest.requireMock('@/backend/auth') as Record<
  'sendEmailCode' | 'verifyEmailCode' | 'deleteAccount',
  jest.Mock
>;
const session = jest.requireMock('@/backend/session') as { signOut: jest.Mock };

const sam: SessionUser = { id: 'u-1', email: 'sam@example.com', provider: 'email' };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });

const androidBack = {
  listeners: [] as { handler: () => boolean | null | undefined; removed: boolean }[],
  async press() {
    await act(async () => {
      for (const entry of [...androidBack.listeners].reverse()) {
        if (!entry.removed && entry.handler()) return;
      }
      if (router.canGoBack()) router.back();
    });
  },
};

let announce: jest.SpyInstance;

beforeEach(() => {
  mockUser = null;
  auth.sendEmailCode.mockReset().mockResolvedValue(ok(null));
  auth.verifyEmailCode.mockReset().mockImplementation(async () => {
    mockEmit({ type: 'signed_in', user: sam });
    return ok(sam);
  });
  auth.deleteAccount.mockReset().mockImplementation(async () => {
    mockEmit({ type: 'signed_out', reason: 'user' });
    return ok(null);
  });
  session.signOut.mockClear();
  androidBack.listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const entry = { handler: handler as () => boolean, removed: false };
    androidBack.listeners.push(entry);
    return { remove: () => void (entry.removed = true) };
  });
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
});

afterEach(() => {
  resetAccountForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const ROUTES = {
  settings: SettingsScreen,
  'account/_layout': AccountLayout,
  'account/index': AccountRoute,
  'account/email': EmailScreen,
  'account/code': CodeScreen,
};

async function openFromSettings() {
  await renderRouter(ROUTES, { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Save plants' }));
  expect(screen).toHavePathname('/account');
}

async function goToCode(email = 'sam@example.com') {
  await openFromSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  expect(screen).toHavePathname('/account/code');
}

describe('sign-in screen', () => {
  test('explains what an account is for, and that scanning needs none', async () => {
    await openFromSettings();
    expect(screen.getByText('Keep your plants safe')).toBeOnTheScreen();
    expect(screen.getByText(/Scanning works without an account/)).toBeOnTheScreen();
  });

  test('phase 1 offers email only: no Google, no Apple', async () => {
    await openFromSettings();
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Apple/ })).toBeNull();
  });

  test('"Not now" and the close button go back to Settings', async () => {
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen).toHavePathname('/settings');
    await fireEvent.press(screen.getByRole('button', { name: 'Save plants' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen).toHavePathname('/settings');
  });
});

describe('email screen', () => {
  test('the field is set up for email addresses', async () => {
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    const field = screen.getByLabelText('Email');
    expect(field.props).toMatchObject({
      keyboardType: 'email-address',
      autoComplete: 'email',
      textContentType: 'emailAddress',
      autoCapitalize: 'none',
      autoCorrect: false,
    });
    expect(screen.getByText("We'll email you a 6-digit code. No password needed.")).toBeOnTheScreen();
  });

  test('"Send code" stays disabled until the address has a valid shape', async () => {
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@example');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@example.com');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  test('sends the normalized address once, even on a double tap', async () => {
    let finish: (r: Result<null>) => void = () => {};
    auth.sendEmailCode.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), '  Sam\u200B@Example.COM ');
    const send = screen.getByRole('button', { name: 'Send code' });
    await fireEvent.press(send);
    await fireEvent.press(send);
    await act(async () => finish(ok(null)));
    expect(auth.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(auth.sendEmailCode).toHaveBeenCalledWith('sam@example.com');
    expect(screen).toHavePathname('/account/code');
    expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
  });

  test.each([
    ['offline', "You're offline. Connect and try again."],
    ['rate_limited', 'Too many tries. Wait a minute and try again.'],
    ['unknown', "Couldn't send the code. Check the address and try again."],
  ] as const)('a %s send stays on the screen with the message', async (error, text) => {
    auth.sendEmailCode.mockResolvedValue({ ok: false, error });
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(screen).toHavePathname('/account/email');
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  test('Android Back goes to the sign-in screen', async () => {
    await openFromSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
    await androidBack.press();
    expect(screen).toHavePathname('/account');
  });
});

describe('code screen', () => {
  test('the field is set up for codes from the email or a notification', async () => {
    await goToCode();
    const field = screen.getByLabelText('6-digit code');
    expect(field.props).toMatchObject({ keyboardType: 'number-pad', autoComplete: 'one-time-code' });
    if (Platform.OS === 'ios') expect(field.props.textContentType).toBe('oneTimeCode');
    expect(screen.getByText("Can't find it? Check your spam folder.")).toBeOnTheScreen();
  });

  test('a pasted "123 456" verifies once, then shows the account', async () => {
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123 456');
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(auth.verifyEmailCode).toHaveBeenCalledWith('sam@example.com', '123456');
    expect(screen).toHavePathname('/account');
    expect(screen.getByText('Signed in with email')).toBeOnTheScreen();
  });

  test('after signing in, Back goes to Settings, not to the code screen', async () => {
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await androidBack.press();
    expect(screen).toHavePathname('/settings');
    expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
  });

  test('typing to 6 digits and pressing Continue during the check verify once', async () => {
    let finish: (r: Result<SessionUser>) => void = () => {};
    auth.verifyEmailCode.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => finish({ ok: false, error: 'offline' }));
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(1);
  });

  test('Continue verifies too (screen readers, autofill without a change event)', async () => {
    let finish: (r: Result<SessionUser>) => void = () => {};
    auth.verifyEmailCode
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce({ ok: false, error: 'offline' });
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await act(async () => finish({ ok: false, error: 'rate_limited' }));
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '654321');
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(3);
  });

  test('Continue is disabled until there are 6 digits', async () => {
    await goToCode();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '12345');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
  });

  test('a wrong or expired code: the message, the field cleared, still on the screen', async () => {
    auth.verifyEmailCode.mockResolvedValue({ ok: false, error: 'invalid_code' });
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '000000');
    expect(
      screen.getByText("That code isn't right or has expired. Check the email or send a new one."),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('6-digit code').props.value).toBe('');
    expect(screen).toHavePathname('/account/code');
  });

  test('then the right code signs in', async () => {
    auth.verifyEmailCode.mockResolvedValueOnce({ ok: false, error: 'invalid_code' });
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '000000');
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    expect(screen).toHavePathname('/account');
  });

  test.each([
    ['rate_limited', 'Too many tries. Wait a minute and try again.'],
    ['offline', "You're offline. Connect and try again."],
  ] as const)('%s → the message, still on the screen', async (error, text) => {
    auth.verifyEmailCode.mockResolvedValue({ ok: false, error });
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen).toHavePathname('/account/code');
  });

  test('"Send a new code" waits 60 seconds, then sends once and waits again', async () => {
    jest.useFakeTimers();
    await goToCode();
    const waiting = screen.getByRole('button', { name: /Send a new code in/ });
    expect(waiting).toBeDisabled();
    expect(announce).toHaveBeenCalledWith('You can send a new code in 60 seconds.');
    await act(async () => void jest.advanceTimersByTime(60_000));
    const resend = screen.getByRole('button', { name: 'Send a new code' });
    await fireEvent.press(resend);
    await fireEvent.press(resend);
    expect(auth.sendEmailCode).toHaveBeenCalledTimes(2); // the first send, then this one
    expect(screen.getByRole('button', { name: /Send a new code in/ })).toBeDisabled();
  });

  test('"Use a different email" and Android Back go to the email screen', async () => {
    await goToCode();
    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen).toHavePathname('/account/email');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    await androidBack.press();
    expect(screen).toHavePathname('/account/email');
  });

  test('a sign-in that finishes late (after a timeout) still shows the account', async () => {
    auth.verifyEmailCode.mockResolvedValue({ ok: false, error: 'offline' });
    await goToCode();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await act(async () => mockEmit({ type: 'signed_in', user: sam }));
    expect(screen).toHavePathname('/account');
  });

  test('opened by a link without a usable address → the email screen', async () => {
    await renderRouter(ROUTES, { initialUrl: '/account/code?email=not-an-address' });
    expect(await screen.findByLabelText('Email')).toBeOnTheScreen();
    expect(screen).toHavePathname('/account/email');
  });
});

describe('account screen', () => {
  async function openSignedIn(user: SessionUser = { ...sam, provider: 'google' }) {
    mockUser = user;
    await renderRouter(ROUTES, { initialUrl: '/settings' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Account' }));
    expect(screen).toHavePathname('/account');
  }

  test('shows the email, the method, and that signing out keeps plants', async () => {
    await openSignedIn();
    expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
    expect(screen.getByText('Signed in with Google')).toBeOnTheScreen();
    expect(screen.getByText('Signing out never removes plants from this phone.')).toBeOnTheScreen();
    expect(screen.queryByText('Backup')).toBeNull();
  });

  test('sign out: confirm, sign out once, back to Settings as a guest', async () => {
    await openSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByText('Sign out?')).toBeOnTheScreen();
    expect(screen.getByText(/Your plants stay on this phone/)).toBeOnTheScreen();
    const confirm = screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!;
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname('/settings');
    expect(screen.getByRole('button', { name: 'Save plants' })).toBeOnTheScreen();
  });

  test('the sign-out sheet: Cancel and Android Back close it, still signed in', async () => {
    await openSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Sign out?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await androidBack.press();
    expect(screen.queryByText('Sign out?')).toBeNull();
    expect(screen).toHavePathname('/account');
    expect(session.signOut).not.toHaveBeenCalled();
  });

  test('delete: confirm → deleting (announced, one call) → Settings says the account is deleted', async () => {
    let finish: (r: Result<null>) => void = () => {};
    auth.deleteAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = (r) => {
            mockEmit({ type: 'signed_out', reason: 'user' });
            resolve(r);
          };
        }),
    );
    await openSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByText('Delete your account?')).toBeOnTheScreen();
    expect(screen.getByText(/can't be undone. Plants on this phone stay./)).toBeOnTheScreen();
    const confirm = screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!;
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(auth.deleteAccount).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Deleting your account');
    await androidBack.press(); // can't close the sheet while deleting
    expect(screen.getByText('Delete your account?')).toBeOnTheScreen();

    await act(async () => finish(ok(null)));
    expect(screen).toHavePathname('/settings');
    expect(screen.getByText('Your account is deleted.')).toBeOnTheScreen();
  });

  test('a failed delete: the message on the sheet, still signed in, can try again', async () => {
    auth.deleteAccount.mockResolvedValueOnce({ ok: false, error: 'offline' });
    await openSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!);
    expect(screen.getByText("You're offline. Connect and try again.")).toBeOnTheScreen();
    expect(screen).toHavePathname('/account');
    // Behind the open sheet, so hidden from screen readers.
    expect(screen.getByText('Signed in with Google', { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(auth.deleteAccount).toHaveBeenCalledTimes(2);
  });

  test('Android Back on the account screen goes to Settings', async () => {
    await openSignedIn();
    await androidBack.press();
    expect(screen).toHavePathname('/settings');
  });
});

describe('opened cold from a link', () => {
  test('Android Back on /account goes to Settings, not out of the app', async () => {
    await renderRouter(ROUTES, { initialUrl: '/account' });
    await screen.findByText('Keep your plants safe');
    await androidBack.press();
    expect(screen).toHavePathname('/settings');
  });

  test('Close on /account goes to Settings', async () => {
    await renderRouter(ROUTES, { initialUrl: '/account' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
    expect(screen).toHavePathname('/settings');
  });
});
