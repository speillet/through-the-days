#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{
    BACKUP_MAGIC, DAY, NOW, PASSPHRASE, REGISTRY_FILE, ReadOnlyFolder, SeededBackup,
    backup_plaintext, contains, decrypt, document, encrypt_quickly, execute, image_user_version,
    names_in, previous_journal, registered_names, seed_backup, sha256_hex, write_registry,
};
use journal_core::{
    BackupPlan, BackupRecord, DailyBackup, Entry, Error, Journal, Preferences, Slot, list_backups,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn file_name(path: &Path) -> String {
    path.file_name().unwrap().to_str().unwrap().to_owned()
}

fn listed_names(folder: &Path) -> Vec<String> {
    list_backups(folder)
        .unwrap()
        .into_iter()
        .map(|record| record.name)
        .collect()
}

fn backup_folder(directory: &Path) -> PathBuf {
    let folder = directory.join("backups");
    fs::create_dir(&folder).unwrap();
    folder
}

/// local-data-protection — Encrypted local backups before real use / Backup created;
/// Safe restore / Wrong credential or corrupt backup, Clean restore;
/// Portable backup recovery / New Mac restoration.
#[test]
fn encrypted_snapshot_restores_on_a_clean_store_and_rejects_bad_credentials() {
    let directory = tempfile::tempdir().unwrap();
    let backup_folder = directory.path().join("snapshots");
    fs::create_dir(&backup_folder).unwrap();
    let journal = Journal::open(&directory.path().join("source.sqlite")).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.reflection.proud_of = "Synthetic journal content for recovery.".into();
    entry.progress = Some(7);
    entry.promote_pride();
    let saved = journal.save(entry).unwrap();
    let trashed = journal
        .save(Entry::draft("2026-11-21", Slot::Morning))
        .unwrap();
    journal
        .trash(&trashed.id, trashed.revision, NOW - DAY)
        .unwrap();
    let backup = journal.backup_to(&backup_folder, PASSPHRASE, NOW).unwrap();
    let bytes = fs::read(&backup.path).unwrap();
    assert!(bytes.starts_with(b"age-encryption.org/v1\n"));
    assert!(!bytes.windows(17).any(|w| w == b"Synthetic journal"));
    assert_eq!(
        names_in(&backup_folder),
        vec![REGISTRY_FILE.to_owned(), file_name(&backup.path)]
    );
    for private in [&backup.path, &backup_folder.join(REGISTRY_FILE)] {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(private).unwrap().permissions().mode() & 0o777;
        assert_eq!(
            mode,
            0o600,
            "{} is readable by its owner only",
            private.display()
        );
    }
    assert!(!contains(
        &fs::read(backup_folder.join(REGISTRY_FILE)).unwrap(),
        b"Synthetic journal"
    ));
    let plaintext = decrypt(&backup.path, PASSPHRASE);
    assert!(plaintext.starts_with(&backup_plaintext(b"SQLite format 3\0")));
    assert_eq!(image_user_version(&plaintext[BACKUP_MAGIC.len() + 1..]), 2);
    // The image after the prefix is a standalone SQLite database file.
    let image = directory.path().join("decrypted-image.sqlite");
    fs::write(&image, &plaintext[BACKUP_MAGIC.len() + 1..]).unwrap();
    let rows: i64 = rusqlite::Connection::open(&image)
        .unwrap()
        .query_row("SELECT count(*) FROM journal_entries", [], |row| row.get(0))
        .unwrap();
    assert_eq!(rows, 2);
    let mut clean = Journal::open(&directory.path().join("clean.sqlite")).unwrap();
    assert!(
        clean
            .restore_from(&backup.path, "incorrect synthetic passphrase")
            .is_err()
    );
    assert!(clean.list().unwrap().is_empty());
    let corrupt = directory.path().join("corrupt.age");
    fs::write(&corrupt, &bytes[..bytes.len() - 9]).unwrap();
    assert!(clean.restore_from(&corrupt, PASSPHRASE).is_err());
    clean.restore_from(&backup.path, PASSPHRASE).unwrap();
    assert_eq!(clean.get(&saved.id).unwrap(), saved);
    let trash = clean.trash_items().unwrap();
    assert_eq!(
        (trash.len(), &trash[0].entry, trash[0].deleted_at),
        (1, &trashed, NOW - DAY)
    );
    let original = fs::read(&backup.path).unwrap();
    assert!(
        journal
            .backup_to(&backup.path, PASSPHRASE, NOW + 1)
            .is_err()
    );
    assert_eq!(fs::read(&backup.path).unwrap(), original);
}

/// local-data-protection — Daily backups with launch catch-up / App active on a new day,
/// App was closed, Backup credential unavailable.
#[test]
fn daily_backups_catch_up_current_state_without_inventing_closed_days() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut plan = BackupPlan::default();
    let day = "2026-11-22T10:00:00Z".parse().unwrap();
    let preferences = Preferences::default();
    assert_eq!(
        journal
            .backup_if_due(&mut plan, None, day, &preferences)
            .unwrap(),
        DailyBackup::NeedsFolder
    );
    plan.folder = Some(directory.path().to_owned());
    assert_eq!(
        journal
            .backup_if_due(&mut plan, None, day, &preferences)
            .unwrap(),
        DailyBackup::NeedsPassphrase
    );
    assert!(plan.last_success_date.is_none());
    assert_eq!(
        journal
            .backup_if_due(
                &mut plan,
                Some("synthetic daily passphrase"),
                day,
                &preferences
            )
            .unwrap(),
        DailyBackup::Saved
    );
    assert_eq!(
        journal
            .backup_if_due(&mut plan, None, day, &preferences)
            .unwrap(),
        DailyBackup::NotDue
    );
    let launch = "2026-11-26T10:00:00Z".parse().unwrap();
    assert_eq!(
        journal
            .backup_if_due(
                &mut plan,
                Some("synthetic daily passphrase"),
                launch,
                &preferences
            )
            .unwrap(),
        DailyBackup::Saved
    );
    assert_eq!(plan.last_success_date.as_deref(), Some("2026-11-26"));
    let backups = fs::read_dir(directory.path())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|e| e == "age"))
        .count();
    assert_eq!(backups, 2);
    assert_eq!(list_backups(directory.path()).unwrap().len(), 2);
}

