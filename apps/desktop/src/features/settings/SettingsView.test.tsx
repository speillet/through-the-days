import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraft } from '../../domain/entry';
import { useNavigation, type NavigationContextValue } from '../../state/navigation';
import { createTestApi, renderWithProviders } from '../../test/render';
import { SettingsView } from './SettingsView';

async function renderSettings(api = createTestApi()) {
  const navigation: { value: NavigationContextValue | null } = { value: null };
  function NavigationProbe() {
    navigation.value = useNavigation();
    return null;
  }
  renderWithProviders(
    <>
      <NavigationProbe />
      <SettingsView />
    </>,
    { api, initialView: 'settings' },
  );
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  return { api, navigation };
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

afterEach(() => {
  document.documentElement.style.fontSize = '';
});

describe('Settings', () => {
  it('shows the sections in their documented order', async () => {
    await renderSettings();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Appearance',
      'Writing',
      'Time zone',
      'Gentle view',
      'Backups',
      'Privacy',
      'Erase app data',
    ]);
  });

  it('switches the theme in both directions and saves the choice', async () => {
    const user = userEvent.setup();
    const { api } = await renderSettings();
    const appearance = section('Appearance');
    expect(within(appearance).getByRole('radio', { name: /System/ })).toBeChecked();
    await user.click(within(appearance).getByRole('radio', { name: /Dark/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await user.click(within(appearance).getByRole('radio', { name: /Light/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await expect(api.getPreferences()).resolves.toMatchObject({ theme: 'light' });
    await user.click(within(appearance).getByRole('radio', { name: /System/ }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('offers a reduce-motion override', async () => {
    const user = userEvent.setup();
    const { api } = await renderSettings();
    await user.click(within(section('Appearance')).getByRole('switch', { name: 'Reduce motion' }));
    expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true');
    await expect(api.getPreferences()).resolves.toMatchObject({ reduceMotion: true });
  });

  it('saves the writing preferences', async () => {
    const user = userEvent.setup();
    const { api } = await renderSettings();
    const writing = section('Writing');
    await user.click(within(writing).getByRole('radio', { name: /Quick Check-in/ }));
    await user.click(within(writing).getByRole('switch', { name: 'Show formatting toolbar' }));
    await user.click(within(writing).getByRole('switch', { name: 'Show word count' }));
    await user.click(within(writing).getByRole('switch', { name: 'Show scores' }));
    await expect(api.getPreferences()).resolves.toMatchObject({
      defaultDepth: 'quick',
      showToolbar: false,
      showWordCount: true,
      showScores: false,
    });
  });

  it('shows suggested durations only while they are switched on', async () => {
    const user = userEvent.setup();
    await renderSettings();
    const writing = section('Writing');
    expect(within(writing).getByRole('radio', { name: /Quick Check-in/ })).toHaveAccessibleName(
      /About 30 seconds/,
    );
    await user.click(within(writing).getByRole('switch', { name: 'Show suggested durations' }));
    expect(within(writing).getByRole('radio', { name: /Quick Check-in/ })).not.toHaveAccessibleName(
      /About 30 seconds/,
    );
  });

  it('says that Deep Reflection worksheets are not available yet', async () => {
    await renderSettings();
    expect(within(section('Writing')).getByRole('radio', { name: /Deep Reflection/ })).toHaveAccessibleName(
      /Guided worksheets are not available yet/,
    );
  });

  it('describes Deep Reflection as the full check-in and free writing', async () => {
    await renderSettings();
    expect(within(section('Writing')).getByRole('radio', { name: /Deep Reflection/ })).toHaveAccessibleName(
      /The full check-in and free writing for now\. Guided worksheets are not available yet\./,
    );
  });

  it('says what Show scores hides, and that completing an entry still needs mood and energy', async () => {
    await renderSettings();
    const toggle = within(section('Writing')).getByRole('switch', { name: 'Show scores' });
    expect(toggle).toHaveAccessibleDescription(
      'Shows the mood, energy, pride and progress questions in the check-in; in Quick Check-in, the whole check-in. Hiding them keeps saved answers, and marking an entry complete still needs a mood and an energy score.',
    );
    expect(toggle).not.toHaveAccessibleDescription(/summaries/);
  });

  it('offers four text sizes and applies the chosen one to all text', async () => {
    const user = userEvent.setup();
    const { api } = await renderSettings();
    const textSize = within(section('Appearance')).getByRole('group', { name: 'Text size' });
    expect(within(textSize).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      '100',
      '115',
      '130',
      '150',
    ]);
    expect(within(textSize).getAllByRole('radio').map((radio) => radio.parentElement?.textContent)).toEqual([
      'Default100%',
      'Large115%',
      'Larger130%',
      'Largest150%',
    ]);
    expect(within(textSize).getByRole('radio', { name: /Default/ })).toBeChecked();
    expect(textSize).toHaveAccessibleDescription(/⌘\+ to make text larger, ⌘− to make it smaller and ⌘0/);

    await user.click(within(textSize).getByRole('radio', { name: /Larger/ }));
    expect(document.documentElement.style.fontSize).toBe('130%');
    await expect(api.getPreferences()).resolves.toMatchObject({ textScale: 130 });
    await user.click(within(textSize).getByRole('radio', { name: /Default/ }));
    expect(document.documentElement.style.fontSize).toBe('');
    await expect(api.getPreferences()).resolves.toMatchObject({ textScale: 100 });
  });

  it('changes the time zone for new entries without moving existing dates', async () => {
    const user = userEvent.setup();
    const now = new Date('2026-11-22T12:30:00Z'); // 13:30 in Paris, 01:30 on 23 November in Auckland
    const api = createTestApi({ now: () => now });
    const saved = await api.saveEntry(newDraft('2026-11-22', 'evening', 'Europe/Paris'));
    await renderSettings(api);
    const timeZone = section('Time zone');
    expect(timeZone).toHaveTextContent('Current time zone: Europe/Paris');
    expect(timeZone).toHaveTextContent('Sunday 22 November 2026');
    expect(timeZone).toHaveTextContent(/never moves the dates of entries/);

    await user.type(within(timeZone).getByRole('searchbox', { name: 'Search time zones' }), 'auckland');
    const list = within(timeZone).getByRole('listbox', { name: 'Time zone' });
    expect(within(list).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual([
      'Pacific/Auckland',
    ]);
    await user.selectOptions(list, 'Pacific/Auckland');
    await user.click(within(timeZone).getByRole('button', { name: 'Use this time zone' }));

    expect(await within(timeZone).findByRole('status')).toHaveTextContent(
      'New entries now use Pacific/Auckland. Existing entries keep their dates.',
    );
    expect(timeZone).toHaveTextContent('Current time zone: Pacific/Auckland');
    expect(await within(timeZone).findByText(/Monday 23 November 2026/)).toBeInTheDocument();
    await expect(api.getPreferences()).resolves.toMatchObject({ timeZone: 'Pacific/Auckland' });
    await expect(api.entriesOn('2026-11-22')).resolves.toEqual([saved]);
  });

  it('says when no time zone matches the search', async () => {
    const user = userEvent.setup();
    await renderSettings();
    const timeZone = section('Time zone');
    await user.type(within(timeZone).getByRole('searchbox', { name: 'Search time zones' }), 'Atlantis');
    expect(within(timeZone).getByText('No time zone matches “Atlantis”.')).toBeInTheDocument();
    expect(within(timeZone).getByRole('button', { name: 'Use this time zone' })).toBeDisabled();
  });

  it('explains Gentle view and keeps the per-surface choices while it is on', async () => {
    const user = userEvent.setup();
    const { api } = await renderSettings();
    const gentle = section('Gentle view');
    expect(gentle).toHaveTextContent('Nothing is deleted.');
    expect(gentle).toHaveTextContent('Save problems and backup passphrase requests always stay visible');
    await user.click(within(gentle).getByRole('switch', { name: 'Gentle view' }));
    await expect(api.getPreferences()).resolves.toMatchObject({ gentle: true, showScores: true, showDurations: true });
    expect(section('Writing')).toHaveTextContent('Gentle view is on');
    expect(within(section('Writing')).getByRole('radio', { name: /Quick Check-in/ })).not.toHaveAccessibleName(
      /About 30 seconds/,
    );
  });

  it('scrolls to and focuses a requested section', async () => {
    const { navigation } = await renderSettings();
    act(() => navigation.value?.navigate('settings', { section: 'timeZone' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Time zone' })).toHaveFocus();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Erase app data' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Erase app data' })).toHaveFocus();
  });

  it('shows an English error when a preference cannot be saved', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    vi.spyOn(api, 'setPreferences').mockRejectedValue({
      code: 'storage',
      message: 'The journal could not be saved. Check available disk space and try again.',
    });
    await renderSettings(api);
    await user.click(within(section('Gentle view')).getByRole('switch', { name: 'Gentle view' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The journal could not be saved.');
    expect(within(section('Gentle view')).getByRole('switch', { name: 'Gentle view' })).not.toBeChecked();
  });
});
