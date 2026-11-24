//! Restoring a backup chosen by its registered name or in the native open dialog.
//!
//! The renderer never sends a path: a registered name is checked and resolved inside the chosen
//! folder, and a picked file stays in native state.

use super::{Core, StartupState};
use crate::{
    diagnostics,
    error::CommandError,
    paths::{self, STAGING_PREFIX},
};
use chrono::{DateTime, Utc};
use journal_core::{Error, Journal, erase_journal_files, list_backups, verify_backup};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

/// Larger than any backup journal-core can restore (its journal image is limited to 1 GiB).
const MAXIMUM_BACKUP_BYTES: u64 = 2 << 30;

/// Which backup to restore, as `RestoreSource` in `api/types.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RestoreSource {
    /// A validated backup listed in the chosen folder's registry.
    Registered { name: String },
    /// The file chosen with `choose_restore_file`.
    Picked,
}

/// The backup file chosen in the native dialog, as `PickedBackup` in `api/types.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedBackup {
    /// Display-only file name.
    pub name: String,
}

/// The result of a restore, as `RestoreOutcome` in `api/types.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    /// Active entries in the restored journal.
    pub entries: usize,
    /// A validated backup of the replaced journal was published first.
    pub safety_backup: bool,
    /// Display-only file name of a journal that could not be opened and was kept aside in the
    /// data folder; `None` when the journal was replaced in place.
    pub set_aside: Option<String>,
}

/// Whether `name` can be the file name of a published backup: `ttd-…ttd.age`, at most 128
/// bytes of ASCII letters, digits, `-` and `.`, and never `..`, so it has no path components.
/// These are the rules journal-core applies to its registry.
pub fn is_backup_name(name: &str) -> bool {
    name.len() <= 128
        && name.starts_with("ttd-")
        && name.ends_with(".ttd.age")
        && !name.contains("..")
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.')
}

impl Core {
    /// Keeps the file chosen in the open dialog, or forgets the choice when it was cancelled.
    pub fn pick_restore_file(&mut self, path: Option<PathBuf>) -> Option<PickedBackup> {
        self.picked = path;
        self.picked.as_deref().map(|path| PickedBackup {
            name: path.file_name().map_or_else(
                || path.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            ),
        })
    }

    /// Replaces the journal with a validated backup.
    ///
    /// The chosen backup is verified first, so a wrong passphrase or a damaged file changes
    /// nothing. When the current journal holds any entry, including trash, and a folder and the
    /// session passphrase are available, a safety backup of it is published before it is
    /// replaced. If the journal cannot be read for that, or the safety backup fails, the restore
    /// stops with `safetyBackupFailed`, unless `without_safety_backup` confirms that it may go
    /// ahead without one. When the start failed or found a journal this version cannot open,
    /// the backup replaces the journal file instead (see [`Self::restore_at_startup`]). A failed
    /// restore leaves the journal unchanged.
    pub fn restore_backup(
        &mut self,
        source: RestoreSource,
        passphrase: &str,
        without_safety_backup: bool,
        now: DateTime<Utc>,
    ) -> Result<RestoreOutcome, CommandError> {
        match self.startup.state {
            StartupState::Ready => {}
            StartupState::Failed | StartupState::Unsupported => {
                return self.restore_at_startup(&source, passphrase, now);
            }
            StartupState::NeedsMigration => return Err(CommandError::not_ready()),
        }
        let source = self.restore_source(&source)?;
        // The safety backup can prune the oldest registered backup, which may be the one being
        // restored, so the restore reads a private copy (ciphertext only) taken beforehand.
        let staged = StagedCopy::of(&source, &self.paths.data_dir).map_err(|_| Error::Restore)?;
        verify_backup(staged.path(), passphrase)?;
        let safety_backup = self.safety_backup(without_safety_backup, now)?;
        let journal = self.journal.as_mut().ok_or_else(CommandError::not_ready)?;
        journal.restore_from(staged.path(), passphrase)?;
        drop(staged);
        if let Err(error) = journal.purge_expired(now.timestamp()) {
            diagnostics::record("purge expired trash", error.code());
        }
        let entries = journal.list()?.len();
        self.picked = None;
        Ok(RestoreOutcome {
            entries,
            safety_backup,
            set_aside: None,
        })
    }

