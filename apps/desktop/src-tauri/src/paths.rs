//! Where the application keeps its device-local files.

use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

/// Environment variable that debug builds accept as the application data folder, for example a
/// scratch folder for an end-to-end check. Release builds ignore it.
pub const DATA_DIR_OVERRIDE: &str = "TTD_DATA_DIR";

/// Suffix of the data folder debug builds use when no override is set: a development run opens
/// `~/Library/Application Support/com.throughthedays.app.dev`, never the real journal.
pub const DEVELOPMENT_SUFFIX: &str = ".dev";

/// Prefix of temporary files written next to a file that is replaced atomically. It matches
/// journal-core, whose backup plan writes use it in the data folder.
pub const TEMPORARY_PREFIX: &str = ".ttd-incomplete-";

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
}

impl DataPaths {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            journal: data_dir.join("journal.sqlite"),
            plan: data_dir.join("backup-plan.json"),
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

/// A journal that could not be opened, kept in the data folder under a new name and never
/// deleted: `journal.unreadable-<unix seconds>.sqlite`, with its companions under the same name
/// and their usual suffixes.
#[derive(Debug)]
pub struct SetAside {
    /// File name of the journal database as it is now kept.
    name: String,
    /// Each moved file: its original path and its path now.
    moved: Vec<(PathBuf, PathBuf)>,
}

impl SetAside {
    /// Moves the journal database at `journal` and its companions aside. Returns `None` when
    /// none of these files exists.
    ///
    /// The name uses `now` (Unix seconds), or the next second whose names are all free, so no
    /// file is replaced. Companions move first: a write-ahead log left behind could otherwise be
    /// replayed into the new journal that takes the database's place. If a move fails, the files
    /// already moved are moved back.
    pub fn move_journal(journal: &Path, now: i64) -> io::Result<Option<Self>> {
        let present: Vec<&str> = JOURNAL_FILES
            .into_iter()
            .filter(|suffix| fs::symlink_metadata(with_suffix(journal, suffix)).is_ok())
            .collect();
        if present.is_empty() {
            return Ok(None);
        }
        let name = free_name(journal, now)?;
        let target = journal.with_file_name(&name);
        let mut set_aside = Self {
            name,
            moved: Vec::new(),
        };
        for suffix in present {
            let original = with_suffix(journal, suffix);
            let aside = with_suffix(&target, suffix);
            if let Err(error) = fs::rename(&original, &aside) {
                let _ = set_aside.put_back();
                return Err(error);
            }
            set_aside.moved.push((original, aside));
        }
        Ok(Some(set_aside))
    }

    /// File name of the journal database as it is now kept.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Moves the files back to their original names, which must be free again. Best effort: a
    /// file that cannot be moved back stays aside, never deleted.
    pub fn put_back(self) -> io::Result<()> {
        let mut result = Ok(());
        for (original, aside) in self.moved.iter().rev() {
            let moved = if fs::symlink_metadata(original).is_ok() {
                Err(io::ErrorKind::AlreadyExists.into())
            } else {
                fs::rename(aside, original)
            };
            if let Err(error) = moved {
                result = result.and(Err(error));
            }
        }
        result
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

        let set_aside = SetAside::move_journal(&journal, 1_795_363_200)
            .unwrap()
            .unwrap();
        assert_eq!(set_aside.name(), "journal.unreadable-1795363201.sqlite");
        assert!(!journal.exists());
        assert!(!with_suffix(&journal, "-wal").exists());
        let kept = folder.path().join(set_aside.name());
        assert_eq!(fs::read(&kept).unwrap(), b"synthetic damaged journal");
        assert_eq!(
            fs::read(with_suffix(&kept, "-wal")).unwrap(),
            b"synthetic log"
        );
        assert_eq!(fs::read(&earlier).unwrap(), b"synthetic earlier journal");

        set_aside.put_back().unwrap();
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
        assert!(SetAside::move_journal(&journal, 1).unwrap().is_none());
    }
}
