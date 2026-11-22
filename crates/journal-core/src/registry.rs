//! The registry of validated backups kept in the chosen backup folder.
//!
//! Only files listed here were verified by this application after encryption. Listing and
//! pruning trust nothing else in the folder, and pruning deletes a file only when its name is a
//! backup name and its SHA-256 digest still matches the registered one.

use crate::{
    Error,
    fsutil::{TEMPORARY_PREFIX, parse_json_object, write_atomically},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

/// File name of the registry inside the backup folder.
pub(crate) const REGISTRY_FILE: &str = ".through-the-days-backups.json";
const REGISTRY_VERSION: u32 = 1;
/// Number of newest validated backups kept by pruning (D-009).
pub(crate) const RETAINED_BACKUPS: usize = 30;

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
/// validated backups. An unreadable or unrecognised registry is [`Error::Backup`].
pub fn list_backups(folder: &Path) -> Result<Vec<BackupRecord>, Error> {
    let mut backups = read(folder)?;
    sort_newest_first(&mut backups);
    Ok(backups
        .into_iter()
        .filter(|backup| is_backup_name(&backup.name))
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
/// Entries whose file is gone are forgotten. Entries with an unsafe name, a non-regular file or
/// a changed digest are forgotten without touching the file: they are no longer backups this
/// application manages. Nothing outside the registry is ever deleted.
pub(crate) fn prune(folder: &Path) -> bool {
    let Ok(mut backups) = read(folder) else {
        return true;
    };
    sort_newest_first(&mut backups);
    let mut warning = false;
    let mut changed = false;
    let mut retained = 0;
    let mut kept = Vec::with_capacity(backups.len());
    for backup in backups {
        if !is_backup_name(&backup.name) {
            (warning, changed) = (true, true);
            continue;
        }
        let path = folder.join(&backup.name);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() => {}
            Ok(_) => {
                (warning, changed) = (true, true);
                continue;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                changed = true;
                continue;
            }
            Err(_) => {
                warning = true;
                kept.push(backup);
                continue;
            }
        }
        if retained < RETAINED_BACKUPS {
            retained += 1;
            kept.push(backup);
            continue;
        }
        match file_digest(&path) {
            Ok(digest) if digest == backup.sha256 => {
                if fs::remove_file(&path).is_ok() {
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

/// Lowercase hexadecimal SHA-256 digest of a file.
pub(crate) fn file_digest(path: &Path) -> Result<String, Error> {
    let mut source = File::open(path).map_err(|_| Error::Backup)?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let length = source.read(&mut buffer).map_err(|_| Error::Backup)?;
        if length == 0 {
            break;
        }
        digest.update(&buffer[..length]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn read(folder: &Path) -> Result<Vec<Registered>, Error> {
    let bytes = match fs::read(folder.join(REGISTRY_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err(Error::Backup),
    };
    let registry: RegistryFile = parse_json_object(&bytes, Error::Backup)?;
    if registry.version != REGISTRY_VERSION {
        return Err(Error::Backup);
    }
    let mut names = HashSet::new();
    Ok(registry
        .backups
        .into_iter()
        .filter(|backup| names.insert(backup.name.clone()))
        .collect())
}

fn write(folder: &Path, backups: &[Registered]) -> Result<(), Error> {
    let registry = RegistryFile {
        version: REGISTRY_VERSION,
        backups: backups.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&registry).map_err(|_| Error::Backup)?;
    write_atomically(&folder.join(REGISTRY_FILE), &bytes, Error::Backup)
}

fn sort_newest_first(backups: &mut [Registered]) {
    backups.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.name.cmp(&a.name))
    });
}