    /// Restores when no journal is open because the start failed or found a journal this
    /// version cannot open.
    ///
    /// The journal file is left as it is until the verified backup has been restored completely
    /// into a new file in the data folder. Only then are the journal file and its SQLite
    /// companions moved aside, never deleted, and the restored file renamed into their place
    /// (see [`paths::replace_journal`]). Whenever the app stops, the next launch opens either
    /// the journal as it was or the complete restored journal, never an empty one. A failed
    /// restore leaves the journal's files where they were.
    fn restore_at_startup(
        &mut self,
        source: &RestoreSource,
        passphrase: &str,
        now: DateTime<Utc>,
    ) -> Result<RestoreOutcome, CommandError> {
        paths::create_private_dir(&self.paths.data_dir).map_err(|_| Error::Storage)?;
        let source = self.restore_source(source)?;
        let staged = StagedCopy::of(&source, &self.paths.data_dir).map_err(|_| Error::Restore)?;
        verify_backup(staged.path(), passphrase)?;
        paths::interruption_point();
        let restored = staged.journal_path();
        if let Err(error) = restore_into_new_file(&restored, staged.path(), passphrase) {
            diagnostics::record("restore at startup", error.code());
            let _ = erase_journal_files(&restored);
            return Err(error.into());
        }
        drop(staged);
        let set_aside =
            paths::replace_journal(&self.paths, &restored, now.timestamp()).map_err(|_| {
                diagnostics::record("replace journal file", Error::Storage.code());
                Error::Storage
            })?;
        let journal = Journal::open(&self.paths.journal).inspect_err(|error| {
            diagnostics::record("open restored journal", error.code());
        })?;
        paths::interruption_point();
        let entries = journal.list()?.len();
        self.journal = Some(journal);
        self.startup = self.status(StartupState::Ready, None, None);
        self.purge_after_opening(now);
        self.picked = None;
        Ok(RestoreOutcome {
            entries,
            safety_backup: false,
            set_aside,
        })
    }

    fn restore_source(&self, source: &RestoreSource) -> Result<PathBuf, CommandError> {
        match source {
            RestoreSource::Registered { name } => {
                let folder = self
                    .plan
                    .folder
                    .as_deref()
                    .ok_or_else(CommandError::needs_folder)?;
                let registered = is_backup_name(name)
                    && list_backups(folder)
                        .map_err(|_| Error::Restore)?
                        .iter()
                        .any(|backup| backup.name == *name);
                if !registered {
                    return Err(Error::Restore.into());
                }
                Ok(folder.join(name))
            }
            RestoreSource::Picked => self.picked.clone().ok_or_else(|| Error::Restore.into()),
        }
    }

    /// Publishes a safety backup of a journal that holds any entry, including trash, whenever a
    /// folder and the session passphrase make that possible. Returns whether one was published.
    ///
    /// A journal that cannot be read, or a safety backup that fails, stops the restore unless
    /// `without_safety_backup` confirms going ahead without one. The cause of a failed backup
    /// stays visible in the backup status.
    fn safety_backup(
        &mut self,
        without_safety_backup: bool,
        now: DateTime<Utc>,
    ) -> Result<bool, CommandError> {
        if self.plan.folder.is_none() || self.passphrase.is_none() {
            return Ok(false);
        }
        let published = match self.holds_entries() {
            Ok(false) => return Ok(false),
            Ok(true) => self.publish_safety_backup(now),
            Err(error) => {
                diagnostics::record("read journal before restore", error.code);
                Err(error)
            }
        };
        match published {
            Ok(()) => Ok(true),
            Err(_) if without_safety_backup => Ok(false),
            Err(_) => Err(CommandError::safety_backup_failed()),
        }
    }

    fn holds_entries(&self) -> Result<bool, CommandError> {
        let journal = self.journal()?;
        Ok(!journal.list()?.is_empty() || !journal.trash_items()?.is_empty())
    }

    fn publish_safety_backup(&mut self, now: DateTime<Utc>) -> Result<(), CommandError> {
        let journal = self.journal()?;
        let folder = self
            .plan
            .folder
            .as_deref()
            .ok_or_else(CommandError::needs_folder)?;
        let passphrase = self
            .passphrase
            .as_deref()
            .ok_or_else(CommandError::needs_passphrase)?;
        if let Err(error) = journal.backup_to(folder, passphrase, now.timestamp()) {
            diagnostics::record("safety backup", error.code());
            let error = CommandError::from(error);
            self.last_error = Some(error.clone());
            return Err(error);
        }
        Ok(())
    }
}

