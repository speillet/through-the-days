# desktop-shell

## Purpose

Let a person write and navigate comfortably in a native macOS window with accessible controls and predictable appearance.

Sources: README_THROUGH_THE_DAYS.md §§3, 10, 13 phases 0–1; D-001.

## ADDED Requirements

### Requirement: Native personal workspace

The application SHALL launch as a macOS desktop application and provide a collapsible sidebar, Today view, and settings without requiring an account. A failure in one view SHALL leave the rest of the workspace usable.

#### Scenario: First launch offline

- **WHEN** the person launches the app with no network connection
- **THEN** Today and settings are usable without authentication or an online service.

#### Scenario: Unavailable future views

- **WHEN** a later milestone has not been implemented
- **THEN** navigation identifies its unavailable state without presenting placeholder features as working.

#### Scenario: View failure

- **WHEN** the current view fails while it is shown
- **THEN** only that view is replaced by an English message offering Try again; navigation, the status area and the protection of unsaved input on close and quit remain, and Try again or choosing a view shows it again.

### Requirement: Appearance and navigation

The application SHALL support system-matched light/dark appearance, a manual override, standard full-screen behavior, keyboard focus, and usable small-window layouts.

#### Scenario: Manual theme choice

- **WHEN** the person overrides the system theme and restarts
- **THEN** the selected appearance is restored.

#### Scenario: Keyboard writing

- **WHEN** the person navigates the sidebar and opens a draft using the keyboard
- **THEN** focus remains visible and the editor is reachable without a mouse.

### Requirement: Stored display preferences

The application SHALL save each display-preference change over the journal's stored display preferences, never over defaults shown in their place. While the stored preferences cannot be read, the application SHALL show the defaults, save no change unless the preferences can be read again, and replace them only when the person explicitly resets them. No display-preference change SHALL be made while a restore or an erase replaces the journal.

#### Scenario: Stored preferences cannot be read

- **WHEN** the journal's stored display preferences cannot be read, for example because a newer version saved them, and the person collapses the sidebar, presses ⌘+ or changes a setting
- **THEN** nothing is saved, the stored time zone, theme and other choices are kept, and Settings explains this and offers Reset display settings.

#### Scenario: Preferences readable again

- **WHEN** the person changes a display preference after a failed read and the stored preferences can now be read
- **THEN** that change is applied to the stored preferences rather than to the defaults that were shown.

#### Scenario: Explicit reset

- **WHEN** the person chooses Reset display settings in Settings
- **THEN** the stored display preferences, including the time zone, are replaced by the defaults without changing any entry, and later changes are saved again.

#### Scenario: Text size during a restore or an erase

- **WHEN** the person presses ⌘+, ⌘− or ⌘0 while a dialog is open, such as the restore or erase confirmation while it replaces the journal
- **THEN** the text size stays as it is and nothing is saved, so a restored journal keeps the display preferences of its backup and an erased journal starts with the defaults.

### Requirement: Independent locale and time zone

The application SHALL default to English en-GB dates and Monday-first calendars while allowing the journal time zone to be configured independently of language.

#### Scenario: French operating system

- **WHEN** the Mac system language is French
- **THEN** application labels remain English and date formatting follows en-GB.

#### Scenario: Current offsets in the time-zone list

- **WHEN** daylight saving changes a zone's UTC offset
- **THEN** the time-zone list shows that zone with its new offset the next time it is shown, and searching for the new offset finds it.

#### Scenario: Time-zone setting

- **WHEN** the person changes the journal time zone
- **THEN** new-entry defaults use that setting while historical journal dates remain unchanged.

### Requirement: One running copy

The application SHALL run as a single copy: launching it again while it is open SHALL bring the open window forward, and that launch SHALL exit before it opens the journal or changes any application file.

#### Scenario: Second launch while open

- **WHEN** the person launches the app again while its window is open
- **THEN** the open window comes forward with its writing intact, no second window opens, and the second launch leaves the journal, its backups and the backup settings untouched.
