//! Encrypted backup publication and safe restore. The format is documented in
//! `docs/backup-format.md`.

use crate::{
    Entry, Error, Journal, Preferences,
    fsutil::{TEMPORARY_PREFIX, backup_folder_error, sync_directory},
    registry::{self, Registered},
    schema::{self, SCHEMA_VERSION},
    store::configure,
};
use age::{Decryptor, Encryptor, secrecy::SecretString};
use rusqlite::{Connection, backup::Backup, params};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{self, BufReader, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tempfile::{NamedTempFile, PersistError};
use zeroize::Zeroizing;

/// Identifies a Through the Days backup inside the decrypted payload.
const MAGIC: &[u8] = b"THROUGH-THE-DAYS\0BACKUP\0";
/// Version of the plaintext layout that follows [`MAGIC`].
const FORMAT_VERSION: u8 = 1;
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";
const MINIMUM_PASSPHRASE_CHARACTERS: usize = 12;
/// Upper bound for a decrypted journal image, matching SQLite's in-memory database limit.
const MAXIMUM_IMAGE_BYTES: u64 = 1 << 30;
/// Highest scrypt work factor (log2 of N) accepted when decrypting: 4 GiB of memory with r = 8.
///
/// An age header is authenticated only after scrypt has run, so this bounds the memory and time
/// a crafted file can demand. Backups calibrate about one second of work, 2^19 or 2^20 on a
/// recent Mac, and are verified with the same limit as a restore.
const MAXIMUM_WORK_FACTOR: u8 = 22;
/// Name prefix of the file a folder check writes, publishes and removes. It starts with
/// [`TEMPORARY_PREFIX`], so a leftover is removed by the next backup.
const PROBE_PREFIX: &str = ".ttd-incomplete-probe-";

/// A backup that was verified, published and registered.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: PathBuf,
    pub created_at: i64,
    /// Pruning older backups could not complete safely, or was skipped because another
    /// registered backup is newer than this one; no unverified file was deleted.
    pub retention_warning: bool,
}

/// Checks the backup passphrase rule: at least 12 characters (Unicode scalar values).
///
/// Only new backups apply it. Restoring accepts any passphrase, so a backup always stays
/// recoverable with the passphrase it was created with.
pub fn validate_passphrase(passphrase: &str) -> Result<(), Error> {
    if passphrase.chars().count() < MINIMUM_PASSPHRASE_CHARACTERS {
        return Err(Error::Passphrase);
    }
    Ok(())
}

impl Journal {
    /// Publishes an encrypted, verified backup of the current journal in `folder`.
    ///
    /// The folder and its registry are checked before the snapshot is encrypted: an unavailable
    /// folder is [`Error::BackupFolder`] and a damaged registry [`Error::BackupRegistry`].
    pub fn backup_to(
        &self,
        folder: &Path,
        passphrase: &str,
        now: i64,
    ) -> Result<BackupInfo, Error> {
        publish_snapshot(&self.connection, folder, passphrase, now)
    }

    /// Replaces the journal with a validated backup.
    ///
    /// Backups of every supported schema version are accepted: an older one is upgraded in its
    /// staged in-memory copy with the migration steps, then validated and copied into a new
    /// database with this build's schema, before anything is copied into the live journal. Any
    /// failure leaves the live journal unchanged.
    pub fn restore_from(&mut self, path: &Path, passphrase: &str) -> Result<(), Error> {
        let restored = {
            let plaintext = decrypt(path, passphrase).map_err(|_| Error::Restore)?;
            staged_journal(&plaintext).map_err(|_| Error::Restore)?
        };
        // The backup API commits the whole copy in one destination transaction or rolls it back.
        Backup::new(&restored, &mut self.connection)
            .and_then(|backup| backup.run_to_completion(256, Duration::ZERO, None))
            .map_err(|_| Error::Restore)?;
        configure(&self.connection)
    }
}

/// Checks that `path` holds a backup that [`Journal::restore_from`] would accept with
/// `passphrase`, applying the same decryption and validation, without changing any journal.
///
/// A caller that publishes a safety backup before restoring checks first, so a wrong
/// passphrase or a damaged file never publishes a backup that prunes an older one.
pub fn verify_backup(path: &Path, passphrase: &str) -> Result<(), Error> {
    let plaintext = decrypt(path, passphrase).map_err(|_| Error::Restore)?;
    staged_journal(&plaintext)
        .map(drop)
        .map_err(|_| Error::Restore)
}