/// A private copy of a backup file in the data folder, removed when dropped. It holds the
/// encrypted file only, and its name lets launch and erasure clean up after a crash. Its prefix
/// is not the temporary-file prefix, which a backup published into the same folder removes.
struct StagedCopy(PathBuf);

impl StagedCopy {
    fn of(source: &Path, folder: &Path) -> io::Result<Self> {
        static COPIES: AtomicU64 = AtomicU64::new(0);
        let mut input = File::open(source)?;
        if input.metadata()?.len() > MAXIMUM_BACKUP_BYTES {
            return Err(io::ErrorKind::InvalidData.into());
        }
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos());
        let name = format!(
            "{STAGING_PREFIX}{}-{nanos}-{}",
            std::process::id(),
            COPIES.fetch_add(1, Ordering::Relaxed)
        );
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut output = options.open(folder.join(&name))?;
        let staged = Self(folder.join(name));
        io::copy(&mut input, &mut output)?;
        Ok(staged)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    /// Where a restore from the startup screen builds the journal restored from this copy:
    /// beside it, under its name with `.sqlite`, so launch also removes it after a crash.
    fn journal_path(&self) -> PathBuf {
        let mut path = self.0.clone().into_os_string();
        path.push(".sqlite");
        path.into()
    }
}

impl Drop for StagedCopy {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

/// Restores the backup at `backup` into a new journal at `path`, then closes it, which folds its
/// write-ahead log into the file: the file alone then holds the complete restored journal.
fn restore_into_new_file(path: &Path, backup: &Path, passphrase: &str) -> Result<(), Error> {
    let mut journal = Journal::open(path)?;
    paths::interruption_point();
    journal.restore_from(backup, passphrase)?;
    paths::interruption_point();
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::{RestoreOutcome, RestoreSource, is_backup_name};

    #[test]
    fn registered_names_cannot_leave_the_backup_folder() {
        assert!(is_backup_name(
            "ttd-1795363200-0d4f6c1e-3b8a-4f57-9a43-2f8c5e7b1d90.ttd.age"
        ));
        for name in [
            "",
            "ttd-.ttd.age/../journal.sqlite",
            "../ttd-1.ttd.age",
            "ttd-1/../../x.ttd.age",
            "ttd-1\\x.ttd.age",
            "ttd-1..ttd.age",
            "/Users/synthetic/ttd-1.ttd.age",
            "backup-1.ttd.age",
            "ttd-1.age",
            "ttd-1.ttd.age\0",
            "ttd-1 2.ttd.age",
            "ttd-é.ttd.age",
        ] {
            assert!(!is_backup_name(name), "{name:?} should be refused");
        }
        let long = format!("ttd-{}.ttd.age", "1".repeat(117));
        assert_eq!(long.len(), 129);
        assert!(!is_backup_name(&long));
    }

    #[test]
    fn restore_sources_use_the_renderer_shape() {
        let registered: RestoreSource = serde_json::from_value(
            serde_json::json!({"kind": "registered", "name": "ttd-1.ttd.age"}),
        )
        .unwrap();
        assert_eq!(
            registered,
            RestoreSource::Registered {
                name: "ttd-1.ttd.age".into()
            }
        );
        let picked: Option<RestoreSource> =
            serde_json::from_value(serde_json::json!({"kind": "picked"})).ok();
        assert_eq!(picked, Some(RestoreSource::Picked));
        let path: Option<RestoreSource> =
            serde_json::from_value(serde_json::json!({"kind": "path", "path": "/etc"})).ok();
        assert_eq!(path, None);
    }

    #[test]
    fn outcomes_use_the_renderer_shape() {
        let outcome = RestoreOutcome {
            entries: 2,
            safety_backup: false,
            set_aside: Some("journal.unreadable-1795363200.sqlite".into()),
        };
        assert_eq!(
            serde_json::to_value(outcome).unwrap(),
            serde_json::json!({
                "entries": 2, "safetyBackup": false,
                "setAside": "journal.unreadable-1795363200.sqlite"
            })
        );
        let in_place = RestoreOutcome {
            entries: 0,
            safety_backup: true,
            set_aside: None,
        };
        assert_eq!(
            serde_json::to_value(in_place).unwrap()["setAside"],
            serde_json::Value::Null
        );
    }
}
