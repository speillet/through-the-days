//! Where the application keeps its device-local files, and how a restore from the startup screen
//! replaces the journal file so that an interruption at any moment is settled at the next launch.

use journal_core::fs::{TEMPORARY_PREFIX, sync_directory, write_file_atomically};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};

/// Environment variable that debug builds accept as the application data folder, for example a
/// scratch folder for an end-to-end check. Release builds ignore it.
pub const DATA_DIR_OVERRIDE: &str = "TTD_DATA_DIR";

/// Suffix of the data folder debug builds use when no override is set: a development run opens
/// `~/Library/Application Support/com.throughthedays.app.dev`, never the real journal.
pub const DEVELOPMENT_SUFFIX: &str = ".dev";

/// Prefix of the private copy of a backup that a restore reads. A backup published into a
/// folder removes leftovers named with [`TEMPORARY_PREFIX`] there, so a copy that is still being
/// restored must not carry that prefix.
pub const STAGING_PREFIX: &str = ".ttd-restore-staging-";

/// File-name suffixes of the files SQLite keeps beside a database, then the database itself.
/// Companions come first: one left beside a new database could be replayed into it.
const JOURNAL_FILES: [&str; 4] = ["-wal", "-shm", "-journal", ""];

/// Marks the name of a journal kept aside: `journal.unreadable-<unix seconds>.sqlite`.
const SET_ASIDE_MARKER: &str = ".unreadable-";

/// How many later seconds a set-aside name may use when earlier names are taken.
const SET_ASIDE_ATTEMPTS: i64 = 60;

/// The application data folder and the files the shell keeps in it.
#[derive(Debug, Clone)]
pub struct DataPaths {
    pub data_dir: PathBuf,
    /// The authoritative journal database.
    pub journal: PathBuf,
    /// Device-local backup settings, kept outside the journal (journal-core `BackupPlan`).
    pub plan: PathBuf,
    /// Exists only while a restore from the startup screen replaces the journal file, or after
    /// such a restore was interrupted (see [`replace_journal`]).
    pub restore_marker: PathBuf,
}

impl DataPaths {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            journal: data_dir.join("journal.sqlite"),
            plan: data_dir.join("backup-plan.json"),
            restore_marker: data_dir.join("restore-in-progress.json"),
            data_dir,
        }
    }
}

/// Chooses the data folder.
///
/// Release builds always use the platform folder
/// (`~/Library/Application Support/com.throughthedays.app`). Debug builds use `TTD_DATA_DIR`
/// when it is set and not empty, and otherwise the platform folder with a `.dev` suffix, so a
/// development run or an end-to-end check never touches the real journal.
pub fn resolve_data_dir(
    override_value: Option<OsString>,
    platform_dir: impl FnOnce() -> Option<PathBuf>,
) -> Option<PathBuf> {
    resolve_for_build(cfg!(debug_assertions), override_value, platform_dir)
}

fn resolve_for_build(
    development: bool,
    override_value: Option<OsString>,
    platform_dir: impl FnOnce() -> Option<PathBuf>,
) -> Option<PathBuf> {
    if !development {
        return platform_dir();
    }
    if let Some(value) = override_value.filter(|value| !value.is_empty()) {
        return std::path::absolute(PathBuf::from(value)).ok();
    }
    platform_dir().map(development_folder)
}

/// The sibling of the platform folder that development builds use.
fn development_folder(platform: PathBuf) -> PathBuf {
    let mut name = platform.file_name().map(OsString::from).unwrap_or_default();
    name.push(DEVELOPMENT_SUFFIX);
    platform.with_file_name(name)
}

/// Creates the data folder, readable only by the person's account when this call creates it.
pub fn create_private_dir(path: &Path) -> io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(path)
}