/// Checks that `folder` can receive backups, without writing a backup.
///
/// A small file named `.ttd-incomplete-probe-*` is written, flushed, published under a new name
/// with the same no-replace rename as a backup (including its fallback for file systems such as
/// exFAT) and removed again. Any failure is [`Error::BackupFolder`]; nothing is left behind.
pub fn probe_backup_folder(folder: &Path) -> Result<(), Error> {
    probe_backup_folder_with(folder, exclusive_rename)
}

fn probe_backup_folder_with(
    folder: &Path,
    rename: impl FnOnce(NamedTempFile, &Path) -> Result<(), PersistError>,
) -> Result<(), Error> {
    check_folder(folder)?;
    let probe = || -> Result<(), Error> {
        let mut temporary = tempfile::Builder::new()
            .prefix(PROBE_PREFIX)
            .tempfile_in(folder)
            .map_err(|error| backup_folder_error(&error))?;
        temporary
            .write_all(b"Through the Days checks that this folder can hold backups.\n")
            .and_then(|()| temporary.as_file().sync_all())
            .map_err(|error| backup_folder_error(&error))?;
        let published = folder.join(format!("{PROBE_PREFIX}{}", uuid::Uuid::new_v4()));
        publish_no_clobber(temporary, &published, rename)?;
        let removed = fs::remove_file(&published);
        sync_directory(folder)
            .and(removed)
            .map_err(|error| backup_folder_error(&error))
    };
    probe().map_err(|_| Error::BackupFolder)
}

/// Encrypts a consistent snapshot of `source` into `folder` and reports success only after the
/// file was decrypted and validated again, published under its final name and registered.
pub(crate) fn publish_snapshot(
    source: &Connection,
    folder: &Path,
    passphrase: &str,
    now: i64,
) -> Result<BackupInfo, Error> {
    publish_snapshot_with(source, folder, passphrase, now, exclusive_rename)
}

/// [`publish_snapshot`] with the step that publishes the verified file under its final name.
fn publish_snapshot_with(
    source: &Connection,
    folder: &Path,
    passphrase: &str,
    now: i64,
    rename: impl FnOnce(NamedTempFile, &Path) -> Result<(), PersistError>,
) -> Result<BackupInfo, Error> {
    validate_passphrase(passphrase)?;
    // Cheap checks first: an unavailable folder or a damaged registry must not cost a snapshot,
    // two scrypt derivations and a written file on every attempt.
    check_folder(folder)?;
    registry::read(folder)?;
    registry::remove_stale_temporaries(folder);
    let mut temporary = tempfile::Builder::new()
        .prefix(TEMPORARY_PREFIX)
        .tempfile_in(folder)
        .map_err(|error| backup_folder_error(&error))?;
    let plaintext = backup_plaintext(source)?;
    encrypt_into(temporary.as_file_mut(), &plaintext, passphrase)?;
    verify(temporary.path(), passphrase, &plaintext).map_err(|_| Error::BackupValidation)?;
    let sha256 = registry::file_digest(temporary.path())?;
    let name = registry::new_backup_name(now);
    let path = folder.join(&name);
    publish_no_clobber(temporary, &path, rename)?;
    let registered = sync_directory(folder)
        .map_err(|error| backup_folder_error(&error))
        .and_then(|()| {
            registry::register(
                folder,
                Registered {
                    name: name.clone(),
                    created_at: now,
                    sha256,
                },
            )
        });
    if let Err(error) = registered {
        // An unregistered file is not a validated backup; do not leave it looking like one.
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    let retention_warning = registry::prune(folder, &name, now);
    Ok(BackupInfo {
        path,
        created_at: now,
        retention_warning,
    })
}

/// A backup folder must exist and be a folder.
fn check_folder(folder: &Path) -> Result<(), Error> {
    match fs::metadata(folder) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        _ => Err(Error::BackupFolder),
    }
}

/// Renames a file without ever replacing another (`renameatx_np` with `RENAME_EXCL` on macOS).
fn exclusive_rename(temporary: NamedTempFile, path: &Path) -> Result<(), PersistError> {
    temporary.persist_noclobber(path).map(drop)
}

