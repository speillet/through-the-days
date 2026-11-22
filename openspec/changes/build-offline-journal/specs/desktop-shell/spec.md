# desktop-shell

## Purpose

Let a person write and navigate comfortably in a native macOS window with accessible controls and predictable appearance.

Sources: README §§3, 10, 13 phases 0–1; D-001.

## ADDED Requirements

### Requirement: Native personal workspace

The application SHALL launch as a macOS desktop application and provide a collapsible sidebar, Today view, and settings without requiring an account.

#### Scenario: First launch offline

- **WHEN** the person launches the app with no network connection
- **THEN** Today and settings are usable without authentication or an online service.

#### Scenario: Unavailable future views

- **WHEN** a later milestone has not been implemented
- **THEN** navigation identifies its unavailable state without presenting placeholder features as working.

### Requirement: Appearance and navigation

The application SHALL support system-matched light/dark appearance, a manual override, standard full-screen behavior, keyboard focus, and usable small-window layouts.

#### Scenario: Manual theme choice

- **WHEN** the person overrides the system theme and restarts
- **THEN** the selected appearance is restored.

#### Scenario: Keyboard writing

- **WHEN** the person navigates the sidebar and opens a draft using the keyboard
- **THEN** focus remains visible and the editor is reachable without a mouse.

### Requirement: Independent locale and time zone

The application SHALL default to English en-GB dates and Monday-first calendars while allowing the journal time zone to be configured independently of language.

#### Scenario: French operating system

- **WHEN** the Mac system language is French
- **THEN** application labels remain English and date formatting follows en-GB.

#### Scenario: Time-zone setting

- **WHEN** the person changes the journal time zone
- **THEN** new-entry defaults use that setting while historical journal dates remain unchanged.