/// Removes regular files left in `folder` by an interrupted write ([`TEMPORARY_PREFIX`]) or an
/// interrupted restore ([`STAGING_PREFIX`]).
///
/// Best effort: a leftover that cannot be removed is ignored. Symbolic links and folders are
/// never followed or removed.
pub fn remove_stale_temporaries(folder: &Path) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let temporary = entry.file_name().to_str().is_some_and(|name| {
            name.starts_with(TEMPORARY_PREFIX) || name.starts_with(STAGING_PREFIX)
        });
        if temporary && entry.file_type().is_ok_and(|kind| kind.is_file()) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Marks a moment between two file operations of a restore from the startup screen, where a
/// quit, a crash or a power cut could stop the app. Tests copy the data folder at each one to
/// check what the next launch opens; otherwise this does nothing.
pub fn interruption_point() {
    #[cfg(test)]
    interruption::reached();
}

/// Lets a test observe each [`interruption_point`] that an operation reaches.
#[cfg(test)]
pub mod interruption {
    use std::cell::RefCell;

    thread_local! {
        static OBSERVER: RefCell<Option<Box<dyn FnMut()>>> = const { RefCell::new(None) };
    }

    /// Runs `operation` on this thread, calling `observer` at each interruption point it reaches.
    pub fn observe<T>(observer: impl FnMut() + 'static, operation: impl FnOnce() -> T) -> T {
        OBSERVER.with_borrow_mut(|current| *current = Some(Box::new(observer)));
        let result = operation();
        OBSERVER.with_borrow_mut(|current| *current = None);
        result
    }

    pub(super) fn reached() {
        OBSERVER.with_borrow_mut(|observer| {
            if let Some(observer) = observer {
                observer();
            }
        });
    }
}

/// Whether `folder` is `data_dir` or a folder inside it.
///
/// Folders are compared by identity, so a symbolic link or a different letter case does not
/// hide the data folder. A folder that cannot be resolved is compared by its path.
pub fn is_within(folder: &Path, data_dir: &Path) -> bool {
    let lexical = || match (std::path::absolute(folder), std::path::absolute(data_dir)) {
        (Ok(folder), Ok(data_dir)) => folder.starts_with(data_dir),
        _ => false,
    };
    let (Ok(data), Ok(mut current)) = (fs::metadata(data_dir), fs::canonicalize(folder)) else {
        return lexical();
    };
    loop {
        if fs::metadata(&current).is_ok_and(|candidate| same_file(&candidate, &data)) {
            return true;
        }
        if !current.pop() {
            return lexical();
        }
    }
}

#[cfg(unix)]
fn same_file(first: &fs::Metadata, second: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    first.dev() == second.dev() && first.ino() == second.ino()
}

#[cfg(not(unix))]
fn same_file(_first: &fs::Metadata, _second: &fs::Metadata) -> bool {
    false
}

/// Moves the journal database at `journal` and its companions aside as `set_aside`, a path named
/// by [`free_name`], so no file is replaced. Returns whether any of these files existed.
///
/// A journal kept aside is never deleted: `journal.unreadable-<unix seconds>.sqlite`, with its
/// companions under the same name and their usual suffixes. Companions move first: a write-ahead
/// log left behind could otherwise be replayed into the new journal that takes the database's
/// place. If a move fails, the files already moved are put back at once. [`settle_replacement`],
/// which [`replace_journal`] runs next, would also put them back, but only once it has read the
/// marker; putting them back here keeps the journal in place even when that read fails.
fn move_aside(journal: &Path, set_aside: &Path) -> io::Result<bool> {
    let present: Vec<&str> = JOURNAL_FILES
        .into_iter()
        .filter(|suffix| fs::symlink_metadata(with_suffix(journal, suffix)).is_ok())
        .collect();
    for suffix in &present {
        if let Err(error) = fs::rename(with_suffix(journal, suffix), with_suffix(set_aside, suffix))
        {
            let _ = put_back(journal, set_aside);
            return Err(error);
        }
        interruption_point();
    }
    Ok(!present.is_empty())
}

