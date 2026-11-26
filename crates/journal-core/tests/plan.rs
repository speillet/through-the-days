#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, names_in};
use journal_core::{BackupPlan, Error};
use std::fs;

/// The backup plan is device-local state kept outside the journal and replaced atomically.
#[test]
fn backup_plan_round_trips_and_a_missing_file_is_the_default() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("backup-plan.json");
    assert_eq!(BackupPlan::load(&path), Ok(BackupPlan::default()));

    let plan = BackupPlan {
        folder: Some(directory.path().join("Synthetic backups")),
        last_success_date: Some("2026-11-22".into()),
        last_success_at: Some(NOW),
        remember: true,
        retention_warning: true,
    };
    plan.store(&path).unwrap();
    assert_eq!(BackupPlan::load(&path), Ok(plan.clone()));
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(&path).unwrap().permissions().mode() & 0o777
    };
    assert_eq!(mode, 0o600, "the plan is readable by its owner only");

    let updated = BackupPlan {
        retention_warning: false,
        last_success_date: Some("2026-11-23".into()),
        ..plan
    };
    updated.store(&path).unwrap();
    assert_eq!(BackupPlan::load(&path), Ok(updated));
    assert_eq!(
        names_in(directory.path()),
        vec!["backup-plan.json"],
        "no temporary file remains"
    );
}

/// A damaged plan is reported instead of silently forgetting the folder and last success. Like
/// every failure to read or write the plan, it is a storage failure of this Mac, never a backup
/// failure: no backup is involved.
#[test]
fn corrupt_or_unknown_backup_plans_are_reported_instead_of_reset() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("backup-plan.json");
    for damaged in [
        r#"{ "folder": "#,
        "",
        r#"{"remember":true,"unexpectedField":1}"#,
        "[]",
    ] {
        fs::write(&path, damaged).unwrap();
        assert_eq!(BackupPlan::load(&path), Err(Error::Storage), "{damaged:?}");
        assert_eq!(fs::read_to_string(&path).unwrap(), damaged);
    }
    fs::write(&path, r#"{"remember":true}"#).unwrap();
    let partial = BackupPlan::load(&path).unwrap();
    assert_eq!(
        partial,
        BackupPlan {
            remember: true,
            ..BackupPlan::default()
        }
    );

    let not_a_file = directory.path().join("plan-directory");
    fs::create_dir(&not_a_file).unwrap();
    assert_eq!(BackupPlan::load(&not_a_file), Err(Error::Storage));
    assert_eq!(
        BackupPlan::default().store(&not_a_file),
        Err(Error::Storage)
    );
}
