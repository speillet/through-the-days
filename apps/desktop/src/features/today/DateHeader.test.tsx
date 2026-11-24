import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateHeader } from './DateHeader';

describe('DateHeader', () => {
  it('stops day navigation and the date picker at the first and last journal dates', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const header = (date: string) => (
      <DateHeader date={date} today="2026-11-22" compact={false} onNavigate={onNavigate} />
    );
    const { rerender } = render(header('9999-12-30'));
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onNavigate).toHaveBeenLastCalledWith('9999-12-31');

    rerender(header('9999-12-31'));
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    expect(screen.getByRole('grid', { name: 'December 9999' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await user.keyboard('{Escape}');

    rerender(header('0001-01-01'));
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