/// What a restore from the startup screen is doing while [`DataPaths::restore_marker`] exists:
/// moving the journal's files aside under the file name `set_aside`, then renaming the complete
/// restored journal, the file `restored` in the data folder, to the journal's name.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreMarker {
    set_aside: String,
    restored: String,
}

impl RestoreMarker {
    /// Reads a marker that names a set-aside journal database and a restore's staging file, so
    /// settling it can never move any other file.
    fn parse(bytes: &[u8], journal: &Path) -> Option<Self> {
        serde_json::from_slice(bytes)
            .ok()
            .filter(|marker: &Self| marker.is_valid(journal))
    }

    fn is_valid(&self, journal: &Path) -> bool {
        let (stem, extension) = stem_and_extension(journal);
        let database = Path::new(&self.set_aside)
            .extension()
            .is_some_and(|candidate| candidate == extension);
        let staging = self.restored.len() > STAGING_PREFIX.len()
            && self.restored.starts_with(STAGING_PREFIX)
            && !self.restored.contains("..")
            && self
                .restored
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.');
        database && is_set_aside_name(&self.set_aside, stem, extension) && staging
    }

    /// Writes the marker durably: complete under a temporary name, flushed, then renamed into
    /// place, and the folder flushed, so a launch finds either no marker or a whole one.
    fn store(&self, paths: &DataPaths) -> io::Result<()> {
        let bytes = serde_json::to_vec(self).map_err(io::Error::other)?;
        write_file_atomically(&paths.restore_marker, &bytes)
    }
}

/// Puts `restored`, a complete journal file already closed in the data folder, in the journal's
/// place. Returns the name under which the journal's own files were kept aside, or `None` when
/// there was no journal file to keep.
///
/// The journal database and its companions are moved aside, never deleted, under a free name
/// from `now` (Unix seconds), and then `restored` takes the journal's name, which completes the
/// replacement. Before anything moves, a durable marker records both names, and
/// [`settle_replacement`] removes it once the replacement is complete or undone: here or, after
/// an interruption, at the next launch. Until `restored` has the journal's name, the journal's
/// files go back to their names. A failure leaves them there and removes `restored`; if they
/// cannot all be moved back, the marker and `restored` stay for the next launch to settle.
pub fn replace_journal(paths: &DataPaths, restored: &Path, now: i64) -> io::Result<Option<String>> {
    let name = match mark_replacement(paths, restored, now) {
        Ok(name) => name,
        Err(error) => {
            remove_journal_files(restored);
            return Err(error);
        }
    };
    interruption_point();
    let set_aside = paths.journal.with_file_name(&name);
    let replaced = move_aside(&paths.journal, &set_aside).and_then(|moved| {
        fs::rename(restored, &paths.journal)?;
        interruption_point();
        Ok(moved.then_some(name))
    });
    // Whether settling succeeds or leaves the marker for the next launch, the outcome is that of
    // the replacement: complete once `restored` has the journal's name.
    let _ = settle_replacement(paths);
    replaced
}

/// Checks that `restored` holds the whole restored journal, flushes it and stores the marker of
/// its replacement. Returns the name under which the journal's files will be kept aside.
fn mark_replacement(paths: &DataPaths, restored: &Path, now: i64) -> io::Result<String> {
    // A write-ahead log or rollback journal beside `restored` would hold part of it and would not
    // move with it.
    let complete = ["-wal", "-journal"]
        .iter()
        .all(|suffix| fs::symlink_metadata(with_suffix(restored, suffix)).is_err());
    if !complete || restored.parent() != Some(paths.data_dir.as_path()) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    File::open(restored)?.sync_all()?;
    let marker = RestoreMarker {
        set_aside: free_name(&paths.journal, now)?,
        restored: restored
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_owned(),
    };
    if !marker.is_valid(&paths.journal) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    marker.store(paths)?;
    Ok(marker.set_aside)
}

