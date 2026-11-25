# local-data-protection

## Purpose

Give the person deliberate deletion and recoverable local backups with accurate explanations of how private records are protected.

Sources: README_THROUGH_THE_DAYS.md §§10.3, 12, 13 phase 6, 19.3, 20 case 12; D-003–D-007.

## ADDED Requirements

### Requirement: Thirty-day recoverable trash

The system SHALL retain deleted entries in local trash for 30 days, permit restoration during retention, and remove expired retained journal data while active or at the next launch. Explicit permanent deletion SHALL also be available.

#### Scenario: Accidental deletion

- **WHEN** the person restores a deleted entry within 30 days and its slot is free
- **THEN** the complete entry and its answers return to the active journal.

#### Scenario: Retention expires

- **WHEN** a trashed entry has passed its 30-day retention period and the application is active or next launches
- **THEN** the entry and its related retained live-journal data are removed, ordinary restoration is unavailable, and older independent backups remain subject to their separate policy.

#### Scenario: Occupied restore slot

- **WHEN** restoration targets an occupied journal date/slot
- **THEN** the system reports the conflict without overwriting or purging either record.

#### Scenario: Explicit permanent deletion

- **WHEN** the person explicitly confirms permanent deletion of a trashed entry
- **THEN** the entry is removed from the application's retained journal records and the app explains that earlier backups may still contain it.

#### Scenario: Deleted text leaves the live journal files

- **WHEN** a confirmed permanent deletion or an expiry purge removes a trashed entry
- **THEN** the live journal files in the application data folder no longer contain the entry's text once the removal completes, without waiting for the application to quit, and a launch after an interrupted session removes any of that text that remained.

### Requirement: Accurate live-store protection

The application SHALL describe its MVP live journal as protected by macOS session/disk controls, without claiming application-level SQLite encryption or assuming FileVault is enabled.

#### Scenario: Protection information

- **WHEN** the person opens privacy information
- **THEN** it states the live-store protection model and distinguishes it from encrypted backups.

### Requirement: Encrypted local backups before real use

The system SHALL provide encrypted local backups and a tested restore path before real personal use, keeping backup contents outside the repository and avoiding automatic remote upload.

#### Scenario: Backup created

- **WHEN** the person creates a backup from synthetic journal data
- **THEN** the result is encrypted, identifies its backup format/version, and contains no unencrypted journal payload alongside it.

#### Scenario: Interrupted backup write

- **WHEN** backup creation is interrupted
- **THEN** a previously valid backup remains available and an incomplete artifact is not reported as a successful backup.

### Requirement: Safe restore

The system SHALL validate a backup before making it active and SHALL preserve the current journal when the backup cannot be reached, decrypted or validated, or when the safety backup of a readable current journal fails. When a backup folder and the session passphrase are available and the current journal holds entries, the system SHALL publish a safety backup of it before replacing it, and SHALL skip that safety backup only if the journal cannot be read and the person explicitly confirms it.

#### Scenario: Wrong credential or corrupt backup

- **WHEN** the person attempts to restore a backup that cannot be decrypted or validated
- **THEN** restore fails clearly and the current journal remains intact.

#### Scenario: Backup no longer reachable

- **WHEN** the person restores a backup whose drive was disconnected, or whose file was moved, after it was chosen
- **THEN** restore fails with an explanation that the backup is unavailable, without asking to check the passphrase, and the current journal remains intact.

#### Scenario: Safety backup fails

- **WHEN** the safety backup made before replacing a readable journal fails, for example because the backup drive was disconnected
- **THEN** the restore is cancelled with an explanation of that cause, no confirmation can replace the journal without that safety backup, and the current journal remains intact.

#### Scenario: Unreadable current journal

- **WHEN** the current journal cannot be read to make its safety backup
- **THEN** the restore replaces it only after the person explicitly confirms restoring without a safety backup.

#### Scenario: Clean restore

- **WHEN** a valid synthetic backup is restored to a clean destination
- **THEN** entries, dates, slots, and structured answers match the backed-up revision.

#### Scenario: Interrupted restore

