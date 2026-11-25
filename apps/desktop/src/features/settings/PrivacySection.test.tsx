import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createTestApi, renderWithProviders } from '../../test/render';
import { PrivacySection } from './PrivacySection';

describe('Privacy information', () => {
  it('states how the live journal is protected and how that differs from encrypted backups', async () => {
    const api = createTestApi({
      startup: { dataLocation: '/Users/fictional/Library/Application Support/com.throughthedays.app' },
    });
    renderWithProviders(<PrivacySection />, { api, initialView: 'settings' });
    await screen.findByRole('heading', { level: 3, name: 'Your journal on this Mac' });
    const text = document.body.textContent ?? '';

    expect(text).toContain('/Users/fictional/Library/Application Support/com.throughthedays.app');
    expect(text).toContain('protected by your macOS account and by the Mac’s disk protections');
    expect(text).toContain('The app does not encrypt this live journal itself');
    expect(text).toContain('it cannot tell whether FileVault disk encryption is turned on');
    expect(text).toContain('Backups are separate copies of the journal, encrypted with your backup passphrase.');
    expect(text).toContain('never uploads your writing or your backups');
    expect(text).toContain('Deleted entries stay in the trash for 30 days.');
    expect(text).toContain('the 30 most recent backups are kept, whatever their dates');
    expect(text).toContain('Deleting is not forensic erasure');
    expect(text).toContain(
      'Time Machine and other backups of this Mac keep their own copies of your journal, unencrypted unless the backup disk is encrypted.',
    );
    expect(text).toContain('Deleting entries or erasing app data doesn’t remove those copies');
    expect(text).toContain('a service such as iCloud Drive keeps when it syncs your backup folder');
    // Never an encryption or FileVault claim the app cannot keep.
    expect(text).not.toMatch(/journal is encrypted|FileVault is (?:on|enabled)|vault password/i);
  });

  it('keeps authored records when clearing local summaries and says earlier backups still contain them', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const notes = await api.saveWeeklyNotes('2026-11-22', 'Fictional weekly notes to keep.', 0);
    expect((await api.generateWeeklySummary('2026-11-22', notes.revision)).summary).not.toBeNull();
    const milestone = await api.saveMilestone({
      id: '00000000-0000-4000-8000-000000000024',
      date: '2026-11-21',
      title: 'Fictional milestone to keep',
      notes: '',
      revision: 0,
    });
    renderWithProviders(<PrivacySection />, { api, initialView: 'settings' });
    await screen.findByRole('heading', { level: 3, name: 'Generated reading information' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Your original writing, weekly notes and private milestones are kept.');
    expect(text).toContain(
      'Backups made before you clear summaries still contain them until those backups are removed.',
    );

    await user.click(screen.getByRole('button', { name: 'Clear local summaries' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Local summaries cleared.');
    await expect(api.weeklyReview('2026-11-22')).resolves.toMatchObject({
      notes: 'Fictional weekly notes to keep.',
      summary: null,
    });
    await expect(api.listMilestones()).resolves.toEqual([milestone]);
  });
});