/// Completes or undoes the journal replacement that [`replace_journal`] marked, then removes the
/// marker. Launch calls it before anything else touches the data folder.
///
/// Once the restored file has the journal's name, the replacement is complete. Before that, each
/// file kept aside goes back to its original name, which must be free, and the restored file is
/// removed once the marker is gone. A failure keeps the marker, so the next launch settles the
/// replacement the same way. A marker that cannot be read names no file: it is removed while a
/// journal file exists, and otherwise kept as a failure, so that no empty journal is created
/// where one was set aside.
pub fn settle_replacement(paths: &DataPaths) -> io::Result<()> {
    let bytes = match fs::read(&paths.restore_marker) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let journal_exists = fs::symlink_metadata(&paths.journal).is_ok();
    let restored = match RestoreMarker::parse(&bytes, &paths.journal) {
        Some(marker) => {
            let restored = paths.data_dir.join(&marker.restored);
            if fs::symlink_metadata(&restored).is_ok() || !journal_exists {
                put_back(&paths.journal, &paths.data_dir.join(&marker.set_aside))?;
            }
            Some(restored)
        }
        None if journal_exists => None,
        None => return Err(io::ErrorKind::InvalidData.into()),
    };
    // The files keep their names on disk before the marker that explains them goes.
    sync_directory(&paths.data_dir)?;
    fs::remove_file(&paths.restore_marker)?;
    interruption_point();
    sync_directory(&paths.data_dir)?;
    if let Some(restored) = restored {
        remove_journal_files(&restored);
    }
    Ok(())
}

/// Moves each file kept aside as `set_aside` back to its name beside `journal`, the database
/// first, when that name is free. A file whose name is taken stays aside, never deleted.
fn put_back(journal: &Path, set_aside: &Path) -> io::Result<()> {
    let mut result = Ok(());
    for suffix in JOURNAL_FILES.iter().rev() {
        let aside = with_suffix(set_aside, suffix);
        if fs::symlink_metadata(&aside).is_err() {
            continue;
        }
        let original = with_suffix(journal, suffix);
        let moved = if fs::symlink_metadata(&original).is_ok() {
            Err(io::ErrorKind::AlreadyExists.into())
        } else {
            fs::rename(&aside, &original)
        };
        interruption_point();
        result = result.and(moved);
    }
    result
}

/// Removes a database and its companions. Best effort: a file that remains is a staging file,
/// which the next launch removes.
fn remove_journal_files(database: &Path) {
    for suffix in JOURNAL_FILES {
        let _ = fs::remove_file(with_suffix(database, suffix));
    }
}

/// Removes the journals that restores kept aside beside `journal`, with their companions.
///
/// Erasing all app data removes them too: they hold journal entries. Only regular files named
/// like a set-aside journal are removed; a missing folder has none.
pub fn remove_set_aside_journals(journal: &Path) -> io::Result<()> {
    let Some(folder) = journal.parent() else {
        return Ok(());
    };
    let (stem, extension) = stem_and_extension(journal);
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let mut result = Ok(());
    for entry in entries {
        let entry = entry?;
        let set_aside = entry
            .file_name()
            .to_str()
            .is_some_and(|name| is_set_aside_name(name, stem, extension));
        if set_aside
            && entry.file_type()?.is_file()
            && let Err(error) = fs::remove_file(entry.path())
        {
            result = Err(error);
        }
    }
    result
}

/// Whether `name` is `<stem>.unreadable-<seconds>.<extension>`, possibly with a companion suffix.
fn is_set_aside_name(name: &str, stem: &str, extension: &str) -> bool {
    let Some(rest) = name
        .strip_prefix(stem)
        .and_then(|rest| rest.strip_prefix(SET_ASIDE_MARKER))
    else {
        return false;
    };
    let Some((seconds, rest)) = rest.split_once('.') else {
        return false;
    };
    let Some(suffix) = rest.strip_prefix(extension) else {
        return false;
    };
    !seconds.is_empty()
        && seconds.bytes().all(|byte| byte.is_ascii_digit())
        && JOURNAL_FILES.contains(&suffix)
}

