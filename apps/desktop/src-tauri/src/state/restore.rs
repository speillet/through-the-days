//! Restoring a backup chosen by its registered name or in the native open dialog.
//!
//! The renderer never sends a path: a registered name is checked and resolved inside the chosen
//! folder, and a picked file stays in native state.

use super::Core;
use crate::{diagnostics, error::CommandError, paths::TEMPORARY_PREFIX};
use chrono::{DateTime, Utc};
use journal_core::{Error, list_backups, verify_backup};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use zeroize::Zeroizing;

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
    /// When the current journal holds any entry, including trash, and a folder and the session
    /// passphrase are available, a safety backup of it is published first; if that fails the
    /// restore is cancelled. The chosen backup is validated before the safety backup, so a
    /// wrong passphrase never publishes one. A failed restore leaves the journal unchanged.
    pub fn restore_backup(
        &mut self,
        source: RestoreSource,
        passphrase: Zeroizing<String>,
        now: DateTime<Utc>,
    ) -> Result<RestoreOutcome, CommandError> {
        self.journal()?;
        let source = self.restore_source(&source)?;
        // The safety backup can prune the oldest registered backup, which may be the one being
        // restored, so the restore reads a private copy (ciphertext only) taken beforehand.
        let staged = StagedCopy::of(&source, &self.paths.data_dir).map_err(|_| Error::Restore)?;
        let safety_backup = if self.needs_safety_backup()? {
            // Publishing prunes the oldest backup: only do it for a restore that can succeed.
            verify_backup(staged.path(), &passphrase)?;
            self.publish_safety_backup(now)?;
            true
        } else {
            false
        };
        let journal = self.journal.as_mut().ok_or_else(CommandError::not_ready)?;
        journal.restore_from(staged.path(), &passphrase)?;
        drop(staged);
        if let Err(error) = journal.purge_expired(now.timestamp()) {
            diagnostics::record("purge expired trash", error.code());
        }
        let entries = journal.list()?.len();
        self.picked = None;
        Ok(RestoreOutcome {
            entries,
            safety_backup,
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

    /// A journal that holds any entry, including trash, is backed up before it is replaced
    /// whenever a folder and the session passphrase make that possible.
    fn needs_safety_backup(&self) -> Result<bool, CommandError> {
        if self.plan.folder.is_none() || self.passphrase.is_none() {
            return Ok(false);
        }
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
            let error = CommandError::from(error);
            self.last_error = Some(error.clone());
            return Err(error);
        }
        Ok(())
    }
}

/// A private copy of a backup file in the data folder, removed when dropped. It holds the
/// encrypted file only, and its name lets launch and erasure clean up after a crash.
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
            "{TEMPORARY_PREFIX}restore-{}-{nanos}-{}",
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
}

impl Drop for StagedCopy {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::{RestoreSource, is_backup_name};

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
}
