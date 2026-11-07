import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivacyPage } from './PrivacyPage';

const CONTACT = 'rebloom.plant@gmail.com';

function section(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name });
  const part = document.createElement('div');
  for (let el = heading.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
    part.append(el.cloneNode(true));
  }
  return part;
}

describe('privacy page', () => {
  it('uses the project address everywhere, never a personal one', () => {
    const { container } = render(<PrivacyPage />);
    expect(container.textContent).not.toMatch(/sanketlakhani/);
    for (const link of screen.getAllByRole('link', { name: CONTACT })) {
      expect(link).toHaveAttribute('href', `mailto:${CONTACT}`);
    }
  });

  it('has an App accounts section: what is stored, who processes it, how to delete it', () => {
    render(<PrivacyPage />);
    const text = section('App accounts').textContent ?? '';
    expect(text).toMatch(/email address/);
    expect(text).toMatch(/how you signed in/);
    expect(text).toMatch(/when you created the account and when you last used it/);
    expect(text).toMatch(/Supabase/);
    // Break-test #3: true until production sends through Gmail (task 25 adds it then).
    expect(text).toMatch(/Supabase sends the sign-in codes/);
    expect(text).not.toMatch(/Gmail/);
    expect(text).toMatch(/Settings › Account › Delete account/);
    // Swarm Medium 5: Supabase's auth audit log keeps the address after a delete; say so.
    expect(text).not.toMatch(/everything stored with it, and/);
    expect(text).toMatch(/security log/);
    expect(text).toMatch(/stay on your phone/);
  });

  it('gives a way to delete an account without the app (Google Play needs it)', () => {
    render(<PrivacyPage />);
    const part = section('App accounts');
    expect(part.textContent).toMatch(/without the app/);
    expect(within(part).getByRole('link', { name: CONTACT })).toHaveAttribute('href', `mailto:${CONTACT}`);
  });
});
