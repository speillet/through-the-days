import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider, type JournalApi } from '../../api/client';
import type { StartupStatus } from '../../api/types';
import { useStartup, StartupProvider, type StartupContextValue } from '../../state/startup';
import { createTestApi } from '../../test/render';
import { StartupGate, UPGRADED_NOTICE } from './StartupGate';

const PASSPHRASE = 'fictional-lighthouse-maple';
const DATA_LOCATION = '/Users/fictional/Library/Application Support/com.throughthedays.app';

type User = ReturnType<typeof userEvent.setup>;

function renderGate(api: JournalApi) {
  const startup: { value: StartupContextValue | null } = { value: null };
  function Probe() {
    startup.value = useStartup();
    return null;
  }
  render(
    <ApiProvider api={api}>
      <StartupProvider>
        <Probe />
        <StartupGate />
      </StartupProvider>
    </ApiProvider>,
  );
  return { api, startup };
}

async function typePassphrase(user: User, passphrase = PASSPHRASE) {
  await user.type(screen.getByLabelText('Backup passphrase'), passphrase);
  await user.type(screen.getByLabelText('Confirm passphrase'), passphrase);
}

describe('startup gate', () => {
  it('says the journal is opening until it answers', async () => {
    const api = createTestApi();
    vi.spyOn(api, 'startupStatus').mockReturnValue(new Promise<StartupStatus>(() => {}));
    renderGate(api);
    expect(screen.getByRole('status')).toHaveTextContent('Opening your journal…');
  });

  it('backs up the journal before upgrading it', async () => {
    const user = userEvent.setup();
    const { api, startup } = renderGate(createTestApi({ startup: { state: 'needsMigration' } }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protect your journal before upgrading' }),
    ).toBeVisible();
    expect(screen.getByText(/Nothing has been changed yet\./)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
    expect(await screen.findByText(/The backup will be saved in Synthetic backups/)).toBeVisible();
    await typePassphrase(user);
    expect(screen.getByRole('checkbox', { name: 'Remember in macOS Keychain' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));

    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startup.value?.notice).toBe(UPGRADED_NOTICE);
    await expect(api.listBackups()).resolves.toHaveLength(1);
    await expect(api.backupStatus()).resolves.toMatchObject({ passphraseAvailable: true, remembered: false });
  });

  it('waits for a backup folder and a valid passphrase without touching the journal', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'needsMigration' } });
    const migrate = vi.spyOn(api, 'migrateJournal');
    renderGate(api);
    await screen.findByRole('heading', { level: 1, name: 'Protect your journal before upgrading' });
    await typePassphrase(user);
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a backup folder first.');

    await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
    await screen.findByText(/The backup will be saved in/);
    await user.clear(screen.getByLabelText('Confirm passphrase'));
    await user.type(screen.getByLabelText('Confirm passphrase'), 'a-different-passphrase');
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));
    expect(screen.getByLabelText('Confirm passphrase')).toHaveAccessibleDescription(
      /The two passphrases don’t match\./,
    );
    expect(migrate).not.toHaveBeenCalled();
  });

  it('keeps the journal unchanged when the pre-upgrade backup fails', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'needsMigration' } });
    vi.spyOn(api, 'migrateJournal').mockRejectedValue({
      code: 'backup',
      message: 'The backup could not be created. Check the selected folder and available disk space, then try again.',
    });
    const { startup } = renderGate(api);
    await user.click(await screen.findByRole('button', { name: 'Choose backup folder…' }));
    await screen.findByText(/The backup will be saved in/);
    await typePassphrase(user);
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The journal was not upgraded');
    expect(alert).toHaveTextContent('The backup could not be created.');
    expect(alert).toHaveTextContent('Your journal has not been changed.');
    expect(startup.value?.status?.state).toBe('needsMigration');
    expect(screen.getByLabelText('Backup passphrase')).toHaveValue(PASSPHRASE);
  });

  it('explains a journal this version cannot open, and where it is', async () => {
    renderGate(createTestApi({ startup: { state: 'unsupported', dataLocation: DATA_LOCATION } }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This journal can’t be opened' })).toBeVisible();
    expect(
      screen.getByText(
        /created by a newer version of Through the Days or is not a journal database\. It has not been changed\./,
      ),
    ).toBeVisible();
    expect(screen.getByText(DATA_LOCATION)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back up and upgrade' })).not.toBeInTheDocument();
  });

  it('reports a failed opening and offers to try again', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'failed', dataLocation: DATA_LOCATION } });
    const startupStatus = vi.spyOn(api, 'startupStatus');
    renderGate(api);
    const heading = await screen.findByRole('heading', { level: 1, name: 'The journal could not be opened' });
    const card = heading.parentElement as HTMLElement;
    expect(within(card).getByRole('alert')).toHaveTextContent(
      'The journal could not be opened. It has not been changed.',
    );
    expect(within(card).getByText(DATA_LOCATION)).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Try again' }));
    expect(startupStatus).toHaveBeenCalledTimes(2);
  });
});