/// local-data-protection — Daily backups with launch catch-up (success only after completion).
#[test]
fn failed_daily_backup_records_no_success() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let unavailable = BackupPlan {
        folder: Some(directory.path().join("unplugged-drive")),
        ..BackupPlan::default()
    };
    let mut plan = unavailable.clone();
    let day = "2026-11-22T10:00:00Z".parse().unwrap();
    let preferences = Preferences::default();
    assert_eq!(
        journal.backup_if_due(&mut plan, Some(PASSPHRASE), day, &preferences),
        Err(Error::Backup)
    );
    assert_eq!(
        journal.backup_if_due(&mut plan, Some("too short"), day, &preferences),
        Err(Error::Passphrase)
    );
    assert_eq!(plan, unavailable);
}

/// local-data-protection — Safe restore / Clean restore of a backup made at an older supported
/// schema version (the pre-migration backup).
#[test]
fn pre_migration_backup_of_an_older_schema_restores_into_a_current_journal() {
    let directory = tempfile::tempdir().unwrap();
    let previous = directory.path().join("previous.sqlite");
    let folder = backup_folder(directory.path());
    let id = previous_journal(&previous);
    let migrated = Journal::migrate_with_backup(&previous, &folder, PASSPHRASE, NOW).unwrap();
    let records = list_backups(&folder).unwrap();
    assert_eq!(records.len(), 1);
    let backup = folder.join(&records[0].name);
    let plaintext = decrypt(&backup, PASSPHRASE);
    assert_eq!(
        image_user_version(&plaintext[BACKUP_MAGIC.len() + 1..]),
        1,
        "a version-1 image"
    );

    let fresh_path = directory.path().join("fresh.sqlite");
    let mut fresh = Journal::open(&fresh_path).unwrap();
    fresh.restore_from(&backup, PASSPHRASE).unwrap();
    let restored = fresh.get(&id).unwrap();
    assert_eq!(restored, migrated.get(&id).unwrap());
    assert_eq!(
        (
            restored.date.as_str(),
            restored.slot,
            restored.mood,
            restored.progress
        ),
        ("2026-11-22", Slot::Morning, Some(3), None)
    );
    assert_eq!(
        restored.reflection.difficulty,
        "Synthetic difficulty from the previous version."
    );
    drop(fresh);
    assert_eq!(journal_core::schema_version(&fresh_path), Ok(Some(2)));
    assert_eq!(
        Journal::open(&fresh_path).unwrap().list().unwrap(),
        vec![restored]
    );
}

