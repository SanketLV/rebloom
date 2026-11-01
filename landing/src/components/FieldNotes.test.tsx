import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SYMPTOMS } from '../content/symptoms';
import { FieldNotes } from './FieldNotes';

// Everything stays in the HTML; only the active symptom's photo, caption and entry are visible.
const visible = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-s]')].filter(el => !el.hidden).map(el => el.dataset.s);

describe('FieldNotes', () => {
  it('renders all four symptoms and shows only brown tips first', () => {
    const { container } = render(<FieldNotes />);
    expect(container.querySelectorAll('article')).toHaveLength(4);
    expect(new Set(visible(container))).toEqual(new Set(['tips']));
    expect(screen.getByRole('radio', { name: 'Brown, crispy tips' })).toBeChecked();
  });

  it.each(SYMPTOMS.map(s => [s.label, s.id]))('picking "%s" shows only its photo, caption and entry', async (label, id) => {
    const { container } = render(<FieldNotes />);
    await userEvent.click(screen.getByRole('radio', { name: label }));
    const shown = visible(container);
    expect(shown).toHaveLength(3);
    expect(new Set(shown)).toEqual(new Set([id]));
  });

  it('keeps the entries in a polite live region and the plate photo described', async () => {
    const { container } = render(<FieldNotes />);
    expect(container.querySelector('article')!.parentElement).toHaveAttribute('aria-live', 'polite');
    await userEvent.click(screen.getByRole('radio', { name: 'White powdery patches' }));
    expect(screen.getByRole('img', { name: 'A green leaf dusted with white powdery patches' })).toBeVisible();
  });
});
