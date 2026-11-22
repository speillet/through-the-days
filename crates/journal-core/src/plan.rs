use crate::{
    Error, Journal, Preferences,
    fsutil::{parse_json_object, write_atomically},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Device-local backup settings and state.
///
/// Kept outside the journal database, so restoring a backup never rewrites the backup folder,
/// the Keychain preference or the record of the last successful backup on this Mac.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupPlan {
    /// Folder chosen by the person; there is no implicit default.
    pub folder: Option<PathBuf>,
    /// Journal date of the last successful backup, in the configured time zone.
    pub last_success_date: Option<String>,
    /// Unix seconds of the last successful backup.
    pub last_success_at: Option<i64>,
    /// The person chose to remember the backup passphrase in macOS Keychain.
    pub remember: bool,
    /// The last successful backup could not prune older backups safely.
    pub retention_warning: bool,
}

/// Outcome of a daily backup check.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DailyBackup {
    NeedsFolder,
    NeedsPassphrase,
    NotDue,
    Saved,
}

impl BackupPlan {
    /// Loads the plan stored at `path`; a missing file is the default plan.
    ///
    /// An unreadable or corrupt file is [`Error::Backup`] rather than a silent reset, which
    /// would forget the chosen folder and the last successful backup. A missing file is never
    /// an error, so a caller can report any error as stored backup settings it cannot read.
    pub fn load(path: &Path) -> Result<Self, Error> {
        match fs::read(path) {
            Ok(bytes) => parse_json_object(&bytes, Error::Backup),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(_) => Err(Error::Backup),
        }
    }

    /// Stores the plan at `path` atomically: a reader sees the previous or the new plan.
    pub fn store(&self, path: &Path) -> Result<(), Error> {
        let bytes = serde_json::to_vec_pretty(self).map_err(|_| Error::Backup)?;
        write_atomically(path, &bytes, |_| Error::Backup)
    }
}

impl Journal {
    /// Runs the daily backup when none succeeded on the current journal date.
    ///
    /// The same check catches up at launch after closed days; it backs up the current state and
    /// never invents snapshots for missed days. `plan` records success only after the backup was
    /// verified, published and registered; the caller stores it.
    pub fn backup_if_due(
        &self,
        plan: &mut BackupPlan,
        passphrase: Option<&str>,
        now: DateTime<Utc>,
        preferences: &Preferences,
    ) -> Result<DailyBackup, Error> {
        let date = preferences.journal_date(now)?;
        if plan.last_success_date.as_ref() == Some(&date) {
            return Ok(DailyBackup::NotDue);
        }
        let Some(folder) = &plan.folder else {
            return Ok(DailyBackup::NeedsFolder);
        };
        let Some(passphrase) = passphrase else {
            return Ok(DailyBackup::NeedsPassphrase);
        };
        let saved = self.backup_to(folder, passphrase, now.timestamp())?;
        plan.last_success_date = Some(date);
        plan.last_success_at = Some(saved.created_at);
        plan.retention_warning = saved.retention_warning;
        Ok(DailyBackup::Saved)
    }
}
