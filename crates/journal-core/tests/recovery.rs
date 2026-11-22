use journal_core::{Entry, Journal, Slot};

#[test]
fn encrypted_snapshot_restores_on_a_clean_store_and_rejects_bad_credentials() {
    let directory = tempfile::tempdir().unwrap();
    let backup_folder = directory.path().join("snapshots");
    std::fs::create_dir(&backup_folder).unwrap();
    let journal = Journal::open(&directory.path().join("source.sqlite")).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.reflection.proud_of = "Synthetic journal content for recovery.".into();
    entry.progress = Some(7);
    entry.promote_pride();
    let saved = journal.save(entry).unwrap();
    let backup = journal.backup_to(&backup_folder, "synthetic portable backup passphrase", 1_795_363_200).unwrap();
    let bytes = std::fs::read(&backup.path).unwrap();
    assert!(bytes.starts_with(b"age-encryption.org/v1\n"));
    assert!(!bytes.windows(17).any(|w| w == b"Synthetic journal"));
    let mut clean = Journal::open(&directory.path().join("clean.sqlite")).unwrap();
    assert!(clean.restore_from(&backup.path, "incorrect synthetic passphrase").is_err());
    assert!(clean.list().unwrap().is_empty());
    let corrupt = directory.path().join("corrupt.age");
    std::fs::write(&corrupt, &bytes[..bytes.len()-9]).unwrap();
    assert!(clean.restore_from(&corrupt, "synthetic portable backup passphrase").is_err());
    clean.restore_from(&backup.path, "synthetic portable backup passphrase").unwrap();
    assert_eq!(clean.get(&saved.id).unwrap(), saved);
    let original = std::fs::read(&backup.path).unwrap();
    assert!(journal.backup_to(&backup.path, "synthetic portable backup passphrase", 1_795_363_201).is_err());
    assert_eq!(std::fs::read(&backup.path).unwrap(), original);
}

#[test]
fn daily_backups_catch_up_current_state_without_inventing_closed_days() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut plan = journal_core::BackupPlan::default();
    let day = "2026-11-22T10:00:00Z".parse().unwrap();
    let preferences = journal_core::Preferences::default();
    assert_eq!(journal.backup_if_due(&mut plan, None, day, &preferences).unwrap(), journal_core::DailyBackup::NeedsFolder);
    plan.folder = Some(directory.path().to_owned());
    assert_eq!(journal.backup_if_due(&mut plan, None, day, &preferences).unwrap(), journal_core::DailyBackup::NeedsPassphrase);
    assert!(plan.last_success_date.is_none());
    assert_eq!(journal.backup_if_due(&mut plan, Some("synthetic daily passphrase"), day, &preferences).unwrap(), journal_core::DailyBackup::Saved);
    assert_eq!(journal.backup_if_due(&mut plan, None, day, &preferences).unwrap(), journal_core::DailyBackup::NotDue);
    let launch = "2026-11-26T10:00:00Z".parse().unwrap();
    assert_eq!(journal.backup_if_due(&mut plan, Some("synthetic daily passphrase"), launch, &preferences).unwrap(), journal_core::DailyBackup::Saved);
    assert_eq!(plan.last_success_date.as_deref(), Some("2026-11-26"));
    let backups = std::fs::read_dir(directory.path()).unwrap().filter_map(Result::ok).filter(|e| e.path().extension().is_some_and(|e| e == "age")).count();
    assert_eq!(backups, 2);
}