/// `path` with `suffix` appended to its file name.
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(path.as_os_str());
    name.push(suffix);
    PathBuf::from(name)
}

fn stem_and_extension(journal: &Path) -> (&str, &str) {
    let stem = journal
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("journal");
    let extension = journal
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("sqlite");
    (stem, extension)
}

/// The first `<stem>.unreadable-<seconds>.<extension>` name, from `now` on, whose database and
/// companion names are all free beside `journal`.
fn free_name(journal: &Path, now: i64) -> io::Result<String> {
    let (stem, extension) = stem_and_extension(journal);
    (now..now.saturating_add(SET_ASIDE_ATTEMPTS))
        .map(|seconds| format!("{stem}{SET_ASIDE_MARKER}{seconds}.{extension}"))
        .find(|name| {
            let target = journal.with_file_name(name);
            JOURNAL_FILES
                .iter()
                .all(|suffix| fs::symlink_metadata(with_suffix(&target, suffix)).is_err())
        })
        .ok_or_else(|| io::ErrorKind::AlreadyExists.into())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::*;

    fn platform() -> Option<PathBuf> {
        Some(PathBuf::from(
            "/Synthetic/Application Support/com.throughthedays.app",
        ))
    }

    fn development() -> Option<PathBuf> {
        Some(PathBuf::from(
            "/Synthetic/Application Support/com.throughthedays.app.dev",
        ))
    }

    #[test]
    fn debug_builds_never_open_the_real_journal_folder() {
        // Tests are debug builds, like `tauri dev` and `tauri build --debug`.
        let chosen = resolve_data_dir(Some("/tmp/ttd-synthetic".into()), platform);
        assert_eq!(chosen, Some(PathBuf::from("/tmp/ttd-synthetic")));
        assert_eq!(
            resolve_data_dir(Some(OsString::new()), platform),
            development()
        );
        assert_eq!(resolve_data_dir(None, platform), development());
        assert_ne!(resolve_data_dir(None, platform), platform());
    }

    #[test]
    fn release_builds_always_use_the_platform_folder() {
        assert_eq!(
            resolve_for_build(false, Some("/tmp/ttd-synthetic".into()), platform),
            platform()
        );
        assert_eq!(resolve_for_build(false, None, platform), platform());
        assert_eq!(resolve_for_build(false, None, || None), None);
    }

    #[test]
    fn a_relative_override_becomes_an_absolute_folder() {
        let chosen = resolve_data_dir(Some("synthetic-data".into()), platform).unwrap();
        assert!(chosen.is_absolute());
        assert!(chosen.ends_with("synthetic-data"));
    }

    #[test]
    fn the_journal_and_backup_plan_live_in_the_data_folder() {
        let paths = DataPaths::new(PathBuf::from("/Synthetic/data"));
        assert_eq!(
            paths.journal,
            PathBuf::from("/Synthetic/data/journal.sqlite")
        );
        assert_eq!(
            paths.plan,
            PathBuf::from("/Synthetic/data/backup-plan.json")
        );
        assert_eq!(
            paths.restore_marker,
            PathBuf::from("/Synthetic/data/restore-in-progress.json")
        );
    }

    #[test]
    fn only_stale_temporary_and_staging_files_are_removed() {
        let folder = tempfile::tempdir().unwrap();
        let stale = folder.path().join(".ttd-incomplete-abc");
        let staged = folder.path().join(".ttd-restore-staging-1-2-3");
        let kept = folder.path().join("journal.sqlite");
        let nested = folder.path().join(".ttd-incomplete-folder");
        fs::write(&stale, b"synthetic").unwrap();
        fs::write(&staged, b"synthetic").unwrap();
        fs::write(&kept, b"synthetic").unwrap();
        fs::create_dir(&nested).unwrap();
        remove_stale_temporaries(folder.path());
        assert!(!stale.exists());
        assert!(!staged.exists());
        assert!(kept.exists());
        assert!(nested.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn a_new_data_folder_is_private_to_the_account() {
        use std::os::unix::fs::PermissionsExt;
        let parent = tempfile::tempdir().unwrap();
        let data = parent.path().join("nested").join("data");
        create_private_dir(&data).unwrap();
        let mode = fs::metadata(&data).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700);
        // An existing folder is accepted as it is.
        create_private_dir(&data).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn the_data_folder_is_recognised_inside_it_and_through_links() {
        let parent = tempfile::tempdir().unwrap();
        let data = parent.path().join("data");
        let inside = data.join("synthetic").join("nested");
        fs::create_dir_all(&inside).unwrap();
        let link = parent.path().join("link to data");
        std::os::unix::fs::symlink(&data, &link).unwrap();
        let elsewhere = parent.path().join("backups");
        fs::create_dir(&elsewhere).unwrap();

        assert!(is_within(&data, &data));
        assert!(is_within(&inside, &data));
        assert!(is_within(&link, &data));
        assert!(is_within(&link.join("synthetic"), &data));
        assert!(!is_within(&elsewhere, &data));
        // The folder that contains the data folder is not inside it.
        assert!(!is_within(parent.path(), &data));
        // A folder that does not exist yet is compared by its path.
        assert!(is_within(&data.join("missing"), &data));
        assert!(!is_within(&parent.path().join("missing"), &data));
    }

    #[test]
    fn a_journal_is_set_aside_with_its_companions_and_never_replaces_a_file() {
        let folder = tempfile::tempdir().unwrap();
        let journal = folder.path().join("journal.sqlite");
        fs::write(&journal, b"synthetic damaged journal").unwrap();
        fs::write(with_suffix(&journal, "-wal"), b"synthetic log").unwrap();
        // A journal kept aside earlier in the same second keeps its name and content.
        let earlier = folder.path().join("journal.unreadable-1795363200.sqlite");
        fs::write(&earlier, b"synthetic earlier journal").unwrap();

        let name = free_name(&journal, 1_795_363_200).unwrap();
        assert_eq!(name, "journal.unreadable-1795363201.sqlite");
        let kept = folder.path().join(&name);
        assert!(move_aside(&journal, &kept).unwrap());
        assert!(!journal.exists());
        assert!(!with_suffix(&journal, "-wal").exists());
        assert_eq!(fs::read(&kept).unwrap(), b"synthetic damaged journal");
        assert_eq!(
            fs::read(with_suffix(&kept, "-wal")).unwrap(),
            b"synthetic log"
        );
        assert_eq!(fs::read(&earlier).unwrap(), b"synthetic earlier journal");

        put_back(&journal, &kept).unwrap();
        assert_eq!(fs::read(&journal).unwrap(), b"synthetic damaged journal");
        assert_eq!(
            fs::read(with_suffix(&journal, "-wal")).unwrap(),
            b"synthetic log"
        );
        assert!(!kept.exists());
    }

    #[test]
    fn only_set_aside_journals_are_removed_with_their_companions() {
        let folder = tempfile::tempdir().unwrap();
        let journal = folder.path().join("journal.sqlite");
        let removed = [
            "journal.unreadable-1795363200.sqlite",
            "journal.unreadable-1795363200.sqlite-wal",
            "journal.unreadable-1795363201.sqlite-journal",
        ];
        let kept = [
            "journal.sqlite",
            "journal.unreadable-.sqlite",
            "journal.unreadable-synthetic.sqlite",
            "journal.unreadable-1795363200.sqlite-notes",
            "journal.unreadable-1795363200.txt",
            "synthetic notes.txt",
        ];
        for name in removed.iter().chain(&kept) {
            fs::write(folder.path().join(name), b"synthetic").unwrap();
        }
        let nested = folder.path().join("journal.unreadable-1795363202.sqlite");
        fs::create_dir(&nested).unwrap();

        remove_set_aside_journals(&journal).unwrap();
        assert!(
            removed
                .iter()
                .all(|name| !folder.path().join(name).exists())
        );
        assert!(kept.iter().all(|name| folder.path().join(name).is_file()));
        assert!(nested.is_dir());
        // A data folder that does not exist has nothing to remove.
        remove_set_aside_journals(&folder.path().join("missing").join("journal.sqlite")).unwrap();
    }

    #[test]
    fn nothing_is_set_aside_when_there_is_no_journal() {
        let folder = tempfile::tempdir().unwrap();
        let journal = folder.path().join("journal.sqlite");
        let name = free_name(&journal, 1).unwrap();
        assert!(!move_aside(&journal, &journal.with_file_name(name)).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn the_restore_marker_is_written_whole_and_private_to_the_account() {
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().unwrap();
        let paths = DataPaths::new(folder.path().to_path_buf());
        let marker = RestoreMarker {
            set_aside: "journal.unreadable-1795363200.sqlite".to_owned(),
            restored: ".ttd-restore-staging-1".to_owned(),
        };
        marker.store(&paths).unwrap();
        let names: Vec<_> = fs::read_dir(folder.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, ["restore-in-progress.json"]);
        let mode = fs::metadata(&paths.restore_marker)
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        let stored =
            RestoreMarker::parse(&fs::read(&paths.restore_marker).unwrap(), &paths.journal);
        assert_eq!(stored.unwrap().set_aside, marker.set_aside);
    }

    #[test]
    fn a_journal_that_cannot_be_moved_aside_whole_is_put_back() {
        let folder = tempfile::tempdir().unwrap();
        let journal = folder.path().join("journal.sqlite");
        fs::write(&journal, b"synthetic damaged journal").unwrap();
        fs::write(with_suffix(&journal, "-wal"), b"synthetic log").unwrap();
        // The log moves aside, then a folder in the database's way stops the move.
        let kept = folder.path().join("journal.unreadable-1795363200.sqlite");
        fs::create_dir(&kept).unwrap();
        fs::write(kept.join("synthetic"), b"synthetic").unwrap();
        move_aside(&journal, &kept).unwrap_err();
        assert_eq!(fs::read(&journal).unwrap(), b"synthetic damaged journal");
        assert_eq!(
            fs::read(with_suffix(&journal, "-wal")).unwrap(),
            b"synthetic log"
        );
        assert!(!with_suffix(&kept, "-wal").exists());
        assert!(kept.join("synthetic").is_file());
    }

    /// A data folder with a journal and its log that cannot be opened, and a complete restored
    /// journal in a staging file.
    fn replacement_folder() -> (tempfile::TempDir, DataPaths, PathBuf) {
        let folder = tempfile::tempdir().unwrap();
        let paths = DataPaths::new(folder.path().to_path_buf());
        fs::write(&paths.journal, b"synthetic damaged journal").unwrap();
        fs::write(with_suffix(&paths.journal, "-wal"), b"synthetic log").unwrap();
        let restored = folder.path().join(".ttd-restore-staging-1-2-3.sqlite");
        fs::write(&restored, b"synthetic restored journal").unwrap();
        (folder, paths, restored)
    }

    #[test]
    fn a_restored_journal_takes_the_journal_name_once_complete_and_the_journal_is_kept_aside() {
        let (folder, paths, restored) = replacement_folder();
        // A log beside the restored file holds part of it: nothing moves.
        let log = with_suffix(&restored, "-wal");
        fs::write(&log, b"synthetic restored log").unwrap();
        replace_journal(&paths, &restored, 1_795_363_200).unwrap_err();
        assert_eq!(
            fs::read(&paths.journal).unwrap(),
            b"synthetic damaged journal"
        );
        assert!(!restored.exists() && !log.exists());
        assert!(!paths.restore_marker.exists());

        fs::write(&restored, b"synthetic restored journal").unwrap();
        let name = replace_journal(&paths, &restored, 1_795_363_200).unwrap();
        assert_eq!(
            name.as_deref(),
            Some("journal.unreadable-1795363200.sqlite")
        );
        assert_eq!(
            fs::read(&paths.journal).unwrap(),
            b"synthetic restored journal"
        );
        assert!(!with_suffix(&paths.journal, "-wal").exists());
        let kept = folder.path().join("journal.unreadable-1795363200.sqlite");
        assert_eq!(fs::read(&kept).unwrap(), b"synthetic damaged journal");
        assert_eq!(
            fs::read(with_suffix(&kept, "-wal")).unwrap(),
            b"synthetic log"
        );
        assert!(!restored.exists());
        assert!(!paths.restore_marker.exists());
    }

    #[test]
    fn a_replacement_that_cannot_finish_puts_the_journal_back() {
        let (folder, paths, restored) = replacement_folder();
        // The restored file disappears once the replacement is marked, so it can never take
        // the journal's name.
        let vanishing = restored.clone();
        let error = interruption::observe(
            move || {
                let _ = fs::remove_file(&vanishing);
            },
            || replace_journal(&paths, &restored, 1_795_363_200),
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        let mut names: Vec<_> = fs::read_dir(folder.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        names.sort();
        assert_eq!(names, ["journal.sqlite", "journal.sqlite-wal"]);
        assert_eq!(
            fs::read(folder.path().join("journal.sqlite")).unwrap(),
            b"synthetic damaged journal"
        );
    }

    #[test]
    fn a_restore_marker_settles_only_a_set_aside_journal_and_a_staging_file() {
        let (folder, paths, _) = replacement_folder();
        let kept = folder.path().join("journal.unreadable-1795363200.sqlite");
        fs::write(&kept, b"synthetic earlier journal").unwrap();
        let marker = |set_aside: &str, restored: &str| {
            serde_json::json!({"setAside": set_aside, "restored": restored}).to_string()
        };
        let unusable = [
            "synthetic damaged marker".to_owned(),
            marker("journal.unreadable-1795363200.sqlite", "journal.sqlite"),
            marker(
                "journal.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-",
            ),
            marker(
                "journal.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-../x",
            ),
            marker(
                "journal.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-1/x",
            ),
            marker(
                "journal.unreadable-1795363200.sqlite-wal",
                ".ttd-restore-staging-1",
            ),
            marker(
                "../journal.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-1",
            ),
            marker(
                "notes.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-1",
            ),
            serde_json::json!({
                "setAside": "journal.unreadable-1795363200.sqlite",
                "restored": ".ttd-restore-staging-1",
                "synthetic": true
            })
            .to_string(),
        ];
        for contents in &unusable {
            // Beside a journal file, an unusable marker is removed and nothing moves.
            fs::write(&paths.restore_marker, contents).unwrap();
            settle_replacement(&paths).unwrap();
            assert!(!paths.restore_marker.exists(), "{contents}");
            assert_eq!(
                fs::read(&paths.journal).unwrap(),
                b"synthetic damaged journal"
            );
            assert_eq!(fs::read(&kept).unwrap(), b"synthetic earlier journal");
        }
        // Without a journal file, it stays and nothing is created in the journal's place.
        fs::remove_file(&paths.journal).unwrap();
        fs::remove_file(with_suffix(&paths.journal, "-wal")).unwrap();
        for contents in &unusable {
            fs::write(&paths.restore_marker, contents).unwrap();
            settle_replacement(&paths).unwrap_err();
            assert!(paths.restore_marker.exists(), "{contents}");
            assert!(!paths.journal.exists());
            assert_eq!(fs::read(&kept).unwrap(), b"synthetic earlier journal");
        }
        // A usable marker puts the journal it set aside back.
        fs::write(
            &paths.restore_marker,
            marker(
                "journal.unreadable-1795363200.sqlite",
                ".ttd-restore-staging-1",
            ),
        )
        .unwrap();
        settle_replacement(&paths).unwrap();
        assert!(!paths.restore_marker.exists());
        assert_eq!(
            fs::read(&paths.journal).unwrap(),
            b"synthetic earlier journal"
        );
        assert!(!kept.exists());
    }
}