/// Gives `temporary` its final name `path` with `rename`, never replacing an existing file.
///
/// Some file systems, such as exFAT on macOS, refuse an exclusive rename as unsupported. The
/// final name carries a new random UUID, so a plain rename is used instead once that name is
/// confirmed unused. A name that is already taken fails as [`Error::Backup`] and its file is
/// left untouched.
fn publish_no_clobber(
    temporary: NamedTempFile,
    path: &Path,
    rename: impl FnOnce(NamedTempFile, &Path) -> Result<(), PersistError>,
) -> Result<(), Error> {
    let PersistError { error, file } = match rename(temporary, path) {
        Ok(()) => return Ok(()),
        Err(failure) => failure,
    };
    if error.kind() != io::ErrorKind::Unsupported {
        return Err(backup_folder_error(&error));
    }
    match fs::symlink_metadata(path) {
        Err(missing) if missing.kind() == io::ErrorKind::NotFound => {}
        _ => return Err(Error::Backup),
    }
    file.persist(path)
        .map(drop)
        .map_err(|failure| backup_folder_error(&failure.error))
}

/// An in-memory database whose temporary storage stays in memory too.
///
/// `VACUUM`, integrity checks and upgrades otherwise spill to unlinked temporary files once a
/// journal outgrows SQLite's page cache, which would put decrypted journal content on disk.
fn memory_connection() -> Result<Connection, Error> {
    let connection = Connection::open_in_memory()?;
    connection.execute_batch("PRAGMA temp_store=MEMORY;")?;
    Ok(connection)
}

/// A consistent in-memory copy of `source`, rebuilt without free pages.
fn snapshot(source: &Connection) -> Result<Connection, Error> {
    let mut snapshot = memory_connection()?;
    // The backup API copies one consistent read transaction, coordinating with the WAL.
    Backup::new(source, &mut snapshot)?.run_to_completion(256, Duration::ZERO, None)?;
    // Rebuilding drops free pages, so content deleted from the journal does not travel with it.
    snapshot.execute_batch("VACUUM;")?;
    Ok(snapshot)
}

/// The decrypted payload: magic, format version, then a consistent SQLite database image.
fn backup_plaintext(source: &Connection) -> Result<Zeroizing<Vec<u8>>, Error> {
    let snapshot = snapshot(source)?;
    let image = snapshot.serialize("main")?;
    if image.len() < 100 || !image.starts_with(SQLITE_HEADER) {
        return Err(Error::BackupValidation);
    }
    let mut plaintext = Zeroizing::new(Vec::with_capacity(MAGIC.len() + 1 + image.len()));
    plaintext.extend_from_slice(MAGIC);
    plaintext.push(FORMAT_VERSION);
    plaintext.extend_from_slice(&image);
    normalise_file_format(&mut plaintext[MAGIC.len() + 1..]);
    Ok(plaintext)
}

/// Marks the image as a rollback-journal database so it can be deserialised.
///
/// A copy of a WAL database keeps WAL file-format bytes, which `sqlite3_deserialize` cannot open.
/// SQLite documents setting bytes 18 and 19 to 1: <https://www.sqlite.org/c3ref/deserialize.html>
fn normalise_file_format(image: &mut [u8]) {
    image[18] = 1;
    image[19] = 1;
}

fn encrypt_into(file: &mut File, plaintext: &[u8], passphrase: &str) -> Result<(), Error> {
    // age v1 with a scrypt passphrase recipient; the work factor targets about one second here.
    let encryptor = Encryptor::with_user_passphrase(SecretString::from(passphrase.to_owned()));
    let mut writer = encryptor
        .wrap_output(&mut *file)
        .map_err(|error| backup_folder_error(&error))?;
    writer
        .write_all(plaintext)
        .and_then(|()| writer.finish().map(drop))
        .and_then(|()| file.sync_all())
        .map_err(|error| backup_folder_error(&error))
}

/// Decrypts the written file and checks it restores exactly what was encrypted.
fn verify(path: &Path, passphrase: &str, expected: &[u8]) -> Result<(), Error> {
    let decrypted = decrypt(path, passphrase)?;
    if decrypted.as_slice() != expected {
        return Err(Error::BackupValidation);
    }
    staged_journal(&decrypted).map(drop)
}