/// local-data-protection — Interrupted backup write (leftovers of an interrupted attempt are
/// removed before writing; nothing else is touched).
#[test]
fn publication_removes_stale_incomplete_files_and_nothing_else() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    let outside = directory.path().join("outside.txt");
    fs::write(&outside, "Synthetic file outside the backup folder").unwrap();
    fs::write(
        folder.join(".ttd-incomplete-crashed"),
        "age-encryption.org/v1\n-> scrypt partial",
    )
    .unwrap();
    fs::create_dir(folder.join(".ttd-incomplete-directory")).unwrap();
    std::os::unix::fs::symlink(&outside, folder.join(".ttd-incomplete-link")).unwrap();
    for unrelated in ["notes.txt", ".hidden-other", "ttd-1-unregistered.ttd.age"] {
        fs::write(folder.join(unrelated), "Synthetic unrelated file").unwrap();
    }
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let info = journal.backup_to(&folder, PASSPHRASE, NOW).unwrap();
    let name = file_name(&info.path);
    let mut expected = vec![
        ".hidden-other",
        REGISTRY_FILE,
        ".ttd-incomplete-directory",
        ".ttd-incomplete-link",
        "notes.txt",
        "ttd-1-unregistered.ttd.age",
        name.as_str(),
    ];
    expected.sort_unstable();
    assert_eq!(names_in(&folder), expected);
    assert_eq!(
        fs::read_to_string(&outside).unwrap(),
        "Synthetic file outside the backup folder"
    );
    assert_eq!(listed_names(&folder), vec![name]);
}

/// local-data-protection — Encrypted local backups before real use / Interrupted backup write.
#[test]
fn failed_backup_keeps_the_previous_valid_backup_and_lists_only_validated_ones() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.document = document("Synthetic entry protected by the first backup.");
    let entry = journal.save(entry).unwrap();
    let first = journal.backup_to(&folder, PASSPHRASE, NOW).unwrap();
    let first_bytes = fs::read(&first.path).unwrap();
    let first_name = file_name(&first.path);

    // A crash during a later attempt leaves only an incomplete temporary file behind.
    let interrupted = folder.join(".ttd-incomplete-interrupted");
    fs::write(&interrupted, &first_bytes[..first_bytes.len() / 2]).unwrap();
    assert_eq!(listed_names(&folder), vec![first_name.clone()]);
    {
        let _read_only = ReadOnlyFolder::new(&folder);
        assert_eq!(
            journal.backup_to(&folder, PASSPHRASE, NOW + DAY).err(),
            Some(Error::Backup)
        );
    }
    assert_eq!(listed_names(&folder), vec![first_name.clone()]);
    assert_eq!(fs::read(&first.path).unwrap(), first_bytes);
    let mut clean = Journal::open(&directory.path().join("clean.sqlite")).unwrap();
    clean.restore_from(&first.path, PASSPHRASE).unwrap();
    assert_eq!(clean.get(&entry.id).unwrap(), entry);

    let second = journal.backup_to(&folder, PASSPHRASE, NOW + DAY).unwrap();
    assert_eq!(
        listed_names(&folder),
        vec![file_name(&second.path), first_name]
    );
    assert!(!interrupted.exists());
}

/// local-data-protection — Interrupted backup write (a backup that cannot be registered is not
/// reported and leaves nothing that looks like one).
#[test]
fn backup_that_cannot_be_registered_is_not_reported_or_left_behind() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    fs::create_dir(folder.join(REGISTRY_FILE)).unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    assert_eq!(
        journal.backup_to(&folder, PASSPHRASE, NOW).err(),
        Some(Error::Backup)
    );
    assert_eq!(names_in(&folder), vec![REGISTRY_FILE.to_owned()]);
    assert_eq!(list_backups(&folder), Err(Error::Backup));
}

