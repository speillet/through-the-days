# Backup format and recovery contract

Encrypted backups are how a person gets their journal back after losing a Mac, damaging a disk or making a mistake. This contract specifies what a backup contains, how it is written, validated, kept and restored, and what stays unencrypted. It is written for people who maintain the backup code and for anyone who needs to trust it.

The behaviour described here is implemented in `crates/journal-core` (`recovery.rs`, `registry.rs`, `plan.rs` and `schema.rs`) and covered by the tests listed under [Verification](#verification). The desktop shell in `apps/desktop/src-tauri` adds the native dialogs, Keychain storage and scheduling. Sections that describe desktop behaviour say so.

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
- the display preferences stored in the journal.

A backup does not contain the backup plan (chosen folder, last successful backup, Keychain choice), the passphrase or anything else from Keychain.

Content removed from the journal before a backup is made is not in that backup: the snapshot is rebuilt, which discards freed database pages. Older backups keep whatever they contained until they are pruned.

## File format

A backup file is an [age v1](https://c2sp.org/age) encrypted file in binary form (not ASCII-armoured), with exactly one scrypt passphrase recipient. Any age v1 implementation can decrypt it.

- **Key derivation:** scrypt with r = 8 and p = 1. The age library chooses the work factor N so that key derivation takes about one second on the Mac that creates the backup. When decrypting, it refuses work factors more than 4 steps (16 times) above its own one-second target on the restoring Mac.
- **Encryption:** ChaCha20-Poly1305 in 64 KiB chunks (age's STREAM construction). The header is authenticated with HMAC-SHA-256. Modified, reordered or truncated files fail to decrypt.

The decrypted payload has this layout:

| Offset | Length | Content |
|---|---|---|
| 0 | 24 bytes | Magic: `THROUGH-THE-DAYS`, NUL, `BACKUP`, NUL (hex `54 48 52 4F 55 47 48 2D 54 48 45 2D 44 41 59 53 00 42 41 43 4B 55 50 00`) |
| 24 | 1 byte | Format version: `0x01` |
| 25 | rest | SQLite database image, starting with `SQLite format 3` and a NUL byte |

The image is a consistent copy of the live database:

1. SQLite's online backup API copies the live connection into memory as one read transaction, coordinating with the write-ahead log.
2. `VACUUM` rebuilds the in-memory copy without free pages.
3. The copy is serialised, and bytes 18 and 19 of its header (the file-format versions) are set to 1. The live journal uses WAL mode (value 2); SQLite [documents this change](https://www.sqlite.org/c3ref/deserialize.html) so that an image can be deserialised. Restoring into the live journal sets WAL mode again.

The schema version is SQLite's `user_version`, a big-endian integer at offset 60 of the image header. This build writes version 2 and can read versions 1 and 2.

The plaintext exists only in memory. Snapshots, verification and restore never write decrypted data to disk.

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
| `createdAt` | Creation time in Unix seconds. Listing and pruning order backups by it, then by name. |
| `sha256` | SHA-256 digest of the encrypted file as published. |

The registry holds no journal content: only file names, times and digests. It is replaced atomically (temporary file, flush, rename, folder flush).

A registry with another version, unknown fields or invalid JSON is refused, and nothing is deleted. New backups to that folder fail, and listing reports an error. To recover, choose a different folder. Backups in the old folder remain restorable with the file picker, but they are no longer listed or pruned.

**Listing.** The validated backups of a folder are the registered entries whose name passes the name check and whose file still exists as a regular file. They are listed newest first with their name, creation time and size. A folder without a registry, including one that is currently unavailable, has no validated backups.

## Publishing a backup

Explicit backups, daily backups, pre-migration backups and the safety backup before a restore all follow the same steps:

1. Check the passphrase rule and that the folder exists.
2. Remove regular files named `.ttd-incomplete-*` left by an interrupted earlier attempt. Directories, symbolic links and all other files are never touched.
3. Take the snapshot described above.
4. Encrypt it into a new temporary file in the folder and flush the file to permanent storage.
5. Verify it: decrypt the temporary file, compare it byte for byte with the plaintext, then load and validate it exactly as a restore would, including the upgrade of an older schema.
6. Compute the SHA-256 digest of the encrypted file.
7. Publish it by renaming it to its final name in the same folder. The rename never replaces an existing file. Then flush the folder.
8. Register it in the registry. If registration fails, the published file is removed and the backup is reported as failed.
9. Prune older backups (see [Retention](#retention)).

Success is reported, and the daily backup recorded, only after step 8. A failure in steps 1 to 8 leaves earlier backups untouched. A failure while pruning sets a retention warning but does not make the new backup fail.

## Validation

A backup is validated when it is created and again before it is restored:

- decryption with the passphrase, which authenticates every chunk;
- the magic and format version 1;
- an SQLite header and `PRAGMA integrity_check` returning `ok` (page structure, indexes, unique and check constraints);
- exactly the expected schema objects: the tables `journal_entries` and `preferences` and the index `active_slot`, plus SQLite's internal indexes. Triggers, views and other tables are refused;
- a supported schema version; an older one is upgraded first (see [Schema versions](#schema-versions));
- every entry passes the validation used when saving it (date, slot, score ranges, emotion identifiers, actions, small wins and document structure), its columns match its content, its revision is at least 1, and a completed entry still meets the completion rule;
- at most one active entry for each date and slot;
- stored display preferences that can be read.

The staged copy lives in memory with SQLite's defensive settings `trusted_schema=OFF` and `cell_size_check=ON`.

## Schema versions

A restore accepts every supported schema version, currently 1 and 2. A version-1 backup, such as a pre-migration backup, is upgraded inside the staged in-memory copy with the same migration steps used for the live journal. It is then validated as version 2. A backup with a newer or unknown version is refused, and the journal is unchanged.

The upgrade from version 1 to version 2:

- adds the trash column;
- limits the one-entry-per-slot index to entries that are not in the trash;
- records perceived progress as missing for existing entries.

## Restoring

Restoring replaces the entire journal (entries, trash and preferences) with the content of the backup. The backup plan and the Keychain item are not part of the journal, so they are unchanged.

1. The backup is decrypted and validated into a staged copy in memory. Any failure stops the restore here, and the live journal is unchanged.
2. The staged copy replaces the live database through SQLite's online backup API. The replacement is committed as a whole or rolled back.

**Safety backup (desktop app).** Before replacing a journal that contains entries, the desktop app publishes a regular backup of it when a folder is chosen and the passphrase is available in this session. If that safety backup fails, the restore is cancelled.

Restored trash entries keep their original deletion time. Those whose 30 days have passed are removed by the next trash purge, at launch or while the app is open.

The passphrase rule is not applied when restoring, so every backup stays restorable with the passphrase it was created with.

## Retention

After each successful publication, pruning keeps the 30 newest registered backups whose files still exist, and deletes older registered backups. A file is deleted only when its name passes the name check and its SHA-256 digest still matches the registry.

- **Count, not time.** Retention keeps 30 backups, whatever their dates, independently of the 30-day trash. Explicit, pre-migration and safety backups count like daily ones.
- **Never deleted:** files that are not in the registry, files whose content changed after registration, files that are not regular files, names outside the pattern, and anything outside the folder.
- **Changed or unsafe entries** are removed from the registry, their files are left in place, and a retention warning is reported.
- **Missing files** are removed from the registry silently: the person deleted them.
- **Failures** to inspect, delete or rewrite the registry keep the affected entries and report a retention warning.

Deleted entries, including permanently deleted ones, can remain in older backups until those backups are pruned, about 30 backups later, or until the person deletes the backup files. Deleting an entry is not forensic erasure.

## Destination

Backups go to a folder the person chooses in the desktop app with the native macOS folder dialog. There is no implicit default folder, and the web interface never supplies paths. The chosen folder is stored in the device-local backup plan (`backup-plan.json` in the application data folder), outside the journal database.

The app never uploads backups. If the person chooses a folder synced by iCloud Drive, Dropbox or a similar service, that service copies the encrypted files; that is the person's choice. Temporary files hold ciphertext only.

Choosing another folder leaves earlier backups where they are. Listing and pruning apply only to the current folder.

## Passphrase

- **Rule:** at least 12 characters, counted as Unicode scalar values, so `é` counts as one. There are no composition rules. `journal-core` uses the passphrase exactly as given, without trimming or Unicode normalisation.
- **Portable:** the backup file and its passphrase are enough to restore on another Mac. No device key is involved.
- **Keychain (desktop app):** remembering the passphrase in macOS Keychain is optional. The item uses service `com.throughthedays.app.backup` (`com.throughthedays.app.dev.backup` in development builds) and account `backup-passphrase`. A passphrase that is not remembered is kept in memory for the current session only.
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
| Backup interrupted by a crash or power loss | Only a `.ttd-incomplete-*` file can remain. It is never listed and is removed by the next backup; earlier backups are intact. |
| Folder missing, read-only or full | The backup fails and no success is recorded; earlier backups are intact. |
| Verification fails | The backup fails as a validation failure and its temporary file is removed. |
| Registration fails | The published file is removed and the backup fails. |
| Registry unreadable or unrecognised | The backup fails, listing reports an error and nothing is deleted. |
| Pruning cannot complete safely | Retention warning; the new backup is still valid. |

Errors contain fixed English messages and stable codes. They never contain journal text, paths or passphrases.

## What is not encrypted

- **The live journal**, `journal.sqlite` in the application data folder (`~/Library/Application Support/com.throughthedays.app`), is not encrypted by the application. It relies on macOS account and disk protections, including FileVault if the person has turned it on ([D-004](product-decisions.md)).
- **The backup plan** holds the folder path, the last success and two settings, without journal text.
- **The registry** holds file names, times and digests, without journal text.
- **File names** reveal when each backup was made. The age header reveals the scrypt salt and work factor, as in every age file.

## Recovery without the app

The format uses standard tools only, so a backup remains readable without Through the Days. With the [age](https://github.com/FiloSottile/age) command-line tool, `age --decrypt -o journal-backup.bin <backup>` asks for the passphrase. Then `tail -c +26 journal-backup.bin > journal.sqlite` removes the 25-byte prefix and leaves an SQLite database. These steps write the decrypted journal to disk, so work in a private location and delete the files afterwards. The app's restore remains the supported path: it validates the backup and upgrades older schema versions.

## Verification

The `journal-core` integration tests exercise this contract with real temporary SQLite databases and synthetic entries:

| Behaviour | Test (`crates/journal-core/tests/`) |
|---|---|
| Encrypted format and prefix, owner-only permissions, no plaintext beside the backup, clean restore including trash, wrong passphrase, truncation | `recovery.rs`: `encrypted_snapshot_restores_on_a_clean_store_and_rejects_bad_credentials` |
| Populated journal unchanged by wrong passphrase, truncated, corrupted, empty, foreign and missing files | `recovery.rs`: `failed_restores_leave_a_populated_live_journal_untouched` |
| Format version, schema version, integrity, schema objects, entry and preference validation before restore | `recovery.rs`: `restore_validates_format_schema_and_content_before_replacing_the_journal` |
| Restoring a version-1 pre-migration backup into a current journal | `recovery.rs`: `pre_migration_backup_of_an_older_schema_restores_into_a_current_journal` |
| Interrupted and failed backups keep the previous backup; only validated backups are listed | `recovery.rs`: `failed_backup_keeps_the_previous_valid_backup_and_lists_only_validated_ones`, `backup_that_cannot_be_registered_is_not_reported_or_left_behind` |
| Stale temporary files removed, nothing else touched | `recovery.rs`: `publication_removes_stale_incomplete_files_and_nothing_else` |
| Exactly 30 validated backups kept; changed, unsafe and unregistered files never deleted | `recovery.rs`: `retention_keeps_exactly_the_thirty_newest_validated_backups`, `pruning_never_deletes_changed_unsafe_or_unregistered_files` |
| Content deleted before a backup is not in it | `recovery.rs`: `backups_exclude_content_deleted_before_they_were_made` |
| Daily schedule, catch-up and pending states; no success recorded on failure | `recovery.rs`: `daily_backups_catch_up_current_state_without_inventing_closed_days`, `failed_daily_backup_records_no_success` |
| Registry listing rules and damaged registries | `recovery.rs`: `listing_reports_only_registered_backups_that_still_exist` |
| Pre-migration backup required; failed migration leaves the journal intact | `migration.rs`, `schema.rs` |
| Backup plan atomic storage and corrupt-file reporting | `plan.rs` |

Scrypt calibration makes each published backup take about two seconds in tests: one second to encrypt and one to verify. Retention tests therefore register synthetic stand-in files with known digests instead of publishing 30 real backups. Crafted backups in the validation tests use a low work factor so they decrypt quickly. Published backups always use the calibrated work factor.

The desktop behaviour described above (dialogs, Keychain, the safety backup and scheduling) and recovery with the `age` command-line tool are not exercised by these tests. Development builds run unoptimised scrypt and therefore calibrate a lower work factor. They can refuse a backup made by a release build as exceeding their work-factor limit.