fn decrypt(path: &Path, passphrase: &str) -> Result<Zeroizing<Vec<u8>>, Error> {
    let file = File::open(path).map_err(|_| Error::Restore)?;
    let length = file.metadata().map_err(|_| Error::Restore)?.len();
    let decryptor = Decryptor::new(BufReader::new(file)).map_err(|_| Error::Restore)?;
    let mut identity = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
    identity.set_max_work_factor(MAXIMUM_WORK_FACTOR);
    let reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|_| Error::Restore)?;
    let limit = MAXIMUM_IMAGE_BYTES + MAGIC.len() as u64 + 1;
    // The ciphertext is longer than its plaintext: reserving it avoids unzeroed reallocations.
    let capacity = usize::try_from(length.min(limit)).map_err(|_| Error::Restore)?;
    let mut plaintext = Zeroizing::new(Vec::with_capacity(capacity));
    reader
        .take(limit + 1)
        .read_to_end(&mut plaintext)
        .map_err(|_| Error::Restore)?;
    if plaintext.len() as u64 > limit {
        return Err(Error::Restore);
    }
    Ok(plaintext)
}

/// Loads a decrypted payload as an in-memory journal at the current schema version, validated
/// exactly as a restore requires.
///
/// The image is checked, and an older supported version upgraded, in a staged copy. Its
/// validated rows are then copied into a new database created with this build's schema, so a
/// restore installs this build's table definitions and constraints, never the backup's own.
fn staged_journal(plaintext: &[u8]) -> Result<Connection, Error> {
    let staged = staged_copy(plaintext)?;
    canonical_copy(&staged)
}

/// Deserialises the image, checks its integrity and schema objects, and upgrades an older
/// supported schema version with the shared migration steps.
fn staged_copy(plaintext: &[u8]) -> Result<Connection, Error> {
    let image = match plaintext.strip_prefix(MAGIC).and_then(<[u8]>::split_first) {
        Some((&FORMAT_VERSION, image)) => image,
        _ => return Err(Error::Restore),
    };
    if image.len() < 100 || !image.starts_with(SQLITE_HEADER) {
        return Err(Error::Restore);
    }
    let mut bytes = Zeroizing::new(image.to_vec());
    normalise_file_format(&mut bytes);
    let mut staged = memory_connection()?;
    staged.deserialize_read_exact("main", bytes.as_slice(), bytes.len(), false)?;
    // Defensive settings for a database file that arrives from outside the application.
    staged.execute_batch(
        "PRAGMA temp_store=MEMORY; PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON;",
    )?;
    check_structure(&staged)?;
    let version = schema::user_version(&staged)?;
    if version != SCHEMA_VERSION {
        if !schema::is_upgradable(version) {
            return Err(Error::Restore);
        }
        let transaction = staged.transaction()?;
        schema::upgrade(&transaction, version)?;
        transaction.commit()?;
    }
    Ok(staged)
}

/// Integrity and exact schema object names, before anything runs on the staged database.
///
/// Definitions are not compared here: [`canonical_copy`] recreates them from this build.
fn check_structure(connection: &Connection) -> Result<(), Error> {
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(Error::Restore);
    }
    let mut query = connection.prepare(
        "SELECT type,name,tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         ORDER BY type,name",
    )?;
    let objects = query
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    // Both supported versions use these names; anything else (a trigger, a view) is refused.
    let expected = [
        ("index", "active_slot", "journal_entries"),
        ("table", "journal_entries", "journal_entries"),
        ("table", "preferences", "preferences"),
    ];
    let matches = objects
        .iter()
        .map(|(kind, name, table)| (kind.as_str(), name.as_str(), table.as_str()))
        .eq(expected);
    if !matches {
        return Err(Error::Restore);
    }
    Ok(())
}

/// Copies the rows of the upgraded staged journal into a new in-memory journal created with the
/// current schema, validating each one as saving would.
///
/// The current schema's constraints (unique identifiers and preference keys, one active entry
/// per date and slot, valid slots, revisions and JSON) then apply to the copy, whatever
/// definitions the backup stored.
fn canonical_copy(staged: &Connection) -> Result<Connection, Error> {
    if schema::user_version(staged)? != SCHEMA_VERSION {
        return Err(Error::Restore);
    }
    let mut canonical = memory_connection()?;
    let transaction = canonical.transaction()?;
    schema::create_current(&transaction)?;
    copy_entries(staged, &transaction)?;
    copy_preferences(staged, &transaction)?;
    transaction.commit()?;
    Ok(canonical)
}

