use crate::{Entry, Error, Journal, store::SCHEMA_VERSION};
use age::{Decryptor, Encryptor, secrecy::SecretString};
use rusqlite::{Connection, backup::Backup};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::{self, File}, io::{Read, Write}, path::{Path, PathBuf}, time::Duration};
use zeroize::Zeroizing;

const HEADER: &[u8] = b"THROUGH-THE-DAYS\0BACKUP\0\x01";
const REGISTRY: &str = ".through-the-days-backups.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupPlan {
    pub folder: Option<PathBuf>,
    pub last_success_date: Option<String>,
    pub last_success_at: Option<i64>,
    pub remember: bool,
    pub retention_warning: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DailyBackup { NeedsFolder, NeedsPassphrase, NotDue, Saved }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo { pub path: PathBuf, pub created_at: i64, pub retention_warning: bool }

#[derive(Clone, Serialize, Deserialize)]
struct ValidatedBackup { name: String, digest: String, created_at: i64 }

impl Journal {
    pub fn backup_if_due(&self, plan: &mut BackupPlan, passphrase: Option<&str>, now: chrono::DateTime<chrono::Utc>, preferences: &crate::Preferences) -> Result<DailyBackup, Error> {
        let date = preferences.journal_date(now)?;
        if plan.last_success_date.as_ref() == Some(&date) { return Ok(DailyBackup::NotDue); }
        let Some(folder) = &plan.folder else { return Ok(DailyBackup::NeedsFolder); };
        let Some(passphrase) = passphrase else { return Ok(DailyBackup::NeedsPassphrase); };
        let saved = self.backup_to(folder, passphrase, now.timestamp())?;
        plan.last_success_date = Some(date);
        plan.last_success_at = Some(now.timestamp());
        plan.retention_warning = saved.retention_warning;
        Ok(DailyBackup::Saved)
    }

    pub fn backup_to(&self, folder: &Path, passphrase: &str, now: i64) -> Result<BackupInfo, Error> {
        publish_snapshot(&self.connection, folder, passphrase, now)
    }

    pub fn restore_from(&mut self, path: &Path, passphrase: &str) -> Result<(), Error> {
        let staged = decrypt_snapshot(path, passphrase)?;
        validate_snapshot(&staged, SCHEMA_VERSION).map_err(|_| Error::Restore)?;
        Backup::new(&staged, &mut self.connection)
            .and_then(|b| b.run_to_completion(256, Duration::ZERO, None)).map_err(|_| Error::Restore)?;
        self.connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
        Ok(())
    }
}

pub(crate) fn publish_snapshot(source: &Connection, folder: &Path, passphrase: &str, now: i64) -> Result<BackupInfo, Error> {
    if passphrase.chars().count() < 12 { return Err(Error::Passphrase); }
    if !folder.is_dir() { return Err(Error::Backup); }
    let mut snapshot = Connection::open_in_memory()?;
    Backup::new(source, &mut snapshot)?.run_to_completion(256, Duration::ZERO, None)?;
    snapshot.execute_batch("PRAGMA journal_mode=MEMORY;")?;
    let mut data = Zeroizing::new(snapshot.serialize("main")?.to_vec());
    if data.len() < 100 || !data.starts_with(b"SQLite format 3\0") { return Err(Error::BackupValidation); }
    // SQLite documents this normalisation for deserialising a coherent WAL snapshot.
    // https://www.sqlite.org/c3ref/deserialize.html
    data[18] = 1;
    data[19] = 1;
    let mut output = tempfile::Builder::new().prefix(".ttd-incomplete-").tempfile_in(folder).map_err(|_| Error::Backup)?;
    let encryptor = Encryptor::with_user_passphrase(SecretString::from(passphrase.to_owned()));
    let mut writer = encryptor.wrap_output(output.as_file_mut()).map_err(|_| Error::Backup)?;
    writer.write_all(HEADER).map_err(|_| Error::Backup)?;
    writer.write_all(&data).map_err(|_| Error::Backup)?;
    writer.finish().map_err(|_| Error::Backup)?;
    output.as_file_mut().flush().map_err(|_| Error::Backup)?;
    output.as_file().sync_all().map_err(|_| Error::Backup)?;
    let version: u32 = snapshot.pragma_query_value(None, "user_version", |r| r.get(0))?;
    let verified = decrypt_snapshot(output.path(), passphrase)?;
    validate_snapshot(&verified, version).map_err(|_| Error::BackupValidation)?;
    let name = format!("ttd-{now}-{}.ttd.age", uuid::Uuid::new_v4());
    let path = folder.join(&name);
    output.persist_noclobber(&path).map_err(|_| Error::Backup)?;
    File::open(folder).and_then(|f| f.sync_all()).map_err(|_| Error::Backup)?;
    let mut registry = read_registry(folder)?;
    registry.push(ValidatedBackup { name, digest: file_digest(&path)?, created_at: now });
    write_registry(folder, &registry)?;
    let retention_warning = prune_validated(folder, &mut registry).is_err();
    Ok(BackupInfo { path, created_at: now, retention_warning })
}

