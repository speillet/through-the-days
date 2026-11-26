import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';

function DialogHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open details</Button>
      <Button>Outside action</Button>
      <Dialog
        open={open}
        title="Synthetic details"
        description="A short explanation."
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        footer={<Button onClick={() => setOpen(false)}>Done</Button>}
      >
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is a labelled modal dialog that takes focus', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    const dialog = screen.getByRole('dialog', { name: 'Synthetic details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('A short explanation.');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog in both directions', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    const done = screen.getByRole('button', { name: 'Done' });
    await user.tab();
    expect(done).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(done).toHaveFocus();
  });

  it('makes the rest of the page inert while open', async () => {
    const user = userEvent.setup();
    const { container } = render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    expect(container).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open details' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('ConfirmDialog', () => {
  it('starts on Cancel for a destructive action and confirms explicitly', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        tone="danger"
        title="Delete permanently?"
        confirmLabel="Delete permanently"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Earlier backups may still contain this entry.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete permanently?' });
    expect(dialog).toHaveAccessibleDescription('Earlier backups may still contain this entry.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows an English error and stays open when the action fails', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Restore this entry?"
        confirmLabel="Restore"
        onConfirm={() =>
          Promise.reject({ code: 'occupied', message: 'This date and slot already contain an entry. Choose a free slot.' })
        }
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Restore' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This date and slot already contain an entry. Choose a free slot.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