/// D-009 — keep the 30 latest validated backups; prune only after a validated replacement.
#[test]
fn retention_keeps_exactly_the_thirty_newest_validated_backups() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    let seeded: Vec<_> = (0..30)
        .map(|day| seed_backup(&folder, NOW - (30 - day) * DAY, &format!("day {day}")))
        .collect();
    write_registry(&folder, &seeded);
    let unregistered = folder.join(format!("ttd-{}-unregistered.ttd.age", NOW - 90 * DAY));
    fs::write(&unregistered, "Synthetic unregistered file").unwrap();
    fs::write(folder.join("notes.txt"), "Synthetic notes").unwrap();
    assert_eq!(list_backups(&folder).unwrap().len(), 30);

    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let info = journal.backup_to(&folder, PASSPHRASE, NOW).unwrap();
    assert!(!info.retention_warning);
    let listed = list_backups(&folder).unwrap();
    assert_eq!(listed.len(), 30);
    assert_eq!(
        listed[0],
        BackupRecord {
            name: file_name(&info.path),
            created_at: NOW,
            size_bytes: fs::metadata(&info.path).unwrap().len(),
        }
    );
    assert!(
        listed
            .windows(2)
            .all(|pair| pair[0].created_at > pair[1].created_at)
    );
    assert!(
        !folder.join(&seeded[0].name).exists(),
        "the oldest validated backup is pruned"
    );
    assert!(
        seeded[1..]
            .iter()
            .all(|kept| folder.join(&kept.name).exists())
    );
    assert!(unregistered.exists() && folder.join("notes.txt").exists());
    assert_eq!(registered_names(&folder).len(), 30);
}

/// D-009 — pruning deletes only registered files whose name and digest still match.
#[test]
fn pruning_never_deletes_changed_unsafe_or_unregistered_files() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    let outside = directory.path().join("outside.ttd.age");
    fs::write(&outside, "Synthetic file outside the folder").unwrap();
    let mut registry: Vec<_> = (0..30)
        .map(|day| seed_backup(&folder, NOW - (30 - day) * DAY, &format!("day {day}")))
        .collect();
    let oldest_valid = registry[0].name.clone();
    let changed = seed_backup(&folder, NOW - 40 * DAY, "validated, then changed");
    fs::write(
        folder.join(&changed.name),
        "Synthetic content replaced after validation",
    )
    .unwrap();
    let changed_name = changed.name.clone();
    registry.push(changed);
    registry.push(SeededBackup {
        name: format!("ttd-{}-missing.ttd.age", NOW - 50 * DAY),
        created_at: NOW - 50 * DAY,
        sha256: "0".repeat(64),
    });
    registry.push(SeededBackup {
        name: "../outside.ttd.age".into(),
        created_at: NOW - 60 * DAY,
        sha256: sha256_hex(b"Synthetic file outside the folder"),
    });
    write_registry(&folder, &registry);

    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let info = journal.backup_to(&folder, PASSPHRASE, NOW).unwrap();
    assert!(info.retention_warning);
    assert!(!folder.join(&oldest_valid).exists());
    assert_eq!(
        fs::read_to_string(folder.join(&changed_name)).unwrap(),
        "Synthetic content replaced after validation"
    );
    assert_eq!(
        fs::read_to_string(&outside).unwrap(),
        "Synthetic file outside the folder"
    );
    let registered = registered_names(&folder);
    assert_eq!(registered.len(), 30);
    assert!(
        registered
            .iter()
            .all(|name| name.starts_with("ttd-") && !name.contains("missing"))
    );
    assert!(!registered.contains(&changed_name));
    assert_eq!(listed_names(&folder), registered);
}

/// local-data-protection — Explicit permanent deletion (later backups do not carry deleted text).
#[test]
fn backups_exclude_content_deleted_before_they_were_made() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let folder = backup_folder(directory.path());
    let marker = "Synthetic marker 41c9: a deleted fictional sentence";
    let journal = Journal::open(&path).unwrap();
    let mut deleted = Entry::draft("2026-11-21", Slot::Evening);
    deleted.document = document(marker);
    let deleted = journal.save(deleted).unwrap();
    let mut kept = Entry::draft("2026-11-22", Slot::Morning);
    kept.document = document("Synthetic entry that stays.");
    let kept = journal.save(kept).unwrap();
    drop(journal);
    // A deletion that left freed pages unzeroed, as a database written by an earlier build can.
    execute(
        &path,
        &format!(
            "PRAGMA secure_delete=OFF; DELETE FROM journal_entries WHERE id='{}';",
            deleted.id
        ),
    );
    assert!(
        contains(&fs::read(&path).unwrap(), marker.as_bytes()),
        "freed pages still hold it"
    );

    let journal = Journal::open(&path).unwrap();
    let info = journal.backup_to(&folder, PASSPHRASE, NOW).unwrap();
    let restored_path = directory.path().join("restored.sqlite");
    let mut restored = Journal::open(&restored_path).unwrap();
    restored.restore_from(&info.path, PASSPHRASE).unwrap();
    assert_eq!(restored.list().unwrap(), vec![kept]);
    drop(restored);
    assert!(!contains(
        &fs::read(&restored_path).unwrap(),
        marker.as_bytes()
    ));
}

