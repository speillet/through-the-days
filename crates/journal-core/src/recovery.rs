//! Encrypted backup publication and safe restore. The format is documented in
//! `docs/backup-format.md`.

use crate::{
    Entry, Error, Journal, Preferences,
    fsutil::{TEMPORARY_PREFIX, sync_directory},
    registry::{self, Registered},
    schema::{self, SCHEMA_VERSION},
    store::configure,
};
use age::{Decryptor, Encryptor, secrecy::SecretString};
use rusqlite::{Connection, backup::Backup};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use zeroize::Zeroizing;

/// Identifies a Through the Days backup inside the decrypted payload.
const MAGIC: &[u8] = b"THROUGH-THE-DAYS\0BACKUP\0";
/// Version of the plaintext layout that follows [`MAGIC`].
const FORMAT_VERSION: u8 = 1;
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";
const MINIMUM_PASSPHRASE_CHARACTERS: usize = 12;
/// Upper bound for a decrypted journal image, matching SQLite's in-memory database limit.
const MAXIMUM_IMAGE_BYTES: u64 = 1 << 30;

/// A backup that was verified, published and registered.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: PathBuf,
    pub created_at: i64,
    /// Pruning older backups could not complete safely; no unverified file was deleted.
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
    /// staged in-memory copy with the migration steps, then validated, before anything is copied
    /// into the live journal. Any failure leaves the live journal unchanged.
    pub fn restore_from(&mut self, path: &Path, passphrase: &str) -> Result<(), Error> {
        let staged = {
            let plaintext = decrypt(path, passphrase).map_err(|_| Error::Restore)?;
            staged_journal(&plaintext).map_err(|_| Error::Restore)?
        };
        // The backup API commits the whole copy in one destination transaction or rolls it back.
        Backup::new(&staged, &mut self.connection)
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

/// Encrypts a consistent snapshot of `source` into `folder` and reports success only after the
/// file was decrypted and validated again, published under its final name and registered.
pub(crate) fn publish_snapshot(
    source: &Connection,
    folder: &Path,
    passphrase: &str,
    now: i64,
) -> Result<BackupInfo, Error> {
    validate_passphrase(passphrase)?;
    if !folder.is_dir() {
        return Err(Error::Backup);
    }
    registry::remove_stale_temporaries(folder);
    let plaintext = backup_plaintext(source)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(TEMPORARY_PREFIX)
        .tempfile_in(folder)
        .map_err(|_| Error::Backup)?;
    encrypt_into(temporary.as_file_mut(), &plaintext, passphrase)?;
    verify(temporary.path(), passphrase, &plaintext).map_err(|_| Error::BackupValidation)?;
    let sha256 = registry::file_digest(temporary.path())?;
    let name = registry::new_backup_name(now);
    let path = folder.join(&name);
    temporary
        .persist_noclobber(&path)
        .map_err(|_| Error::Backup)?;
    let registered = sync_directory(folder)
        .map_err(|_| Error::Backup)
        .and_then(|()| {
            registry::register(
                folder,
                Registered {
                    name,
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
    let retention_warning = registry::prune(folder);
    Ok(BackupInfo {
        path,
        created_at: now,
        retention_warning,
    })
}

/// The decrypted payload: magic, format version, then a consistent SQLite database image.
fn backup_plaintext(source: &Connection) -> Result<Zeroizing<Vec<u8>>, Error> {
    let mut snapshot = Connection::open_in_memory()?;
    // The backup API copies one consistent read transaction, coordinating with the WAL.
    Backup::new(source, &mut snapshot)?.run_to_completion(256, Duration::ZERO, None)?;
    // Rebuilding drops free pages, so content deleted from the journal does not travel with it.
    snapshot.execute_batch("VACUUM;")?;
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
        .map_err(|_| Error::Backup)?;
    writer.write_all(plaintext).map_err(|_| Error::Backup)?;
    writer.finish().map_err(|_| Error::Backup)?;
    file.sync_all().map_err(|_| Error::Backup)
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
    let identity = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
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
/// exactly as a restore requires. Older supported versions are upgraded in this staged copy.
fn staged_journal(plaintext: &[u8]) -> Result<Connection, Error> {
    let image = match plaintext.strip_prefix(MAGIC).and_then(<[u8]>::split_first) {
        Some((&FORMAT_VERSION, image)) => image,
        _ => return Err(Error::Restore),
    };
    if image.len() < 100 || !image.starts_with(SQLITE_HEADER) {
        return Err(Error::Restore);
    }
    let mut bytes = Zeroizing::new(image.to_vec());
    normalise_file_format(&mut bytes);
    let mut staged = Connection::open_in_memory()?;
    staged.deserialize_read_exact("main", bytes.as_slice(), bytes.len(), false)?;
    // Defensive settings for a database file that arrives from outside the application.
    staged.execute_batch("PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON;")?;
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
    validate_content(&staged)?;
    Ok(staged)
}

/// Integrity and exact schema objects, before anything runs on the staged database.
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

/// Every entry and preference must satisfy the rules that saving enforces.
fn validate_content(connection: &Connection) -> Result<(), Error> {
    if schema::user_version(connection)? != SCHEMA_VERSION {
        return Err(Error::Restore);
    }
    let mut query = connection
        .prepare("SELECT id,entry_date,slot,revision,payload,trashed_at FROM journal_entries")?;
    let rows = query.query_map([], |row| {
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
        let (id, date, slot, revision, payload, _trashed_at) = row?;
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
    }
    let duplicate_slot: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE trashed_at IS NULL
         GROUP BY entry_date,slot HAVING count(*)>1)",
        [],
        |row| row.get(0),
    )?;
    if duplicate_slot {
        return Err(Error::Restore);
    }
    let mut preferences =
        connection.prepare("SELECT value FROM preferences WHERE key='display'")?;
    for value in preferences.query_map([], |row| row.get::<_, String>(0))? {
        serde_json::from_str::<Preferences>(&value?)?;
    }
    Ok(())
}
