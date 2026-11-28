//! Restoring a backup chosen by its registered name or in the native open dialog.
//!
//! The renderer never sends a path: a registered name is checked and resolved inside the chosen
//! folder, and a picked file stays in native state.

use super::{Core, StartupState, backup::display_name};
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
    io::{self, Read, Write},
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

impl RestoreSource {
    /// Whether the backup file may be reached through a symbolic link. A picked file is the one
    /// the person chose, through a link or not. A registered name must be the file that the
    /// folder lists, never a link that someone else who can write to the folder put in its place.
    fn follows_links(&self) -> bool {
        matches!(self, Self::Picked)
    }
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
            name: display_name(path),
        })
    }

    /// Replaces the journal with a validated backup.
    ///
    /// The chosen backup is copied and verified first, so a backup that cannot be reached
    /// (`backupUnavailable`), a wrong passphrase or a damaged file changes nothing. When the
    /// current journal holds any entry, including trash, and a folder and the session passphrase
    /// are available, a safety backup of it is published before it is replaced. If the journal
    /// cannot be read for that, the restore stops with `safetyBackupFailed`, unless
    /// `without_safety_backup` confirms that it may go ahead without one. Any other failure of
    /// the safety backup, such as a disconnected backup drive, cancels the restore with its own
    /// error. When the start failed, found a journal this version cannot open, or found an
    /// older journal waiting for its upgrade, the backup replaces the journal file instead (see [`Self::restore_at_startup`]). A failed restore
    /// leaves the journal unchanged.
    pub fn restore_backup(
        &mut self,
        source: RestoreSource,
        passphrase: &str,
        without_safety_backup: bool,
        now: DateTime<Utc>,
    ) -> Result<RestoreOutcome, CommandError> {
        match self.startup.state {
            StartupState::Ready => {}
            // An older journal waiting for its upgrade is not open either, and a damaged page or
            // an invalid row in it can stop every pre-migration backup: a restore replaces it.
            StartupState::Failed | StartupState::Unsupported | StartupState::NeedsMigration => {
                return self.restore_at_startup(&source, passphrase, now);
            }
        }
        let path = self.restore_source(&source)?;
        // The safety backup can prune the oldest registered backup, which may be the one being
        // restored, so the restore reads a private copy (ciphertext only) taken beforehand.
        let staged = StagedCopy::of(&path, source.follows_links(), &self.paths.data_dir)?;
        verify_backup(staged.path(), passphrase)?;
        let safety_backup = self.safety_backup(without_safety_backup, now)?;
        let journal = self.journal.as_mut().ok_or_else(CommandError::not_ready)?;
        journal.restore_from(staged.path(), passphrase)?;
        drop(staged);
        self.purge_after_opening(now);
        let entries = self.journal()?.list()?.len();
        self.picked = None;
        Ok(RestoreOutcome {
            entries,
            safety_backup,
            set_aside: None,
        })
    }

    /// Restores when no journal is open because the start failed, found a journal this version
    /// cannot open, or found an older journal that is still waiting for its protected upgrade.
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
        let path = self.restore_source(source)?;
        let staged = StagedCopy::of(&path, source.follows_links(), &self.paths.data_dir)?;
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

    /// The file to restore. A registered name must still be listed in the chosen folder, and a
    /// file must have been picked.
    ///
    /// A folder that is unavailable lists no backups, so a backup on a disconnected drive, one
    /// removed since the list was shown, and a list of backups that can no longer be read are
    /// all `backupUnavailable`, as is a restore with no picked file. None of them is a reason to
    /// doubt the passphrase.
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
                        .map_err(|error| {
                            diagnostics::record("list backups to restore", error.code());
                            CommandError::backup_unavailable()
                        })?
                        .iter()
                        .any(|backup| backup.name == *name);
                if !registered {
                    return Err(CommandError::backup_unavailable());
                }
                Ok(folder.join(name))
            }
            RestoreSource::Picked => self
                .picked
                .clone()
                .ok_or_else(CommandError::backup_unavailable),
        }
    }

    /// Publishes a safety backup of a journal that holds any entry, including trash, whenever a
    /// folder and the session passphrase make that possible. Returns whether one was published.
    ///
    /// Only a journal that cannot be read, including one whose snapshot reports `damaged`, may
    /// be replaced without a safety backup: the restore stops with `safetyBackupFailed` unless
    /// `without_safety_backup` confirms going ahead. Any other failure, such as an unavailable
    /// folder or a backup that fails validation, cancels the restore with its own error, and the
    /// backup status keeps it.
    fn safety_backup(
        &mut self,
        without_safety_backup: bool,
        now: DateTime<Utc>,
    ) -> Result<bool, CommandError> {
        if self.plan.folder.is_none() || self.passphrase.is_none() {
            return Ok(false);
        }
        match self.holds_entries() {
            Ok(false) => return Ok(false),
            Ok(true) => match self.publish_safety_backup(now) {
                Ok(()) => return Ok(true),
                // The snapshot could not read part of the journal.
                Err(error) if error.code == Error::Damaged.code() => {}
                Err(error) => return Err(error),
            },
            Err(error) => diagnostics::record("read journal before restore", error.code),
        }
        // The journal cannot be read, so no safety backup of it can ever be made.
        if without_safety_backup {
            Ok(false)
        } else {
            Err(CommandError::safety_backup_failed())
        }
    }

    fn holds_entries(&self) -> Result<bool, CommandError> {
        let journal = self.journal()?;
        Ok(!journal.list()?.is_empty() || !journal.trash_items()?.is_empty())
    }

    fn publish_safety_backup(&mut self, now: DateTime<Utc>) -> Result<(), CommandError> {
        let journal = self.journal()?;
        let (folder, passphrase) = self.backup_target()?;
        if let Err(error) = journal.backup_to(folder, passphrase, now.timestamp()) {
            diagnostics::record("safety backup", error.code());
            return Err(self.backup_failed(error));
        }
        Ok(())
    }
}