- **WHEN** the application quits, crashes or loses power before a restore completes, including a restore that replaces a journal that could not be opened
- **THEN** the next launch opens either the unchanged current journal or the complete restored journal, never an empty or partially restored one, and no journal file that the restore set aside is deleted.

### Requirement: Portable backup recovery

Backups SHALL be recoverable on another Mac with a dedicated backup passphrase and SHALL offer optional passphrase storage in macOS Keychain without requiring it. A Keychain failure SHALL NOT undo a passphrase change; after a change in Settings or the backup banner, the app SHALL say what Keychain did not do. A remembered passphrase read at launch SHALL NOT hold up or override a passphrase change, and the app SHALL say when a due backup or opening the journal waits for that read.

#### Scenario: New Mac restoration

- **WHEN** the person supplies a valid backup and its passphrase on a clean supported Mac
- **THEN** restoration succeeds without depending on a secret stored only on the original Mac.

#### Scenario: Keychain storage declined

- **WHEN** the person declines to remember the backup passphrase
- **THEN** the passphrase is not retained for future sessions and journal writing remains available.

#### Scenario: Keychain refuses a passphrase change

- **WHEN** macOS Keychain refuses to store or remove the backup passphrase while the person sets, changes or forgets it in Settings or from the backup banner
- **THEN** the change still applies to the current session, a due backup proceeds with a newly entered passphrase, and the app says what Keychain did not do: the passphrase was not remembered, one remembered before may remain in Keychain, or both, with how to delete one that may remain.

#### Scenario: Keychain prompt unanswered with the journal open

- **WHEN** a backup is due on an open journal while reading the remembered passphrase at launch waits for an answer to a macOS Keychain prompt, which may open behind the window
- **THEN** the backup banner says that the app waits for Keychain, journal writing remains available, a passphrase entered or forgotten meanwhile does not wait for that read, and the late answer never replaces it.

#### Scenario: Keychain prompt unanswered before a protected upgrade

- **WHEN** an existing journal needs its protected upgrade and the launch waits for an answer to a macOS Keychain prompt to read the remembered passphrase for the pre-migration backup
- **THEN** after a few seconds the opening screen says that the app waits for Keychain and that the backup and upgrade follow the answer, and the journal stays unchanged until then.

### Requirement: Protected secrets and logs

The system SHALL store configured API credentials using macOS Keychain and SHALL exclude private journal text, credentials, and private model payloads from default logs.

#### Scenario: Failure logging

- **WHEN** a private-data operation fails
- **THEN** diagnostics identify the operation without disclosing journal text or secrets.

### Requirement: Daily backups with launch catch-up

The system SHALL perform a daily encrypted local backup while active and catch up on the next launch after a missed day, without requiring an MVP background service or inventing historical snapshots.

#### Scenario: App active on a new day

- **WHEN** the app is active on a civil date without a successful daily backup and the backup credential is available
- **THEN** it creates a consistent encrypted snapshot and records success only after completion.

#### Scenario: App was closed

- **WHEN** the person launches the app after a daily backup was missed
- **THEN** the app initiates a backup of the currently recoverable state without claiming to reconstruct missed days.

#### Scenario: Backup credential unavailable

- **WHEN** a due backup needs a passphrase that is not available
- **THEN** the app requests it and reports backup as pending while keeping journal writing usable.

### Requirement: Recoverable pre-migration backup

Before migrating an existing journal, the system SHALL create a consistent encrypted recoverable backup or pause migration with a clear recovery action; creating a fresh empty database SHALL not require a nonexistent prior snapshot.

#### Scenario: Upgrade needs a passphrase

- **WHEN** an existing journal needs migration and the backup credential is unavailable
- **THEN** migration waits for backup/recovery input without altering the prior database.

#### Scenario: Backup fails before migration

- **WHEN** the pre-migration backup cannot be completed or validated
- **THEN** the existing journal remains intact and no unprotected schema upgrade proceeds.

#### Scenario: Passphrase typed while Keychain answers late

- **WHEN** the person upgrades an existing journal with a newly typed passphrase while the launch is still reading the remembered passphrase from macOS Keychain
- **THEN** the pre-migration backup is encrypted with the typed passphrase, even when Keychain answers the launch's read first.
