import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../lib/waitlist';
import { WaitlistForm } from './WaitlistForm';

const ZWSP = String.fromCodePoint(0x200b);

// A fetch whose reply the test releases by hand, to inspect the in-flight state.
function deferredFetch() {
  let reply!: (status: number) => void;
  const f = vi.fn(() => new Promise<{ status: number }>(res => { reply = status => res({ status }); }));
  vi.stubGlobal('fetch', f);
  return { f, reply: async (status: number) => { await act(async () => reply(status)); } };
}

const setup = (source: 'hero' | 'final' = 'hero') => {
  const user = userEvent.setup();
  const { container } = render(<WaitlistForm source={source} />);
  return {
    user,
    form: container.querySelector('form')!,
    email: screen.getByLabelText('Email') as HTMLInputElement,
    button: screen.getByRole('button', { name: 'Join the waitlist' }),
    status: screen.getByRole('status'),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('WaitlistForm', () => {
  it('renders a POST form so the email never lands in the URL without JS', () => {
    const { form, email, status } = setup();
    expect(form).toHaveAttribute('method', 'post');
    expect(email).toHaveAttribute('aria-describedby', status.id);
    expect(email).toHaveAttribute('maxlength', '254');
  });

  it('sends the cleaned email with its source and confirms on 204', async () => {
    const { f, reply } = deferredFetch();
    const { user, email, status } = setup('final');
    await user.type(email, ` ${ZWSP}ann@gmail.com `);
    await user.click(screen.getByRole('button'));
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ p_email: 'ann@gmail.com', p_source: 'final' });
    expect(status).toHaveTextContent(MESSAGES.sending);
    await reply(204);
    expect(status).toHaveTextContent(MESSAGES.joined);
    expect(email.value).toBe('');
  });

  it('sends one request for repeat submits while busy', async () => {
    const { f, reply } = deferredFetch();
    const { user, email, button } = setup();
    await user.type(email, 'ann@gmail.com');
    await user.click(button);
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(f).toHaveBeenCalledTimes(1);
    await reply(204);
  });

  it('is read-only and aria-disabled while sending, without dropping keyboard focus', async () => {
    const { reply } = deferredFetch();
    const { user, email, button } = setup();
    await user.type(email, 'ann@gmail.com');
    button.focus();
    await user.keyboard('{Enter}');
    expect(email.readOnly).toBe(true);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    await reply(204);
    expect(email.readOnly).toBe(false);
    expect(button).toHaveAttribute('aria-disabled', 'false');
  });

  it('keeps an address changed during the request instead of wiping it', async () => {
    const { reply } = deferredFetch();
    const { user, email, status } = setup();
    await user.type(email, 'ann@gmial.com');
    await user.click(screen.getByRole('button'));
    // readOnly blocks typing, but a script or autofill can still change the value mid-request.
    email.value = 'ann@gmail.com';
    await reply(204);
    expect(email.value).toBe('ann@gmail.com');
    expect(status).toHaveTextContent(MESSAGES.joined);
  });

  it('flags an invalid email, focuses it, and clears the flag on input', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { user, email, status } = setup();
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button'));
    expect(f).not.toHaveBeenCalled();
    expect(status).toHaveTextContent(MESSAGES.invalid);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveFocus();
    await user.type(email, 'x');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('treats invisible-only input as empty', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { user, email, status } = setup();
    await user.type(email, ZWSP);
    await user.click(screen.getByRole('button'));
    expect(f).not.toHaveBeenCalled();
    expect(status).toHaveTextContent(MESSAGES.invalid);
  });

  it('shows invalid on a 400 from the server', async () => {
    const { reply } = deferredFetch();
    const { user, email, status } = setup();
    await user.type(email, 'ann@gmail.com');
    await user.click(screen.getByRole('button'));
    await reply(400);
    expect(status).toHaveTextContent(MESSAGES.invalid);
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the email after a failure so a retry is one tap', async () => {
    const { reply } = deferredFetch();
    const { user, email, status } = setup();
    await user.type(email, 'ann@gmail.com');
    await user.click(screen.getByRole('button'));
    await reply(503);
    expect(status).toHaveTextContent(MESSAGES.unreachable);
    expect(email.value).toBe('ann@gmail.com');
  });

  it('looks done but sends nothing when the bot trap is filled', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { user, form, email, status } = setup();
    const trap = form.querySelector<HTMLInputElement>('input[name="rb_hp"]')!;
    expect(trap.closest('[inert]')).not.toBeNull();
    trap.value = 'http://spam.example';
    await user.type(email, 'ann@gmail.com');
    await user.click(screen.getByRole('button'));
    expect(f).not.toHaveBeenCalled();
    expect(status).toHaveTextContent(MESSAGES.joined);
  });
});