/// Opens `path` for reading when it is a regular file.
///
/// Opening a named pipe never waits for a writer (`O_NONBLOCK`, which does not change how a
/// regular file reads). A symbolic link in the file's place is followed only when
/// `follow_links`; otherwise it fails to open (`O_NOFOLLOW`). A pipe, a device or a folder is
/// refused once open, so reading the file can neither block nor go on without end.
fn open_regular_file(path: &Path, follow_links: bool) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        let links = if follow_links { 0 } else { libc::O_NOFOLLOW };
        std::os::unix::fs::OpenOptionsExt::custom_flags(&mut options, libc::O_NONBLOCK | links);
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    Ok(file)
}

/// Copies `input` to `output`, failing once `input` holds more than `limit` bytes. At most one
/// byte more than `limit` is copied.
fn copy_at_most(input: impl Read, output: &mut impl Write, limit: u64) -> Result<(), CommandError> {
    let mut input = input.take(limit.saturating_add(1));
    let mut copied = 0_u64;
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let length = match input.read(&mut buffer) {
            Ok(0) => return Ok(()),
            Ok(length) => length,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(_) => return Err(CommandError::backup_unavailable()),
        };
        output
            .write_all(&buffer[..length])
            .map_err(|_| Error::Storage)?;
        copied += length as u64;
        if copied > limit {
            return Err(Error::Restore.into());
        }
    }
}

/// A private copy of a backup file in the data folder, removed when dropped. It holds the
/// encrypted file only, and its name lets launch and erasure clean up after a crash. Its prefix
/// is not the temporary-file prefix, which a backup published into the same folder removes.
struct StagedCopy(PathBuf);

impl StagedCopy {
    /// Copies only a regular backup, with bounded reads and distinct source/storage errors.
    fn of(source: &Path, follow_links: bool, folder: &Path) -> Result<Self, CommandError> {
        Self::at_most(source, follow_links, folder, MAXIMUM_BACKUP_BYTES)
    }

