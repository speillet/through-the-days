//! Synthetic fixtures shared by the journal-core integration tests.
//!
//! Every value here is fictional. Crafted backups follow the layout documented in
//! docs/backup-format.md.

#![allow(dead_code, clippy::unwrap_used, clippy::expect_used)]

mod fixtures;

pub use fixtures::*;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

/// Passphrase of every synthetic backup.
pub const PASSPHRASE: &str = "synthetic portable backup passphrase";
/// A fixed synthetic instant (Unix seconds) on 22 November 2026.
pub const NOW: i64 = 1_795_363_200;
pub const DAY: i64 = 86_400;
/// Plaintext prefix of a backup: magic followed by the format version byte.
pub const BACKUP_MAGIC: &[u8] = b"THROUGH-THE-DAYS\0BACKUP\0";
pub const BACKUP_FORMAT_VERSION: u8 = 1;
pub const REGISTRY_FILE: &str = ".through-the-days-backups.json";

/// A one-paragraph editor document.
pub fn document(text: &str) -> Value {
    json!({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]})
}

/// A document whose deepest node sits at `depth` levels, the document node being level 1:
/// quotations nested around one paragraph of text.
pub fn nested_document(depth: usize) -> Value {
    let mut node = json!({"type": "paragraph", "content": [
        {"type": "text", "text": "Synthetic words in a deeply nested quotation."}
    ]});
    for _ in 0..depth - 3 {
        node = json!({"type": "blockquote", "content": [node]});
    }
    json!({"type": "doc", "content": [node]})
}

/// Writes a fictional schema-version-1 journal with one Morning entry and returns its id.
///
/// The schema and payload are the frozen [`V1_SCHEMA`] and [`V1_ENTRY_PAYLOAD`], never generated
/// from today's `Entry`, so a format change that breaks older journals fails the migration tests.
pub fn previous_journal(path: &Path) -> String {
    let connection = rusqlite::Connection::open(path).unwrap();
    connection.execute_batch(V1_SCHEMA).unwrap();
    connection
        .execute(
            V1_INSERT_ENTRY,
            rusqlite::params![V1_ENTRY_ID, V1_ENTRY_PAYLOAD],
        )
        .unwrap();
    V1_ENTRY_ID.to_owned()
}

/// Runs SQL against the SQLite database at `path`, creating it when needed.
pub fn execute(path: &Path, sql: &str) {
    rusqlite::Connection::open(path)
        .unwrap()
        .execute_batch(sql)
        .unwrap();
}

/// Files of `folder` whose name ends with `.age`, sorted by name.
pub fn age_files(folder: &Path) -> Vec<PathBuf> {
    let mut files: Vec<_> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "age"))
        .collect();
    files.sort();
    files
}

/// Names of every directory entry in `folder`, sorted.
pub fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

/// Whether `haystack` contains `needle`.
pub fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// The documented plaintext of a backup holding `image`.
pub fn backup_plaintext(image: &[u8]) -> Vec<u8> {
    [BACKUP_MAGIC, &[BACKUP_FORMAT_VERSION], image].concat()
}

/// Encrypts like a backup, but with a low scrypt work factor so crafted backups decrypt quickly.
/// Published backups calibrate the work factor instead.
pub fn encrypt_quickly(plaintext: &[u8], passphrase: &str) -> Vec<u8> {
    let mut recipient =
        age::scrypt::Recipient::new(age::secrecy::SecretString::from(passphrase.to_owned()));
    recipient.set_work_factor(10);
    let encryptor =
        age::Encryptor::with_recipients(std::iter::once(&recipient as &dyn age::Recipient))
            .unwrap();
    let mut output = Vec::new();
    let mut writer = encryptor.wrap_output(&mut output).unwrap();
    writer.write_all(plaintext).unwrap();
    writer.finish().unwrap();
    output
}

/// Decrypts a backup file with the age library directly and returns its plaintext.
pub fn decrypt(path: &Path, passphrase: &str) -> Vec<u8> {
    let decryptor = age::Decryptor::new(fs::File::open(path).unwrap()).unwrap();
    let identity =
        age::scrypt::Identity::new(age::secrecy::SecretString::from(passphrase.to_owned()));
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .unwrap();
    let mut plaintext = Vec::new();
    reader.read_to_end(&mut plaintext).unwrap();
    plaintext
}

/// `PRAGMA user_version` stored in an SQLite database image (big-endian at offset 60).
pub fn image_user_version(image: &[u8]) -> u32 {
    u32::from_be_bytes(image[60..64].try_into().unwrap())
}

/// One registered backup, as the registry file records it.
pub struct SeededBackup {
    pub name: String,
    pub created_at: i64,
    pub sha256: String,
}

/// Writes a synthetic file that stands in for a published backup and returns its registry record.
pub fn seed_backup(folder: &Path, created_at: i64, label: &str) -> SeededBackup {
    let name = format!("ttd-{created_at}-{}.ttd.age", uuid::Uuid::new_v4());
    let content = format!("Synthetic stand-in for an encrypted backup: {label}");
    fs::write(folder.join(&name), &content).unwrap();
    SeededBackup {
        name,
        created_at,
        sha256: sha256_hex(content.as_bytes()),
    }
}

/// Writes the registry file of `folder` with these records.
pub fn write_registry(folder: &Path, backups: &[SeededBackup]) {
    let backups: Vec<_> = backups
        .iter()
        .map(|backup| json!({"name": backup.name, "createdAt": backup.created_at, "sha256": backup.sha256}))
        .collect();
    fs::write(
        folder.join(REGISTRY_FILE),
        json!({"version": 1, "backups": backups}).to_string(),
    )
    .unwrap();
}

/// Names recorded in the registry file of `folder`.
pub fn registered_names(folder: &Path) -> Vec<String> {
    let registry: Value =
        serde_json::from_slice(&fs::read(folder.join(REGISTRY_FILE)).unwrap()).unwrap();
    registry["backups"]
        .as_array()
        .unwrap()
        .iter()
        .map(|backup| backup["name"].as_str().unwrap().to_owned())
        .collect()
}

/// Makes a directory read-only until dropped, restoring write access even if a test fails.
pub struct ReadOnlyFolder<'a>(pub &'a Path);

impl<'a> ReadOnlyFolder<'a> {
    pub fn new(folder: &'a Path) -> Self {
        set_mode(folder, 0o555);
        Self(folder)
    }
}

impl Drop for ReadOnlyFolder<'_> {
    fn drop(&mut self) {
        set_mode(self.0, 0o755);
    }
}

fn set_mode(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).unwrap();
}
