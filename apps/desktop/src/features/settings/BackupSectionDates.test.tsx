import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BackupRecord } from '../../api/types';
import { createTestApi, renderWithProviders } from '../../test/render';
import { BackupSection } from './BackupSection';

describe('Backups settings with a backup time no date can describe', () => {
  it('lists that backup under an unknown date and keeps the section usable', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    await api.chooseBackupFolder();
    const backups: BackupRecord[] = [
      // A registry entry written by someone else, about 317,000 years from now.
      { name: 'ttd-9999999999999-synthetic.ttd.age', createdAt: 9_999_999_999_999, sizeBytes: 4096 },
      { name: 'ttd-1795338000-synthetic.ttd.age', createdAt: 1_795_338_000, sizeBytes: 4096 },
    ];
    vi.spyOn(api, 'listBackups').mockResolvedValue(backups);
    renderWithProviders(<BackupSection />, { api, initialView: 'settings' });

    const list = await screen.findByRole('list', { name: 'Backups in this folder' });
    const [unknown, known] = within(list).getAllByRole('listitem');
    expect(unknown).toHaveTextContent('Unknown date');
    expect(known).toHaveTextContent('22 November 2026 at 10:00');

    await user.click(within(list).getByRole('button', { name: 'Restore the backup from Unknown date…' }));
    expect(screen.getByRole('alertdialog', { name: 'Restore this backup?' })).toHaveAccessibleDescription(
      /Backup from Unknown date/,
    );
  });
});