/// local-data-protection — Safe restore / Wrong credential or corrupt backup.
#[test]
fn failed_restores_leave_a_populated_live_journal_untouched() {
    let directory = tempfile::tempdir().unwrap();
    let folder = backup_folder(directory.path());
    let source = Journal::open(&directory.path().join("source.sqlite")).unwrap();
    let mut backed_up = Entry::draft("2026-11-20", Slot::Morning);
    backed_up.document = document("Synthetic backed-up entry.");
    source.save(backed_up).unwrap();
    let backup = source.backup_to(&folder, PASSPHRASE, NOW).unwrap().path;
    let bytes = fs::read(&backup).unwrap();

    let live_path = directory.path().join("live.sqlite");
    let mut live = Journal::open(&live_path).unwrap();
    let mut current = Entry::draft("2026-11-22", Slot::Evening);
    current.document = document("Synthetic current entry.");
    current.mood = Some(6);
    let current = live.save(current).unwrap();
    let preferences = Preferences {
        theme: "dark".into(),
        ..Preferences::default()
    };
    live.set_preferences(&preferences).unwrap();
    let before = (live.list().unwrap(), live.preferences().unwrap());

    let write = |name: &str, content: &[u8]| {
        let path = directory.path().join(name);
        fs::write(&path, content).unwrap();
        path
    };
    let truncated = write("truncated.age", &bytes[..bytes.len() - 9]);
    let mut flipped_bytes = bytes.clone();
    let middle = flipped_bytes.len() / 2;
    flipped_bytes[middle] ^= 0x55;
    let flipped = write("flipped.age", &flipped_bytes);
    let empty = write("empty.age", b"");
    let plain = write(
        "plain.age",
        b"Synthetic text that is not an encrypted backup.",
    );
    let missing = directory.path().join("missing.age");
    let attempts = [
        (&backup, "incorrect synthetic passphrase"),
        (&truncated, PASSPHRASE),
        (&flipped, PASSPHRASE),
        (&empty, PASSPHRASE),
        (&plain, PASSPHRASE),
        (&missing, PASSPHRASE),
    ];
    for (path, passphrase) in attempts {
        assert_eq!(
            live.restore_from(path, passphrase),
            Err(Error::Restore),
            "{}",
            path.display()
        );
        assert_eq!((live.list().unwrap(), live.preferences().unwrap()), before);
    }
    drop(live);
    assert_eq!(
        Journal::open(&live_path).unwrap().get(&current.id).unwrap(),
        current
    );
}

