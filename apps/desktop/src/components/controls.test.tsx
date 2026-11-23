import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Notice } from './Notice';
import { RadioGroup } from './RadioGroup';
import { TextArea, TextField } from './TextField';
import { Toggle } from './Toggle';
import { VisuallyHidden } from './VisuallyHidden';

describe('Button', () => {
  it('renders each variant as a real button that defaults to type="button"', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button>Cancel</Button>
        <Button variant="quiet">Skip</Button>
        <Button variant="danger">Delete</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('button--primary');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('button--secondary');
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveClass('button--quiet');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
  });

  it('keeps focus but ignores activation while busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Backing up
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Backing up' });
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
  });
});

describe('Notice', () => {
  it('announces errors assertively and other notices politely', () => {
    render(
      <>
        <Notice tone="error">Couldn&apos;t save</Notice>
        <Notice tone="success">Saved</Notice>
        <Notice tone="info" politeness="off">
          Static explanation
        </Notice>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save");
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByText('Static explanation').closest('.notice')).not.toHaveAttribute('role');
  });

  it('carries the tone in wording and an icon, not colour alone', () => {
    render(
      <Notice tone="warning" title="Backup pending" actions={<Button>Enter passphrase</Button>}>
        Enter your backup passphrase to finish today&apos;s backup.
      </Notice>,
    );
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Backup pending');
    expect(notice.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Enter passphrase' })).toBeInTheDocument();
  });
});

describe('TextField and TextArea', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <>
        <TextField label="Backup passphrase" hint="At least 12 characters." error="Too short." />
        <TextArea label="What helped?" hint="Optional." />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Backup passphrase' });
    expect(field).toHaveAccessibleDescription('At least 12 characters. Too short.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const area = screen.getByRole('textbox', { name: 'What helped?' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAccessibleDescription('Optional.');
    expect(area).not.toHaveAttribute('aria-invalid');
  });

  it('keeps a hidden label available to assistive technology', () => {
    render(<TextField label="Search time zones" labelHidden />);
    expect(screen.getByRole('textbox', { name: 'Search time zones' })).toBeInTheDocument();
    expect(screen.getByText('Search time zones')).toHaveClass('visually-hidden');
  });
});

describe('Toggle', () => {
  function Harness({ onChange }: { onChange: (value: boolean) => void }) {
    const [checked, setChecked] = useState(false);
    return (
      <Toggle
        label="Gentle view"
        hint="Hides optional scores."
        checked={checked}
        onChange={(value) => {
          setChecked(value);
          onChange(value);
        }}
      />
    );
  }

  it('is a labelled switch operable from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Gentle view' });
    expect(toggle).toHaveAccessibleDescription('Hides optional scores.');
    expect(toggle).not.toBeChecked();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('RadioGroup', () => {
  it('groups labelled options and reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        legend="Theme"
        hint="Choose an appearance."
        value="system"
        options={[
          { value: 'system', label: 'System', description: 'Follow the macOS appearance.' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group).toHaveAccessibleDescription('Choose an appearance.');
    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('VisuallyHidden', () => {
  it('renders text for assistive technology only', () => {
    render(
      <button type="button">
        <span aria-hidden="true">×</span>
        <VisuallyHidden>Close</VisuallyHidden>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
