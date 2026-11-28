//! The registry of validated backups kept in the chosen backup folder.
//!
//! Only files listed here were verified by this application after encryption. Listing and
//! pruning trust nothing else in the folder, and pruning deletes a file only when its name is a
//! backup name and its SHA-256 digest still matches the registered one.
//!
//! Others may be able to write to the folder too, so its files are read only as regular files,
//! never through a symbolic link, and the registry only up to [`MAXIMUM_REGISTRY_BYTES`].

use crate::{
    Error,
    fsutil::{
        TEMPORARY_PREFIX, backup_folder_error, open_regular_file, parse_json_object,
        write_atomically,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read},
    path::Path,
};

/// File name of the registry inside the backup folder.
pub(crate) const REGISTRY_FILE: &str = ".through-the-days-backups.json";
const REGISTRY_VERSION: u32 = 1;
/// Number of newest validated backups kept by pruning (D-009).
pub(crate) const RETAINED_BACKUPS: usize = 30;
/// Largest registry read: room for thousands of entries, where retention keeps about 30.
const MAXIMUM_REGISTRY_BYTES: u64 = 1 << 20;
/// Latest creation time of a registered backup, 9999-12-31T23:59:59Z in Unix seconds.
///
/// No backup was made after it or before 1970. Such an entry is treated like an unsafe name, so
/// it can neither sort before every real backup nor hold back pruning, and every listed time is
/// one the interface can show as a date.
const LATEST_CREATION_TIME: i64 = 253_402_300_799;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistryFile {
    version: u32,
    backups: Vec<Registered>,
}

/// One validated backup as recorded in the registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Registered {
    pub(crate) name: String,
    pub(crate) created_at: i64,
    /// Lowercase hexadecimal SHA-256 digest of the published encrypted file.
    pub(crate) sha256: String,
}

impl Registered {
    /// Whether this entry can describe a backup this application published: a backup file name
    /// inside the folder and a creation time from 1970 to the end of year 9999.
    fn is_safe(&self) -> bool {
        is_backup_name(&self.name) && (0..=LATEST_CREATION_TIME).contains(&self.created_at)
    }
}

/// A validated backup available in the chosen folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    /// File name inside the backup folder.
    pub name: String,
    /// Unix seconds.
    pub created_at: i64,
    pub size_bytes: u64,
}

/// Lists the registered validated backups whose file still exists in `folder`, newest first.
///
/// A folder without a registry, including a folder that is currently unavailable, has no
/// validated backups. A damaged registry, one with a newer registry version, or anything but a
/// regular file of at most 1 MiB in its place, is [`Error::BackupRegistry`]; a registry the
/// folder does not let this app read is [`Error::BackupFolder`]. Entries with an unsafe name or
/// a creation time outside 1970 to 9999 are not listed.
pub fn list_backups(folder: &Path) -> Result<Vec<BackupRecord>, Error> {
    let mut backups = read(folder)?;
    sort_newest_first(&mut backups);
    Ok(backups
        .into_iter()
        .filter(Registered::is_safe)
        .filter_map(|backup| {
            let metadata = fs::symlink_metadata(folder.join(&backup.name)).ok()?;
            metadata.is_file().then_some(BackupRecord {
                name: backup.name,
                created_at: backup.created_at,
                size_bytes: metadata.len(),
            })
        })
        .collect())
}

/// Records a verified backup that is already published under its final name.
pub(crate) fn register(folder: &Path, backup: Registered) -> Result<(), Error> {
    let mut backups = read(folder)?;
    backups.push(backup);
    write(folder, &backups)
}