/// local-data-protection — Safe restore (format, schema version and content are validated before
/// the backup becomes active).
#[test]
fn restore_validates_format_schema_and_content_before_replacing_the_journal() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = directory.path().join("source.sqlite");
    let source = Journal::open(&source_path).unwrap();
    let mut entry = Entry::draft("2026-11-20", Slot::Morning);
    entry.document = document("Synthetic entry in a crafted backup.");
    let entry = source.save(entry).unwrap();
    drop(source);
    let image = fs::read(&source_path).unwrap();
    let variant = |name: &str, sql: &str| {
        let path = directory.path().join(name);
        fs::write(&path, &image).unwrap();
        execute(&path, sql);
        backup_plaintext(&fs::read(&path).unwrap())
    };
    let crafted = |name: &str, plaintext: &[u8]| {
        let path = directory.path().join(name);
        fs::write(&path, encrypt_quickly(plaintext, PASSPHRASE)).unwrap();
        path
    };

    let mut live = Journal::open(&directory.path().join("live.sqlite")).unwrap();
    let current = live
        .save(Entry::draft("2026-11-22", Slot::Evening))
        .unwrap();
    let rejected = [
        crafted("no-magic.age", &image),
        crafted("unknown-format.age", &[BACKUP_MAGIC, &[2], &image].concat()),
        crafted("not-sqlite.age", &backup_plaintext(&[b'x'; 4096])),
        crafted(
            "newer-schema.age",
            &variant("newer.sqlite", "PRAGMA user_version=3;"),
        ),
        crafted(
            "invalid-score.age",
            &variant(
                "score.sqlite",
                "UPDATE journal_entries SET payload=json_set(payload,'$.mood',11);",
            ),
        ),
        crafted(
            "unknown-emotion.age",
            &variant(
                "emotion.sqlite",
                "UPDATE journal_entries SET payload=json_set(payload,'$.emotion','synthetic');",
            ),
        ),
        crafted(
            "moved-columns.age",
            &variant(
                "moved.sqlite",
                "UPDATE journal_entries SET entry_date='2026-01-01';",
            ),
        ),
        crafted(
            "extra-trigger.age",
            &variant(
                "trigger.sqlite",
                "CREATE TRIGGER synthetic AFTER INSERT ON preferences BEGIN DELETE FROM journal_entries; END;",
            ),
        ),
        crafted(
            "invalid-preferences.age",
            &variant(
                "preferences.sqlite",
                "INSERT INTO preferences VALUES('display','{\"unknownField\":true}');",
            ),
        ),
    ];
    for path in &rejected {
        assert_eq!(
            live.restore_from(path, PASSPHRASE),
            Err(Error::Restore),
            "{}",
            path.display()
        );
        assert_eq!(live.list().unwrap(), vec![current.clone()]);
    }
    // The same crafting with an unmodified image restores, so each rejection comes from its defect.
    live.restore_from(&crafted("valid.age", &backup_plaintext(&image)), PASSPHRASE)
        .unwrap();
    assert_eq!(live.list().unwrap(), vec![entry]);
}

/// Validated backups are listed from the registry only, newest first.
#[test]
fn listing_reports_only_registered_backups_that_still_exist() {
    let directory = tempfile::tempdir().unwrap();
    assert_eq!(
        list_backups(&directory.path().join("unplugged-drive")),
        Ok(vec![])
    );
    let folder = backup_folder(directory.path());
    assert_eq!(list_backups(&folder), Ok(vec![]));

    let older = seed_backup(&folder, NOW - DAY, "older");
    let newer = seed_backup(&folder, NOW, "newer");
    let removed = seed_backup(&folder, NOW - 2 * DAY, "removed by the person");
    fs::remove_file(folder.join(&removed.name)).unwrap();
    let directory_entry = SeededBackup {
        name: format!("ttd-{}-directory.ttd.age", NOW - 3 * DAY),
        created_at: NOW - 3 * DAY,
        sha256: "0".repeat(64),
    };
    fs::create_dir(folder.join(&directory_entry.name)).unwrap();
    let unsafe_entry = SeededBackup {
        name: "../journal.sqlite".into(),
        created_at: NOW + DAY,
        sha256: "0".repeat(64),
    };
    fs::write(
        directory.path().join("journal.sqlite"),
        "Synthetic file outside the folder",
    )
    .unwrap();
    let newer_name = newer.name.clone();
    let older_name = older.name.clone();
    write_registry(
        &folder,
        &[older, removed, newer, directory_entry, unsafe_entry],
    );
    let listed = list_backups(&folder).unwrap();
    assert_eq!(
        listed
            .iter()
            .map(|record| record.name.as_str())
            .collect::<Vec<_>>(),
        vec![newer_name, older_name]
    );
    assert_eq!(listed[0].created_at, NOW);
    assert_eq!(
        listed[0].size_bytes,
        "Synthetic stand-in for an encrypted backup: newer".len() as u64
    );

    for damaged in [
        "{ not a registry",
        r#"{"version":2,"backups":[]}"#,
        "[1,[]]",
    ] {
        fs::write(folder.join(REGISTRY_FILE), damaged).unwrap();
        assert_eq!(list_backups(&folder), Err(Error::Backup), "{damaged}");
    }
}
