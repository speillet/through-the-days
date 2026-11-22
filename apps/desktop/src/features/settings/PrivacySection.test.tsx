import { screen } from '@testing-library/react';
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
    // Never an encryption or FileVault claim the app cannot keep.
    expect(text).not.toMatch(/journal is encrypted|FileVault is (?:on|enabled)|vault password/i);
  });
});