/// Keeps the [`RETAINED_BACKUPS`] newest registered backups that still exist and deletes older
/// ones. Returns `true` when something could not be pruned safely (a retention warning).
///
/// `published` names the backup just registered at `published_at` (Unix seconds). It always
/// counts first and is never deleted. Retention orders the others by creation time, which only
/// works while none of them claims to be newer than the backup just made; when one does (the
/// clock was set back, or ran ahead earlier) and pruning is due, nothing is deleted and a warning
/// is reported.
///
/// Entries whose file is gone are forgotten. Entries with an unsafe name, a creation time
/// outside 1970 to 9999, a non-regular file or a changed digest are forgotten without touching
/// the file: they are no longer backups this application manages. Nothing outside the registry
/// is ever deleted.
pub(crate) fn prune(folder: &Path, published: &str, published_at: i64) -> bool {
    let Ok(mut backups) = read(folder) else {
        return true;
    };
    sort_newest_first(&mut backups);
    if let Some(position) = backups.iter().position(|backup| backup.name == published) {
        let newest = backups.remove(position);
        backups.insert(0, newest);
    }
    let mut warning = false;
    let mut changed = false;
    let mut kept = Vec::with_capacity(backups.len());
    let mut existing = Vec::with_capacity(backups.len());
    for backup in backups {
        if !backup.is_safe() {
            (warning, changed) = (true, true);
            continue;
        }
        match fs::symlink_metadata(folder.join(&backup.name)) {
            Ok(metadata) if metadata.is_file() => existing.push(backup),
            Ok(_) => (warning, changed) = (true, true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => changed = true,
            Err(_) => {
                warning = true;
                kept.push(backup);
            }
        }
    }
    let clock_behind = existing.len() > RETAINED_BACKUPS
        && existing
            .iter()
            .any(|backup| backup.name != published && backup.created_at > published_at);
    if clock_behind {
        warning = true;
        kept.extend(existing);
    } else {
        for (position, backup) in existing.into_iter().enumerate() {
            if position < RETAINED_BACKUPS {
                kept.push(backup);
                continue;
            }
            match file_digest(&folder.join(&backup.name)) {
                Ok(digest) if digest == backup.sha256 => {
                    if fs::remove_file(folder.join(&backup.name)).is_ok() {
                        changed = true;
                    } else {
                        warning = true;
                        kept.push(backup);
                    }
                }
                Ok(_) => (warning, changed) = (true, true),
                Err(_) => {
                    warning = true;
                    kept.push(backup);
                }
            }
        }
    }
    if changed && write(folder, &kept).is_err() {
        warning = true;
    }
    warning
}

/// Whether `name` has the shape of a published backup file name, with no path components.
pub(crate) fn is_backup_name(name: &str) -> bool {
    name.len() <= 128
        && name.starts_with("ttd-")
        && name.ends_with(".ttd.age")
        && !name.contains("..")
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.')
}

/// Name of a new backup published at `created_at` (Unix seconds).
pub(crate) fn new_backup_name(created_at: i64) -> String {
    format!("ttd-{created_at}-{}.ttd.age", uuid::Uuid::new_v4())
}

/// Removes regular files left with the temporary prefix by an interrupted earlier write.
///
/// Best effort: a leftover that cannot be removed never blocks a new backup.
pub(crate) fn remove_stale_temporaries(folder: &Path) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let temporary = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(TEMPORARY_PREFIX));
        // `file_type` does not follow symbolic links, so only regular files qualify.
        if temporary && entry.file_type().is_ok_and(|kind| kind.is_file()) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Lowercase hexadecimal SHA-256 digest of a regular file in the backup folder.
///
/// Anything else in its place, such as a symbolic link to a device, is [`Error::Backup`].
pub(crate) fn file_digest(path: &Path) -> Result<String, Error> {
    let mut source = open_regular_file(path)
        .map_err(|error| backup_folder_error(&error))?
        .ok_or(Error::Backup)?;
    let mut digest = Sha256::new();
    io::copy(&mut source, &mut digest).map_err(|error| backup_folder_error(&error))?;
    Ok(format!("{:x}", digest.finalize()))
}

/// Reads the registered backups of `folder`; a folder without a registry has none.
///
/// Invalid JSON, unknown fields, another registry version, more than [`MAXIMUM_REGISTRY_BYTES`],
/// or anything but a regular file in the registry's place (a folder, a symbolic link, a named
/// pipe or a device) are [`Error::BackupRegistry`]. Any other failure to read it is
/// [`Error::BackupFolder`].
pub(crate) fn read(folder: &Path) -> Result<Vec<Registered>, Error> {
    let file = match open_regular_file(&folder.join(REGISTRY_FILE)) {
        Ok(Some(file)) => file,
        Ok(None) => return Err(Error::BackupRegistry),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err(Error::BackupFolder),
    };
    let mut bytes = Vec::new();
    file.take(MAXIMUM_REGISTRY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::BackupFolder)?;
    if bytes.len() as u64 > MAXIMUM_REGISTRY_BYTES {
        return Err(Error::BackupRegistry);
    }
    let registry: RegistryFile = parse_json_object(&bytes, Error::BackupRegistry)?;
    if registry.version != REGISTRY_VERSION {
        return Err(Error::BackupRegistry);
    }
    let mut names = HashSet::new();
    Ok(registry
        .backups
        .into_iter()
        .filter(|backup| names.insert(backup.name.clone()))
        .collect())
}

/// Replaces the registry atomically; I/O failures are classified by [`backup_folder_error`].
fn write(folder: &Path, backups: &[Registered]) -> Result<(), Error> {
    let registry = RegistryFile {
        version: REGISTRY_VERSION,
        backups: backups.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&registry).map_err(|_| Error::Backup)?;
    write_atomically(&folder.join(REGISTRY_FILE), &bytes, backup_folder_error)
}

fn sort_newest_first(backups: &mut [Registered]) {
    backups.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.name.cmp(&a.name))
    });
}