fn decrypt_snapshot(path: &Path, passphrase: &str) -> Result<Connection, Error> {
    let file = File::open(path).map_err(|_| Error::Restore)?;
    let decryptor = Decryptor::new(std::io::BufReader::new(file)).map_err(|_| Error::Restore)?;
    let identity = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
    let mut reader = decryptor.decrypt(std::iter::once(&identity as &dyn age::Identity)).map_err(|_| Error::Restore)?;
    let mut plaintext = Zeroizing::new(Vec::new());
    reader.read_to_end(&mut plaintext).map_err(|_| Error::Restore)?;
    if !plaintext.starts_with(HEADER) { return Err(Error::Restore); }
    let bytes = &plaintext[HEADER.len()..];
    let mut staged = Connection::open_in_memory().map_err(|_| Error::Restore)?;
    staged.deserialize_read_exact("main", bytes, bytes.len(), true).map_err(|_| Error::Restore)?;
    staged.execute_batch("PRAGMA trusted_schema=OFF;").map_err(|_| Error::Restore)?;
    Ok(staged)
}

pub(crate) fn validate_snapshot(connection: &Connection, supported_version: u32) -> Result<(), Error> {
    let version: u32 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != supported_version || !(1..=SCHEMA_VERSION).contains(&version) { return Err(Error::Restore); }
    let check: String = connection.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if check != "ok" { return Err(Error::Restore); }
    let mut query = connection.prepare("SELECT id,entry_date,slot,revision,payload FROM journal_entries")?;
    let rows = query.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,u32>(3)?,r.get::<_,String>(4)?)))?;
    for row in rows {
        let (id,date,slot,revision,payload) = row?;
        let entry: Entry = serde_json::from_str(&payload)?;
        entry.validate()?;
        if entry.id != id || entry.date != date || entry.slot.as_str() != slot || entry.revision != revision || (entry.complete && !entry.can_complete()) { return Err(Error::Restore); }
    }
    Ok(())
}

fn read_registry(folder: &Path) -> Result<Vec<ValidatedBackup>, Error> {
    match fs::read(folder.join(REGISTRY)) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| Error::Backup),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err(Error::Backup),
    }
}

fn write_registry(folder: &Path, registry: &[ValidatedBackup]) -> Result<(), Error> {
    let mut file = tempfile::NamedTempFile::new_in(folder).map_err(|_| Error::Backup)?;
    serde_json::to_writer(file.as_file_mut(), registry).map_err(|_| Error::Backup)?;
    file.as_file().sync_all().map_err(|_| Error::Backup)?;
    file.persist(folder.join(REGISTRY)).map_err(|_| Error::Backup)?;
    File::open(folder).and_then(|f| f.sync_all()).map_err(|_| Error::Backup)?;
    Ok(())
}

fn file_digest(path: &Path) -> Result<String, Error> {
    let mut source = File::open(path).map_err(|_| Error::Backup)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let length = source.read(&mut buffer).map_err(|_| Error::Backup)?;
        if length == 0 { break; }
        digest.update(&buffer[..length]);
    }
    Ok(format!("{:x}",digest.finalize()))
}

fn prune_validated(folder: &Path, registry: &mut Vec<ValidatedBackup>) -> Result<(), Error> {
    registry.sort_by_key(|item| item.created_at);
    while registry.len() > 30 {
        let item = &registry[0];
        if Path::new(&item.name).file_name().and_then(|n| n.to_str()) != Some(&item.name) || !item.name.starts_with("ttd-") || !item.name.ends_with(".ttd.age") { return Err(Error::Backup); }
        let path = folder.join(&item.name);
        if path.exists() {
            if file_digest(&path)? != item.digest { return Err(Error::Backup); }
            fs::remove_file(&path).map_err(|_| Error::Backup)?;
        }
        registry.remove(0);
        write_registry(folder, registry)?;
    }
    Ok(())
}