    /// A failed copy is removed; files that grow cannot fill the disk beyond the size limit.
    fn at_most(
        source: &Path,
        follow_links: bool,
        folder: &Path,
        limit: u64,
    ) -> Result<Self, CommandError> {
        static COPIES: AtomicU64 = AtomicU64::new(0);
        let unavailable = |_| CommandError::backup_unavailable();
        let input = open_regular_file(source, follow_links).map_err(unavailable)?;
        if input.metadata().map_err(unavailable)?.len() > limit {
            return Err(Error::Restore.into());
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
        let mut output = options
            .open(folder.join(&name))
            .map_err(|_| Error::Storage)?;
        let staged = Self(folder.join(name));
        copy_at_most(input, &mut output, limit)?;
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
    use super::{RestoreOutcome, RestoreSource, StagedCopy, copy_at_most, is_backup_name};
    use crate::testing::names_in;
    use std::{fs, io, os::unix::fs::symlink, path::Path, sync::mpsc, thread, time::Duration};

    const BACKUP: &[u8] = b"Synthetic encrypted backup";

    /// local-data-protection — Safe restore / Backup replaced before it is copied: a symbolic
    /// link that replaced a registered backup is never followed by the private copy, while a
    /// file the person picked may be reached through a link.
    #[test]
    fn the_private_copy_follows_a_link_only_for_a_picked_file() {
        let backups = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let backup = backups.path().join("ttd-1795363200-synthetic.ttd.age");
        fs::write(&backup, BACKUP).unwrap();
        let link = backups.path().join("ttd-1795449600-link.ttd.age");
        symlink(&backup, &link).unwrap();

        let registered = RestoreSource::Registered {
            name: "ttd-1795449600-link.ttd.age".into(),
        };
        assert!(!registered.follows_links());
        assert!(StagedCopy::of(&link, false, data.path()).is_err());
        assert!(names_in(data.path()).is_empty());

        assert!(RestoreSource::Picked.follows_links());
        let staged = StagedCopy::of(&link, true, data.path()).unwrap();
        assert_eq!(fs::read(staged.path()).unwrap(), BACKUP);
        drop(staged);
        assert!(names_in(data.path()).is_empty());
    }

    /// local-data-protection — Safe restore / Backup replaced before it is copied: a named pipe
    /// in a backup's place, which nothing writes to, is refused at once, whether the backup was
    /// listed or picked, instead of keeping the restore waiting while it holds the journal.
    #[test]
    fn the_private_copy_refuses_a_named_pipe_without_waiting_for_a_writer() {
        let backups = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let pipe = backups.path().join("ttd-1795449600-pipe.ttd.age");
        let made = std::process::Command::new("mkfifo")
            .arg(&pipe)
            .status()
            .unwrap();
        assert!(made.success());
        for follow_links in [false, true] {
            let (sender, receiver) = mpsc::channel();
            let (pipe, folder) = (pipe.clone(), data.path().to_path_buf());
            thread::spawn(move || {
                let _ = sender.send(StagedCopy::of(&pipe, follow_links, &folder).is_err());
            });
            assert_eq!(
                receiver.recv_timeout(Duration::from_secs(5)),
                Ok(true),
                "follow_links: {follow_links}"
            );
        }
        assert!(names_in(data.path()).is_empty());
    }

    /// local-data-protection — Safe restore / Backup replaced before it is copied: a device or a
    /// folder in a backup's place is refused before anything is copied, even through a picked
    /// link.
    #[test]
    fn the_private_copy_refuses_devices_and_folders() {
        let backups = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let device = backups.path().join("ttd-1795449600-device.ttd.age");
        symlink("/dev/zero", &device).unwrap();
        for (source, follow_links) in [
            (device.as_path(), false),
            (device.as_path(), true),
            (Path::new("/dev/zero"), true),
            (backups.path(), true),
        ] {
            assert!(
                StagedCopy::of(source, follow_links, data.path()).is_err(),
                "{}",
                source.display()
            );
        }
        assert!(names_in(data.path()).is_empty());
    }

    /// local-data-protection — Safe restore / Backup replaced before it is copied: the private
    /// copy stops at its size limit. A larger file is not copied, and a source that never ends,
    /// or keeps growing while it is copied, fails one byte past the limit.
    #[test]
    fn the_private_copy_stops_at_its_size_limit() {
        let backups = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let backup = backups.path().join("ttd-1795363200-synthetic.ttd.age");
        fs::write(&backup, BACKUP).unwrap();
        let limit = BACKUP.len() as u64;
        let staged = StagedCopy::at_most(&backup, false, data.path(), limit).unwrap();
        assert_eq!(fs::read(staged.path()).unwrap(), BACKUP);
        drop(staged);
        assert!(StagedCopy::at_most(&backup, false, data.path(), limit - 1).is_err());
        assert!(names_in(data.path()).is_empty());

        let mut copied = Vec::new();
        let endless = copy_at_most(io::repeat(7), &mut copied, 16).unwrap_err();
        assert_eq!(endless.code, "restore");
        assert_eq!(copied.len(), 17);
        let mut exact = Vec::new();
        copy_at_most(BACKUP, &mut exact, limit).unwrap();
        assert_eq!(exact, BACKUP);
    }

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
