//! Where the application keeps its device-local files.

use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

/// Environment variable that debug builds accept as the application data folder, so a
/// development run or an end-to-end check never touches the real journal. Release builds
/// ignore it.
pub const DATA_DIR_OVERRIDE: &str = "TTD_DATA_DIR";

/// Prefix of temporary files written next to a file that is replaced atomically. It matches
/// journal-core, whose backup plan writes use it in the data folder.
pub const TEMPORARY_PREFIX: &str = ".ttd-incomplete-";

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

/// Chooses the data folder: `TTD_DATA_DIR` in debug builds when it is set and not empty,
/// otherwise the platform folder (`~/Library/Application Support/com.throughthedays.app`).
pub fn resolve_data_dir(
    override_value: Option<OsString>,
    platform_dir: impl FnOnce() -> Option<PathBuf>,
) -> Option<PathBuf> {
    if cfg!(debug_assertions)
        && let Some(value) = override_value.filter(|value| !value.is_empty())
    {
        return std::path::absolute(PathBuf::from(value)).ok();
    }
    platform_dir()
}

/// Creates the data folder, readable only by the person's account when this call creates it.
pub fn create_private_dir(path: &Path) -> io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(path)
}

/// Removes regular files left with [`TEMPORARY_PREFIX`] in `folder` by an interrupted write.
///
/// Best effort: a leftover that cannot be removed is ignored. Symbolic links and folders are
/// never followed or removed.
pub fn remove_stale_temporaries(folder: &Path) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let temporary = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(TEMPORARY_PREFIX));
        if temporary && entry.file_type().is_ok_and(|kind| kind.is_file()) {
            let _ = fs::remove_file(entry.path());
        }
    }
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

    #[test]
    fn debug_builds_honour_a_non_empty_data_folder_override() {
        let chosen = resolve_data_dir(Some("/tmp/ttd-synthetic".into()), platform);
        assert_eq!(chosen, Some(PathBuf::from("/tmp/ttd-synthetic")));
        assert_eq!(
            resolve_data_dir(Some(OsString::new()), platform),
            platform()
        );
        assert_eq!(resolve_data_dir(None, platform), platform());
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
    fn only_stale_temporary_files_are_removed() {
        let folder = tempfile::tempdir().unwrap();
        let stale = folder.path().join(".ttd-incomplete-abc");
        let kept = folder.path().join("journal.sqlite");
        let nested = folder.path().join(".ttd-incomplete-folder");
        fs::write(&stale, b"synthetic").unwrap();
        fs::write(&kept, b"synthetic").unwrap();
        fs::create_dir(&nested).unwrap();
        remove_stale_temporaries(folder.path());
        assert!(!stale.exists());
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
}