/// Every entry must satisfy the rules that saving enforces and match its indexed columns.
fn copy_entries(staged: &Connection, canonical: &Connection) -> Result<(), Error> {
    let mut select = staged
        .prepare("SELECT id,entry_date,slot,revision,payload,trashed_at FROM journal_entries")?;
    let mut insert = canonical.prepare(
        "INSERT INTO journal_entries(id,entry_date,slot,revision,payload,trashed_at)
         VALUES(?1,?2,?3,?4,?5,?6)",
    )?;
    let rows = select.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, u32>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<i64>>(5)?,
        ))
    })?;
    for row in rows {
        let (id, date, slot, revision, payload, trashed_at) = row?;
        let entry: Entry = serde_json::from_str(&payload)?;
        entry.validate()?;
        if entry.id != id
            || entry.date != date
            || entry.slot.as_str() != slot
            || entry.revision != revision
            || revision == 0
            || (entry.complete && !entry.can_complete())
        {
            return Err(Error::Restore);
        }
        insert.execute(params![id, date, slot, revision, payload, trashed_at])?;
    }
    Ok(())
}

/// Stored display preferences must meet the rules that saving them enforces.
fn copy_preferences(staged: &Connection, canonical: &Connection) -> Result<(), Error> {
    let mut select = staged.prepare("SELECT key,value FROM preferences")?;
    let mut insert = canonical.prepare("INSERT INTO preferences(key,value) VALUES(?1,?2)")?;
    let rows = select.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (key, value) = row?;
        if key == "display" {
            serde_json::from_str::<Preferences>(&value)?.validate()?;
        }
        insert.execute(params![key, value])?;
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::{
        PersistError, backup_plaintext, canonical_copy, probe_backup_folder_with,
        publish_snapshot_with, snapshot, staged_copy,
    };
    use crate::{Entry, Error, Journal, Slot, list_backups, registry::REGISTRY_FILE};
    use rusqlite::Connection;
    use serde_json::json;
    use std::{fs, io, path::Path};
    use tempfile::NamedTempFile;

    const PASSPHRASE: &str = "synthetic unit-test passphrase";
    const NOW: i64 = 1_795_363_200;

    fn journal_with_entry(directory: &Path) -> (Journal, Entry) {
        let journal = Journal::open(&directory.join("journal.sqlite")).unwrap();
        let mut entry = Entry::draft("2026-11-22", Slot::Evening);
        entry.document = json!({"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "Synthetic entry published on a folder without exclusive renames."}
        ]}]});
        let entry = journal.save(entry).unwrap();
        (journal, entry)
    }

    fn backup_folder(directory: &Path) -> std::path::PathBuf {
        let folder = directory.join("backups");
        fs::create_dir(&folder).unwrap();
        folder
    }

    /// What `renameatx_np(RENAME_EXCL)` reports on exFAT under macOS (errno 45, `ENOTSUP`).
    fn unsupported(temporary: NamedTempFile) -> Result<(), PersistError> {
        Err(PersistError {
            error: io::Error::from(io::ErrorKind::Unsupported),
            file: temporary,
        })
    }

    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    /// local-data-protection — Encrypted local backups before real use: a folder whose file
    /// system cannot rename exclusively (exFAT on macOS) still receives registered backups.
    #[test]
    fn a_folder_without_exclusive_renames_still_receives_registered_backups() {
        let directory = tempfile::tempdir().unwrap();
        let folder = backup_folder(directory.path());
        let (journal, entry) = journal_with_entry(directory.path());

        let info = publish_snapshot_with(
            &journal.connection,
            &folder,
            PASSPHRASE,
            NOW,
            |temporary, _| unsupported(temporary),
        )
        .unwrap();
        assert!(info.path.is_file());
        let name = info.path.file_name().unwrap().to_str().unwrap().to_owned();
        let listed = list_backups(&folder).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, name);
        assert_eq!(names_in(&folder), vec![REGISTRY_FILE.to_owned(), name]);

        let mut clean = Journal::open(&directory.path().join("clean.sqlite")).unwrap();
        clean.restore_from(&info.path, PASSPHRASE).unwrap();
        assert_eq!(clean.get(&entry.id).unwrap(), entry);
    }

    /// The fallback never replaces a file: when the final name is taken, the backup fails and
    /// that file keeps its content.
    #[test]
    fn the_rename_fallback_never_replaces_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let folder = backup_folder(directory.path());
        let (journal, _) = journal_with_entry(directory.path());
        let content = "Synthetic file that already has the backup's final name";

        let failure = publish_snapshot_with(
            &journal.connection,
            &folder,
            PASSPHRASE,
            NOW,
            |temporary, path| {
                fs::write(path, content).unwrap();
                unsupported(temporary)
            },
        )
        .unwrap_err();
        assert_eq!(failure, Error::Backup);
        let names = names_in(&folder);
        assert_eq!(names.len(), 1, "no temporary file remains: {names:?}");
        assert!(names[0].starts_with("ttd-"));
        assert_eq!(fs::read_to_string(folder.join(&names[0])).unwrap(), content);
        assert!(list_backups(&folder).unwrap().is_empty());
    }

    /// Any other rename failure is not retried: a refused rename is a folder failure.
    #[test]
    fn a_refused_rename_is_a_folder_failure_without_a_fallback() {
        let directory = tempfile::tempdir().unwrap();
        let folder = backup_folder(directory.path());
        let (journal, _) = journal_with_entry(directory.path());
        let failure = publish_snapshot_with(
            &journal.connection,
            &folder,
            PASSPHRASE,
            NOW,
            |temporary, _| {
                Err(PersistError {
                    error: io::Error::from(io::ErrorKind::PermissionDenied),
                    file: temporary,
                })
            },
        )
        .unwrap_err();
        assert_eq!(failure, Error::BackupFolder);
        assert!(names_in(&folder).is_empty());
    }

    /// local-data-protection — Interrupted backup write: a published file that cannot be
    /// registered is removed and the backup fails.
    #[test]
    fn a_published_backup_that_cannot_be_registered_is_removed() {
        let directory = tempfile::tempdir().unwrap();
        let folder = backup_folder(directory.path());
        let (journal, _) = journal_with_entry(directory.path());
        let failure = publish_snapshot_with(
            &journal.connection,
            &folder,
            PASSPHRASE,
            NOW,
            |temporary, path| {
                temporary.persist_noclobber(path)?;
                // The registry becomes unreadable between the folder check and registration.
                fs::create_dir(path.with_file_name(REGISTRY_FILE)).unwrap();
                Ok(())
            },
        )
        .unwrap_err();
        assert_eq!(failure, Error::BackupRegistry);
        assert_eq!(names_in(&folder), vec![REGISTRY_FILE.to_owned()]);
    }

    /// The folder check publishes through the same fallback and leaves nothing behind.
    #[test]
    fn the_folder_check_uses_the_rename_fallback_and_leaves_nothing_behind() {
        let directory = tempfile::tempdir().unwrap();
        let folder = backup_folder(directory.path());
        probe_backup_folder_with(&folder, |temporary, _| unsupported(temporary)).unwrap();
        assert!(names_in(&folder).is_empty());
        assert_eq!(
            probe_backup_folder_with(&folder, |temporary, path| {
                fs::write(path, "Synthetic file with the probe's name").unwrap();
                unsupported(temporary)
            }),
            Err(Error::BackupFolder)
        );
    }

    fn temp_store(connection: &Connection) -> i64 {
        connection
            .pragma_query_value(None, "temp_store", |row| row.get(0))
            .unwrap()
    }

    /// local-data-protection — Encrypted local backups before real use: snapshots, verification
    /// and restore keep decrypted content in memory, including SQLite's temporary storage.
    #[test]
    fn decrypted_copies_keep_temporary_storage_in_memory() {
        let directory = tempfile::tempdir().unwrap();
        let (journal, _) = journal_with_entry(directory.path());
        assert_eq!(temp_store(&snapshot(&journal.connection).unwrap()), 2);
        let plaintext = backup_plaintext(&journal.connection).unwrap();
        let staged = staged_copy(&plaintext).unwrap();
        assert_eq!(temp_store(&staged), 2);
        assert_eq!(temp_store(&canonical_copy(&staged).unwrap()), 2);
    }
}
