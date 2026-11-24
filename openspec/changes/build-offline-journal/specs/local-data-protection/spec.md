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

The system SHALL validate a backup before making it active and SHALL preserve the current journal when decryption or integrity validation fails.

#### Scenario: Wrong credential or corrupt backup

- **WHEN** the person attempts to restore a backup that cannot be decrypted or validated
- **THEN** restore fails clearly and the current journal remains intact.

#### Scenario: Clean restore

- **WHEN** a valid synthetic backup is restored to a clean destination
- **THEN** entries, dates, slots, and structured answers match the backed-up revision.

### Requirement: Portable backup recovery

Backups SHALL be recoverable on another Mac with a dedicated backup passphrase and SHALL offer optional passphrase storage in macOS Keychain without requiring it.

#### Scenario: New Mac restoration

- **WHEN** the person supplies a valid backup and its passphrase on a clean supported Mac
- **THEN** restoration succeeds without depending on a secret stored only on the original Mac.

#### Scenario: Keychain storage declined

- **WHEN** the person declines to remember the backup passphrase
- **THEN** the passphrase is not retained for future sessions and journal writing remains available.

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

#### Scenario: Recovery after a failed upgrade

- **WHEN** an upgrade attempt fails, including when part of the existing journal cannot be read or validated so that every retry fails
- **THEN** the paused upgrade explains the failure, keeps the existing journal unchanged, and offers to restore a validated backup, which keeps the existing journal aside without deleting it, or to erase application data.
