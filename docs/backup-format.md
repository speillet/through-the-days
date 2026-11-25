# Backup format and recovery contract

Encrypted backups are how a person gets their journal back after losing a Mac, damaging a disk or making a mistake. This contract specifies what a backup contains, how it is written, validated, kept and restored, and what stays unencrypted. It is written for people who maintain the backup code and for anyone who needs to trust it.

The behaviour described here is implemented in `crates/journal-core` (`recovery.rs`, `registry.rs`, `plan.rs`, `schema.rs`, `store.rs` and, for milestone deletion, `reviews.rs`) and covered by the tests listed under [Verification](#verification). The desktop shell in `apps/desktop/src-tauri` adds the native dialogs, Keychain storage and scheduling. Sections that describe desktop behaviour say so.

## Decisions

| Source | Consequence for backups |
|---|---|
| [D-004](product-decisions.md) and [ADR 0002](adr/0002-separate-live-store-protection-from-backup-encryption.md) | The live database relies on macOS protections. Backup encryption is a separate, independent protection. |
| [D-005](product-decisions.md) | Encrypted backup and a tested restore exist before real personal use. |
| [D-006](product-decisions.md) | Backups use a dedicated, portable passphrase. Keychain storage is optional. |
| [D-007](product-decisions.md) | One backup per day while the app is open, with catch-up at the next launch. |
| [D-009](product-decisions.md) | The 30 latest validated backups are kept, in a folder chosen in the app. Pruning happens only after a replacement succeeds. |
| [D-003](product-decisions.md) | The 30-day trash is a separate policy from the 30-backup retention. |

## What a backup contains

A backup holds the whole journal database at one consistent moment:

- every active entry with its writing, check-in answers, actions and small wins;
- the trash: entries deleted less than 30 days earlier, with their deletion time;
- authored weekly notes and private timeline milestones, with their identities and revisions;
- optional local weekly summaries and their source fingerprints, subject to freshness checks after restore;
- the display preferences stored in the journal.

A backup does not contain the backup plan (chosen folder, last successful backup, Keychain choice), the passphrase or anything else from Keychain.

Content removed from the journal before a backup is made is not in that backup: the snapshot is rebuilt, which discards freed database pages. Older backups keep whatever they contained until they are pruned.

## File format

A backup file is an [age v1](https://c2sp.org/age) encrypted file in binary form (not ASCII-armoured), with exactly one scrypt passphrase recipient. Any age v1 implementation can decrypt it.

- **Key derivation:** scrypt with r = 8 and p = 1. The age library chooses the work factor N so that key derivation takes about one second on the Mac that creates the backup: 2^19 or 2^20 on a recent Mac. Decryption accepts work factors up to 2^22 (about 4 GiB of memory) on every Mac. An age header is authenticated only after key derivation, so this limit bounds the memory and time that a crafted file can demand; a higher work factor is refused before any derivation runs. A new backup is verified with the same limit, so a Mac that calibrated above it would report a failed backup instead of keeping one it could not restore.
- **Encryption:** ChaCha20-Poly1305 in 64 KiB chunks (age's STREAM construction). The header is authenticated with HMAC-SHA-256. Modified, reordered or truncated files fail to decrypt.

The decrypted payload has this layout:

| Offset | Length | Content |
|---|---|---|
| 0 | 24 bytes | Magic: `THROUGH-THE-DAYS`, NUL, `BACKUP`, NUL (hex `54 48 52 4F 55 47 48 2D 54 48 45 2D 44 41 59 53 00 42 41 43 4B 55 50 00`) |
| 24 | 1 byte | Format version: `0x01` |
| 25 | rest | SQLite database image, starting with `SQLite format 3` and a NUL byte |

The image is a consistent copy of the live database:

1. SQLite's online backup API copies the live connection into memory as one read transaction, coordinating with the write-ahead log.
2. `VACUUM` rebuilds the in-memory copy without free pages. The copy's temporary storage is in memory too (`temp_store=MEMORY`), so the rebuild never spills to a temporary file.
3. The copy is serialised, and bytes 18 and 19 of its header (the file-format versions) are set to 1. The live journal uses WAL mode (value 2); SQLite [documents this change](https://www.sqlite.org/c3ref/deserialize.html) so that an image can be deserialised. Restoring into the live journal sets WAL mode again.

The schema version is SQLite's `user_version`, a big-endian integer at offset 60 of the image header. This reading build writes version 3 and can read versions 1, 2 and 3. The age envelope and backup format version remain unchanged.

The plaintext exists only in memory. Every SQLite connection that holds decrypted content (the snapshot, the staged copy of a backup and its rebuilt copy) is an in-memory database whose temporary storage is also in memory (`temp_store=MEMORY`). `VACUUM`, integrity checks and upgrades therefore never spill decrypted pages to temporary files, whatever the journal's size. Snapshots, verification and restore never write decrypted data to disk; a restore writes only into the live journal.

## File names and permissions

A published backup is named `ttd-<created-at>-<uuid>.ttd.age`: `<created-at>` is the creation time in Unix seconds (UTC) and `<uuid>` is a random version-4 UUID. Listing and pruning only consider names that:

- start with `ttd-` and end with `.ttd.age`;
- contain only ASCII letters, digits, `-` and `.`, and never `..`;
- are at most 128 bytes long.

While a file is being written, it is named `.ttd-incomplete-<random>` in the same folder and holds ciphertext only. Backups, the registry and the backup plan are created with permissions `0600`, so only the person's macOS account can read them.

## The registry

Each backup folder has a registry, `.through-the-days-backups.json`. It lists the backups this application encrypted, verified and published there:

```json
{
  "version": 1,
  "backups": [
    {
      "name": "ttd-1795363200-0d4f6c1e-3b8a-4f57-9a43-2f8c5e7b1d90.ttd.age",
      "createdAt": 1795363200,
      "sha256": "<64 lowercase hexadecimal characters>"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `version` | Registry format version. Only `1` is accepted. |
| `name` | File name inside the folder. |
| `createdAt` | Creation time in Unix seconds. Listing orders backups by it, then by name. Pruning uses the same order but always keeps the backup just published (see [Retention](#retention)). |
| `sha256` | SHA-256 digest of the encrypted file as published. |

The registry holds no journal content: only file names, times and digests. It is replaced atomically (temporary file, flush, rename, folder flush).

A registry with another version, unknown fields or invalid JSON, or a directory where the registry belongs, is refused with the `backupRegistry` error, and nothing is deleted. New backups to that folder fail before a snapshot is taken, and listing reports the same error. To recover, choose a different folder. Backups in the old folder remain restorable with the file picker, but they are no longer listed or pruned. A registry that the folder does not let the app read at all is reported as `backupFolder` instead.

**Listing.** The validated backups of a folder are the registered entries whose name passes the name check and whose file still exists as a regular file. They are listed newest first with their name, creation time and size. A folder without a registry, including one that is currently unavailable, has no validated backups.

## Publishing a backup

Explicit backups, daily backups, pre-migration backups and the safety backup before a restore all follow the same steps:

1. Check the passphrase rule, that the folder exists and is a folder (`backupFolder` otherwise), and that its registry can be read (`backupRegistry` or `backupFolder`). These checks come first, so a folder or registry problem never costs a snapshot, two key derivations and a written file.
2. Remove regular files named `.ttd-incomplete-*` left by an interrupted earlier attempt. Directories, symbolic links and all other files are never touched.
3. Create a new temporary file in the folder. A folder that refuses it, for example because it is read-only, fails here as `backupFolder`.
4. Take the snapshot described above.
5. Encrypt it into the temporary file and flush the file to permanent storage.
6. Verify it: decrypt the temporary file, compare it byte for byte with the plaintext, then load and validate it exactly as a restore would, including the upgrade of an older schema.
7. Compute the SHA-256 digest of the encrypted file.
8. Publish it by renaming it to its final name in the same folder. The rename never replaces an existing file. Some file systems cannot rename without replacing: exFAT on macOS, the usual format of drives shared with other computers, reports the exclusive rename as unsupported (`ENOTSUP`). The app then checks that the final name, which contains a new random UUID, is unused and renames the file with a plain rename. A name that is already taken fails the backup and leaves that file untouched. Then flush the folder.
9. Register it in the registry. If registration fails, the published file is removed and the backup is reported as failed.
10. Prune older backups (see [Retention](#retention)).

Success is reported, and the daily backup recorded, only after step 9. A failure in steps 1 to 9 leaves earlier backups untouched. A failure while pruning sets a retention warning but does not make the new backup fail.

**Checking a folder.** `probe_backup_folder` checks that a folder can receive backups without making one: it writes and flushes a small file named `.ttd-incomplete-probe-*`, publishes it under a new name with the same exclusive rename and fallback as step 8, and removes it. Any failure is `backupFolder`, and nothing is left behind; a leftover from an interrupted check carries the temporary prefix, so the next backup removes it.

## Validation

A backup is validated when it is created and again before it is restored:

- decryption with the passphrase, which authenticates every chunk;
- the magic and format version 1;
- an SQLite header and `PRAGMA integrity_check` returning `ok` (page structure, indexes, unique and check constraints);
- exactly the expected objects for the source schema: `journal_entries`, `preferences` and `active_slot`, plus `weekly_reviews` and `timeline_milestones` in schema 3 and SQLite's internal indexes. Triggers, views and unrelated tables are refused;
- a supported schema version; an older one is upgraded first (see [Schema versions](#schema-versions));
- every entry passes the validation used when saving it (date, slot, score ranges, emotion identifiers, actions, small wins and document structure), its columns match its content, its revision is at least 1, and a completed entry still meets the completion rule. The document may contain only the editor's node and mark types (links are not among them), no empty text nodes, and at most 32 levels of nesting, counting the document itself as the first;
- at most one active entry for each date and slot;
- weekly-review keys that match valid Monday week starts and positive stored revisions, and valid milestone IDs/dates that match their keys and revisions;
- stored display preferences that can be read and that meet the rules for saving them: a known time zone, the theme `system`, `light` or `dark`, and a text size of 100, 115, 130 or 150 per cent.

The staged copy lives in memory with SQLite's defensive settings `trusted_schema=OFF` and `cell_size_check=ON`, and its temporary storage in memory.

The schema objects are checked by name only, because their definitions are not taken from the backup. After validation, the rows are copied with explicit column lists into a new in-memory database created with this build's schema. A restore therefore installs this build's tables, constraints and index, never the definitions stored in the backup, and those constraints apply to the copy: duplicate entry identifiers or preference keys, two active entries for one date and slot, an invalid slot, a revision below 1 or invalid JSON fail the restore.

## Schema versions

A restore accepts schema versions 1, 2 and 3. Older backups are upgraded inside the staged in-memory copy with the same migration steps used for the live journal, then validated as version 3. A backup with a newer or unknown version is refused, and the journal is unchanged.

The upgrade from version 1 to version 2:

- adds the trash column;
- limits the one-entry-per-slot index to entries that are not in the trash;
- records perceived progress as missing for existing entries.

The upgrade from version 2 to version 3 adds `weekly_reviews` and `timeline_milestones`, preserving existing entry aggregates and preferences. Reading-source inclusion defaults to enabled for older entries. An existing live journal still requires its protected pre-migration backup before either upgrade proceeds. Weekly notes and private milestones are authored journal records, not disposable indexes.

## Restoring

Restoring replaces the entire journal (entries, trash and preferences) with the content of the backup. The backup plan and the Keychain item are not part of the journal, so they are unchanged. In the desktop app, no display preference can be changed while the restore dialog is open, so the restored journal keeps the backup's preferences.

1. The backup is decrypted, validated and rebuilt with this build's schema in memory (see [Validation](#validation)). Any failure stops the restore here, and the live journal is unchanged.
2. The rebuilt copy replaces the live database through SQLite's online backup API. The replacement is committed as a whole or rolled back. It copies every page, so it also replaces a live journal with damaged pages (see [Damaged journal files](#damaged-journal-files)).

**Safety backup (desktop app).** Before replacing a journal that contains entries, the desktop app publishes a regular backup of it when a folder is chosen and the passphrase is available in this session. If that safety backup fails, the restore is cancelled.

When the current journal cannot be read, because a read fails or its snapshot reports `damaged` (see [Damaged journal files](#damaged-journal-files)), no safety backup of it can be made: the restore stops with `safetyBackupFailed`, and the person can then confirm replacing the journal without one. Any other failure, such as `backupFolder` for a disconnected drive, cancels the restore with that error even with this confirmation, and the restore dialog names the cause.

**Choosing the backup (desktop app).** A registered backup is restored only while the chosen folder still lists it, and a picked file only while it can be read. The app first copies the encrypted file into its data folder, because the safety backup may prune the backup being restored. A backup that cannot be reached, for example on a disconnected drive, fails with `backupUnavailable` rather than `restore`, so the passphrase is not put in doubt; a copy that cannot be written in the data folder fails with `storage`. In both cases the journal is unchanged.

Restored trash entries keep their original deletion time. Those whose 30 days have passed are removed by the next trash purge, at launch or while the app is open. Until then they cannot be restored from the trash: `journal-core` refuses to restore any trashed entry whose 30 days have passed, as if it were already gone (`notFound`).

**Journal that cannot be opened (desktop app).** When the journal cannot be opened at launch, for example because it is damaged or was made by a newer version, the startup screen restores a backup by replacing the journal file. That file stays untouched until the replacement is complete:

1. The backup is verified, then restored into a new journal file in the data folder, named with the `.ttd-restore-staging-` prefix. That journal is closed, so the file alone holds it.
2. A marker, `restore-in-progress.json`, is written and flushed. It names the restored file and the name under which the journal will be kept aside.
3. The journal database and its companions are renamed `journal.unreadable-<seconds>.sqlite`, with the same suffixes, and are kept, never deleted. The restored file is then renamed `journal.sqlite`, the folder is flushed and the marker is removed.

If the app quits, crashes or loses power during these steps, the next launch settles the marker before anything else. Until the restored file has the journal's name, the journal's files go back to their names and the journal opens as it was; after that, the restored journal opens. Leftover staging files are removed next, so a launch never opens an empty journal in place of the one being replaced. While a marker cannot be settled, the start fails instead. Erasing all app data removes the marker.

The passphrase rule is not applied when restoring, so every backup stays restorable with the passphrase it was created with.

## Damaged journal files

When SQLite cannot read part of the live journal file, `journal-core` reports `damaged` ("Part of the journal file is damaged and could not be read. You can restore your journal from a backup.") rather than the storage error about disk space. This covers a damaged page, schema or header (`SQLITE_CORRUPT`, `SQLITE_NOTADB`) and a failed or short read.

- **At open.** A file whose header or schema cannot be read, including a file that is not an SQLite database at all, is `damaged`. `unsupported` stays for a readable database that is newer or not a journal. Both are detected through a read-only connection and never changed.
- **While open.** A journal with a damaged page can open, but reads that reach the page fail with `damaged`. A backup of it fails with `damaged` too, because its snapshot cannot be rebuilt; no file is published and earlier backups are untouched.
- **Recovery.** A validated backup still replaces such a journal (see [Restoring](#restoring)).

## Retention

After each successful publication, pruning keeps the 30 newest registered backups whose files still exist, and deletes older registered backups. A file is deleted only when its name passes the name check and its SHA-256 digest still matches the registry.

- **The new backup is kept.** The backup just published always counts as the first of the 30 and is never deleted by its own publication. The others are ordered by creation time, which shows which are oldest only while none of them is newer than the backup just made. When one is newer (the clock was set back, or ran ahead earlier) and a backup would be pruned, nothing is deleted and a retention warning is reported, until the clock again passes every registered creation time.
- **Count, not time.** Retention keeps 30 backups, whatever their dates, independently of the 30-day trash. Explicit, pre-migration and safety backups count like daily ones.
- **Never deleted:** files that are not in the registry, files whose content changed after registration, files that are not regular files, names outside the pattern, and anything outside the folder.
- **Changed or unsafe entries** are removed from the registry, their files are left in place, and a retention warning is reported.
- **Missing files** are removed from the registry silently: the person deleted them.
- **Failures** to inspect, delete or rewrite the registry keep the affected entries and report a retention warning.

Deleted entries, including permanently deleted ones, can remain in older backups until those backups are pruned, about 30 backups later, or until the person deletes the backup files. Deleting an entry is not forensic erasure.

## Destination

Backups go to a folder the person chooses in the desktop app with the native macOS folder dialog. There is no implicit default folder, and the web interface never supplies paths. Any local or external folder works, including exFAT and FAT32 drives (see step 8 of [Publishing a backup](#publishing-a-backup)); those file systems keep no permissions, so the owner-only permissions described above apply only on APFS and HFS+. The chosen folder is stored in the device-local backup plan (`backup-plan.json` in the application data folder), outside the journal database.

The app never uploads backups. If the person chooses a folder synced by iCloud Drive, Dropbox or a similar service, that service copies the encrypted files; that is the person's choice. Temporary files hold ciphertext only.

Choosing another folder leaves earlier backups where they are. Listing and pruning apply only to the current folder.

## Passphrase

- **Rule:** at least 12 characters, counted as Unicode scalar values, so `é` counts as one. There are no composition rules. `journal-core` uses the passphrase exactly as given, without trimming or Unicode normalisation.
- **Portable:** the backup file and its passphrase are enough to restore on another Mac. No device key is involved.
- **Keychain (desktop app):** remembering the passphrase in macOS Keychain is optional. The item uses service `com.throughthedays.app.backup` (`com.throughthedays.app.dev.backup` in development builds) and account `backup-passphrase`. A passphrase that is not remembered is kept in memory for the current session only.
- **Keychain failures (desktop app):** when Keychain refuses to store or remove the item, a passphrase entered or forgotten in the app still applies to the session, and the app no longer reads the item at launch. After a change in Settings or from the backup banner, the app says what Keychain did not do: the passphrase was not remembered, one remembered before may remain in Keychain, or both, with how to delete one that may remain using Keychain Access. The protected-upgrade screen does not report a refused store or removal yet. The launch reads a remembered passphrase without making a passphrase change wait, and uses the read only after a change under way has finished, so the newer choice wins, including for a pre-migration backup. While a due backup or the opening of an older journal waits for a Keychain prompt, the app says so.
- **Changes:** a new passphrase applies to future backups only. Existing backups keep the passphrase they were created with; the app does not re-encrypt them.
- **Loss:** a forgotten passphrase makes the backups created with it unrecoverable. There is no recovery key and no reset.

## Daily schedule and catch-up

A daily backup is due when no backup has succeeded on the current journal date in the configured time zone. The desktop app checks whether a backup is due while it is open, and at launch, which catches up after days when it was closed. A catch-up backup records the current state; it never reconstructs the missed days.

When a backup is due but no folder is chosen or the passphrase is unavailable, the check reports which one is needed instead of failing. The desktop app shows backup as pending and writing continues. The date and time of the last success are recorded in the backup plan only after a backup was published and registered.

## Pre-migration backups

Before upgrading an existing journal to a newer schema, the app publishes a regular backup of the unmodified journal, which needs a chosen folder and the passphrase. Verifying that backup also runs the upgrade on its staged copy. The live journal is upgraded only after the backup is registered, in one transaction, and only if nothing else changed the journal in the meantime.

If the backup cannot be made, the journal stays at its earlier version, unchanged, and the app waits for the folder or passphrase. Creating a new, empty journal is not a migration and needs no backup. Pre-migration backups are ordinary registered backups and count towards the 30.

## Failure handling

| Situation | Outcome |
|---|---|
| Wrong passphrase | Restore fails with an English explanation; the journal is unchanged. |
| Corrupted or modified file | Decryption fails authentication; restore fails and the journal is unchanged. |
| Truncated file | age detects that the final chunk is missing or incomplete; restore fails and the journal is unchanged. |
| Newer format or schema version | Restore fails and the journal is unchanged. |
| Header demands a work factor above 2^22 | Refused before key derivation; restore fails and the journal is unchanged. |
| Backup with weakened table definitions | Its rows are restored into this build's schema; rows that break its constraints fail the restore. |
| Backup interrupted by a crash or power loss | Only a `.ttd-incomplete-*` file can remain. It is never listed and is removed by the next backup; earlier backups are intact. |
| Restore from the startup screen interrupted by a quit, crash or power loss (desktop app) | The next launch opens the journal as it was or the complete restored journal, never an empty one, and removes the staging files. |
| Folder missing, not a folder or read-only | `backupFolder` before any snapshot; no success is recorded and earlier backups are intact. |
| File system without exclusive renames (exFAT) | Published with a plain rename to its new, unused name. |
| Disk full | `backup`; no success is recorded and earlier backups are intact. |
| Verification fails | The backup fails as a validation failure and its temporary file is removed. |
| Registration fails | The published file is removed and the backup fails. |
| Registry damaged or from a newer version | `backupRegistry` before any snapshot; listing reports the same error and nothing is deleted. |
| Clock behind a registered backup | The new backup is kept; when pruning is due, nothing is deleted and a retention warning is reported. |
| Pruning cannot complete safely | Retention warning; the new backup is still valid. |
| Live journal damaged | Reads and backups report `damaged`; a validated backup can replace the journal. |
| Live journal cannot take the restored copy, such as on a full disk | `storage`; the replacement is rolled back and the journal is unchanged. |
| Backup to restore cannot be reached (desktop app): its drive is disconnected, the file was moved or the folder's registry cannot be read | `backupUnavailable`; the journal is unchanged. |
| Safety backup fails while the current journal can be read (desktop app) | The restore is cancelled with the safety backup's error, such as `backupFolder`, even if the person would confirm restoring without one; the journal is unchanged. |
| Current journal cannot be read for its safety backup (desktop app) | `safetyBackupFailed`; the journal is replaced without a safety backup only after the person confirms it. |

Errors contain fixed English messages and stable codes. They never contain journal text, paths or passphrases. The codes `journal-core` uses for backups and recovery:

| Code | Meaning |
|---|---|
| `backupFolder` | The folder is missing, is not a folder, or refuses the files a backup writes. |
| `backupRegistry` | The folder's registry is damaged or from a newer version. |
| `backup` | Any other publication failure, such as a full disk. |
| `backupValidation` | The written backup did not decrypt to exactly the snapshot, or did not validate. |
| `restore` | The backup could not be decrypted or validated; the journal is unchanged. |
| `passphrase` | A new backup's passphrase has fewer than 12 characters. |
| `damaged` | Part of the live journal file cannot be read. |

The desktop app adds two restore codes: `backupUnavailable`, when the backup chosen for a restore cannot be found or read, and `safetyBackupFailed`, when the current journal cannot be read for its safety backup and the restore waits for the person's confirmation. Only `restore` asks the person to check the passphrase.

## Live journal durability

Each acknowledged commit of the live journal, and each checkpoint of its write-ahead log, is flushed past the drive's cache. The journal's connections use `synchronous=FULL` with `fullfsync=ON` and `checkpoint_fullfsync=ON`, so SQLite issues `F_FULLFSYNC` on macOS instead of a plain `fsync`. A power cut or kernel panic just after "Saved" then keeps the acknowledged revision, as it keeps backups, the registry and the backup plan, which are flushed with `F_FULLFSYNC` as well. The commit that upgrades an older journal is flushed the same way. These settings are connection options: they never change the database file.

## Deleted content in the live journal

Permanently deleting an entry, purging trash after its 30 days and deleting a milestone remove the text from the live journal's files, not only from what the app shows. The journal's connections use `secure_delete=ON`, so SQLite overwrites deleted content with zeros. In WAL mode those zeroed pages first reach only the write-ahead log, `journal.sqlite-wal`: `journal.sqlite` keeps the old pages, and the log keeps earlier copies of them, until a checkpoint. Each of these deletions therefore runs `PRAGMA wal_checkpoint(TRUNCATE)` before it returns, which copies the log into `journal.sqlite` and empties it. Opening the journal runs the same checkpoint, so a log that a crash left with deleted text is folded in at the next launch.

The checkpoint is best effort. The deletion stands even when another process keeps the journal busy or the checkpoint fails; the text then leaves at a later checkpoint: the next deletion, the next launch or a clean quit. Removing text from these files is not forensic erasure: the file system and its snapshots, Time Machine and other copies of the disk can still hold earlier versions, and backups keep their content until they are pruned (see [Retention](#retention)).

## What is not encrypted

- **The live journal**, `journal.sqlite` in the application data folder (`~/Library/Application Support/com.throughthedays.app`), is not encrypted by the application. It relies on macOS account and disk protections, including FileVault if the person has turned it on ([D-004](product-decisions.md)).
- **The backup plan** holds the folder path, the last success and two settings, without journal text.
- **A restore from the startup screen** writes the restored journal, unencrypted like the live journal, to a staging file in the data folder before it takes the journal's name. Its marker, `restore-in-progress.json`, holds two file names, without journal text.
- **The registry** holds file names, times and digests, without journal text.
- **File names** reveal when each backup was made. The age header reveals the scrypt salt and work factor, as in every age file.

## Recovery without the app

The format uses standard tools only, so a backup remains readable without Through the Days. With the [age](https://github.com/FiloSottile/age) command-line tool, `age --decrypt -o journal-backup.bin <backup>` asks for the passphrase. Then `tail -c +26 journal-backup.bin > journal.sqlite` removes the 25-byte prefix and leaves an SQLite database. These steps write the decrypted journal to disk, so work in a private location and delete the files afterwards. The app's restore remains the supported path: it validates the backup and upgrades older schema versions.

## Verification

The `journal-core` tests exercise this contract with real temporary SQLite databases and synthetic entries. Integration tests are in `crates/journal-core/tests/`; unit tests that need private steps, such as an injected rename failure, are in the `src/` file named.

| Behaviour | Test (`crates/journal-core/tests/`, or `src/` where named) |
|---|---|
| Encrypted format and prefix, owner-only permissions, no plaintext beside the backup, clean restore including trash, wrong passphrase, truncation | `recovery.rs`: `encrypted_snapshot_restores_on_a_clean_store_and_rejects_bad_credentials` |
| Populated journal unchanged by wrong passphrase, truncated, corrupted, empty, foreign and missing files | `recovery.rs`: `failed_restores_leave_a_populated_live_journal_untouched` |
| Format version, schema version, integrity, schema objects, entry and document validation (links, empty text, nesting), and preference validation (time zone, theme, text size) before restore | `recovery.rs`: `restore_validates_format_schema_and_content_before_replacing_the_journal` |
| A restore installs this build's schema; rows breaking its constraints are refused | `recovery.rs`: `restore_installs_this_builds_schema_whatever_definitions_the_backup_stored` |
| Excessive scrypt work factor refused before key derivation | `recovery.rs`: `a_backup_demanding_excessive_key_derivation_work_is_refused_at_once` |
| Restoring a version-1 pre-migration backup into a current journal | `recovery.rs`: `pre_migration_backup_of_an_older_schema_restores_into_a_current_journal` |
| Interrupted and failed backups keep the previous backup; only validated backups are listed | `recovery.rs`: `failed_backup_keeps_the_previous_valid_backup_and_lists_only_validated_ones`, `backup_that_cannot_be_registered_is_not_reported_or_left_behind`; `src/recovery.rs`: `a_published_backup_that_cannot_be_registered_is_removed` |
| Folder and registry problems fail before the snapshot is encrypted, with `backupFolder` or `backupRegistry` | `recovery.rs`: `folder_and_registry_problems_fail_before_the_snapshot_is_encrypted` |
| Publishing on a file system without exclusive renames; an existing file is never replaced | `src/recovery.rs`: `a_folder_without_exclusive_renames_still_receives_registered_backups`, `the_rename_fallback_never_replaces_an_existing_file`, `a_refused_rename_is_a_folder_failure_without_a_fallback` |
| Folder check | `recovery.rs`: `folder_check_accepts_a_writable_folder_and_leaves_nothing_behind`; `src/recovery.rs`: `the_folder_check_uses_the_rename_fallback_and_leaves_nothing_behind` |
| Decrypted copies keep SQLite's temporary storage in memory | `src/recovery.rs`: `decrypted_copies_keep_temporary_storage_in_memory` |
| Stale temporary files removed, nothing else touched | `recovery.rs`: `publication_removes_stale_incomplete_files_and_nothing_else` |
| Exactly 30 validated backups kept; changed, unsafe and unregistered files never deleted | `recovery.rs`: `retention_keeps_exactly_the_thirty_newest_validated_backups`, `pruning_never_deletes_changed_unsafe_or_unregistered_files` |
| The backup just published is kept when the clock is behind; nothing is deleted and a warning is reported | `recovery.rs`: `a_backup_made_while_the_clock_is_behind_is_kept_and_nothing_is_deleted` |
| Content deleted before a backup is not in it | `recovery.rs`: `backups_exclude_content_deleted_before_they_were_made` |
| Daily schedule, catch-up and pending states; no success recorded on failure | `recovery.rs`: `daily_backups_catch_up_current_state_without_inventing_closed_days`, `failed_daily_backup_records_no_success` |
| Registry listing rules and damaged registries | `recovery.rs`: `listing_reports_only_registered_backups_that_still_exist` |
| Pre-migration backup required; failed migration leaves the journal intact | `migration.rs`, `schema.rs` |
| Migration of frozen version-1 content, and frozen version-2 content still loading | `migration.rs`: `existing_journal_waits_for_recovery_then_migrates_with_nullable_progress`, `frozen_current_version_payload_still_loads_with_every_field` |
| Damaged pages, headers and schemas reported as `damaged`, never changed, and replaceable from a backup | `damaged.rs` |
| A live journal that cannot take a valid restored copy reports `storage` and keeps its content | `src/recovery.rs`: `a_live_journal_that_cannot_take_the_restored_copy_reports_a_storage_failure` |
| Trash past its 30 days cannot be restored before the purge | `journal.rs`: `trash_past_its_thirty_days_cannot_be_restored_before_the_purge` |
| Permanently deleted, purged and deleted-milestone text leaves the open journal's database file and write-ahead log; a log that a crash left is folded in when the journal opens | `journal.rs`: `permanent_deletion_removes_the_entry_text_from_the_live_database_file`, `purging_expired_trash_removes_the_entry_text_from_the_open_journal_files`, `opening_folds_in_a_log_that_still_holds_deleted_text_after_a_crash`; `reading.rs`: `deleting_a_milestone_removes_its_title_and_notes_from_the_open_journal_files` |
| Live journal and upgrade connections request full flushes | `src/store.rs`: `journal_connections_request_full_flushes_for_commits_and_checkpoints`, `the_upgrade_connection_requests_full_flushes_without_changing_the_file` |
| Backup plan atomic storage and corrupt-file reporting | `plan.rs` |

Scrypt calibration makes each published backup take about two seconds in tests: one second to encrypt and one to verify. Retention tests therefore register synthetic stand-in files with known digests instead of publishing 30 real backups. Crafted backups in the validation tests use a low work factor so they decrypt quickly. Published backups always use the calibrated work factor.

The desktop behaviour described above (dialogs, Keychain, the safety backup and scheduling) and recovery with the `age` command-line tool are not exercised by these tests. The decryption limit of 2^22 is the same in every build, so a development build, which may calibrate a lower work factor, still restores backups made by a release build.

The desktop shell's own tests cover the restore from the startup screen. `a_restore_from_the_startup_screen_that_stops_at_any_moment_never_opens_an_empty_journal`, in `apps/desktop/src-tauri/src/state/tests.rs`, copies the data folder at every point where that restore, or the launch that settles it, could stop, and checks what the next launch opens. Each copy is what a quit or a crash at that point leaves; the flushes that keep it so after a power cut are not tested.

Two checks are manual:

- **exFAT drive.** Create and mount a scratch exFAT image (`hdiutil create -size 64m -fs ExFAT -volname TTDCHECK check.dmg`, then `hdiutil attach -nobrowse -mountpoint <empty folder> check.dmg`), check a folder on it, make two backups there, list them and restore one into a fresh journal, then detach the image with `hdiutil detach <folder>`. On macOS 26 the exclusive rename fails there with `ENOTSUP`, and the fallback publishes the backups.
- **Power loss.** No test cuts power. The full-flush settings are checked by the unit tests above.
