# journal-editor

## Purpose

Support comfortable, faithful journal writing with one authoritative document and portable readable exports.

Sources: README_THROUGH_THE_DAYS.md §§4.4, 7, 11.1, 20 cases 3 and 22.

## ADDED Requirements

### Requirement: Readable rich writing

The editor SHALL support headings, paragraphs, lists, emphasis, and quotations without imposing an arbitrary journal-length limit.

#### Scenario: Long Unicode entry

- **WHEN** the person writes a long entry with accented text, emoji, lists, and quotes
- **THEN** all content remains editable and readable without truncation.

### Requirement: Portable document fidelity

The system SHALL maintain one authoritative editable document and derive Markdown output from it rather than maintaining independently editable versions.

#### Scenario: Edit and export

- **WHEN** the person changes formatted text and generates its Markdown representation
- **THEN** the export reflects the current document, preserving text and supported structure.

### Requirement: Mac editing controls

The editor SHALL provide standard Command-B, Command-I, and explicit Command-S behavior, with a hideable toolbar and distraction-free focus mode.

#### Scenario: Explicit save

- **WHEN** the person presses Command-S after typing
- **THEN** the current revision is requested for persistence and its save state is shown.

#### Scenario: Focus mode

- **WHEN** the person enters distraction-free writing
- **THEN** nonessential panels are hidden while writing remains accessible.

### Requirement: User authorship

The system SHALL preserve user-authored text in its chosen language and SHALL change it only through the person's editing actions.

#### Scenario: French journal text

- **WHEN** the person saves and reloads a French entry
- **THEN** its original words, Unicode characters, and language are preserved.

#### Scenario: Optional assistance later

- **WHEN** a model offers a suggestion elsewhere in the app
- **THEN** the journal document remains unchanged until a separate explicit user edit.
