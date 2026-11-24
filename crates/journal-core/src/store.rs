use crate::{
    Entry, Error,
    model::parse_date,
    recovery::{publish_snapshot, validate_passphrase},
    schema::{self, Stored},
};
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior, params,
};
use serde::Serialize;
use std::{ffi::OsString, fs, io, path::Path, time::Duration};

/// Trashed entries stay restorable for 30 days of 24 hours from their deletion.
const TRASH_RETENTION_SECONDS: i64 = 30 * 86_400;
/// How long a journal operation waits for another connection's lock before failing.
const BUSY_TIMEOUT: Duration = Duration::from_secs(3);

/// A deleted entry kept in local trash until `expires_at` (Unix seconds).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub entry: Entry,
    pub deleted_at: i64,
    pub expires_at: i64,
}

/// The local journal authority. Callers never issue SQL or coordinate partial saves.
pub struct Journal {
    pub(crate) connection: Connection,
}

impl Journal {
    /// Opens the journal at `path`, creating the current schema when nothing is stored there.
    ///
    /// An older supported journal returns [`Error::MigrationRequired`], a newer or foreign
    /// database [`Error::Unsupported`], and a file whose header or schema cannot be read
    /// [`Error::Damaged`]; all are detected read-only and left unchanged.
    pub fn open(path: &Path) -> Result<Self, Error> {
        if let Some(refusal) = schema::inspect(path)?.refusal() {
            return Err(refusal);
        }
        let connection = Connection::open(path)?;
        connection.busy_timeout(BUSY_TIMEOUT)?;
        schema::initialise(&connection)?;
        configure(&connection)?;
        Ok(Self { connection })
    }

    /// Upgrades an older supported journal after publishing an encrypted pre-migration backup.
    ///
    /// Nothing is changed unless that backup was verified, published and registered in `folder`.
    /// A journal that is already current, or a path holding nothing, is simply opened.
    pub fn migrate_with_backup(
        path: &Path,
        folder: &Path,
        passphrase: &str,
        now: i64,
    ) -> Result<Self, Error> {
        let from = match schema::inspect(path)? {
            Stored::Database {
                version,
                journal: true,
            } if schema::is_upgradable(version) => version,
            stored => match stored.refusal() {
                None => return Self::open(path),
                Some(refusal) => return Err(refusal),
            },
        };
        validate_passphrase(passphrase)?;
        let mut connection = open_for_upgrade(path)?;
        let before = data_version(&connection)?;
        if schema::user_version(&connection)? != from {
            return Err(Error::Conflict);
        }
        publish_snapshot(&connection, folder, passphrase, now)?;
        {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            // Another writer between the snapshot and the upgrade would leave it unprotected.
            if data_version(&transaction)? != before {
                return Err(Error::Conflict);
            }
            schema::upgrade(&transaction, from)?;
            transaction.commit()?;
        }
        drop(connection);
        Self::open(path)
    }

    /// Commits a complete aggregate before returning its acknowledged revision.
    ///
    /// The input revision must match the stored one (0 for a new entry); the result carries the
    /// next revision. A completed entry whose edit removes its writing, mood or energy returns to
    /// draft; an explicit completion request that does not satisfy them is refused.
    pub fn save(&self, mut entry: Entry) -> Result<Entry, Error> {
        entry.validate()?;
        let transaction = self.write_transaction()?;
        let trashed: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE id=?1 AND trashed_at IS NOT NULL)",
            [&entry.id],
            |row| row.get(0),
        )?;
        if trashed {
            return Err(Error::NotFound);
        }
        let existing: Option<String> = transaction
            .query_row(
                "SELECT payload FROM journal_entries WHERE id=?1",
                [&entry.id],
                |row| row.get(0),
            )
            .optional()?;
        let existing: Option<Entry> = existing
            .map(|payload| serde_json::from_str(&payload))
            .transpose()?;
        if existing.as_ref().map_or(0, |stored| stored.revision) != entry.revision {
            return Err(Error::Conflict);
        }
        if entry.complete && !entry.can_complete() {
            if existing.as_ref().is_some_and(|stored| stored.complete) {
                entry.complete = false;
            } else {
                return Err(Error::Completion);
            }
        }
        let occupied: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries
             WHERE entry_date=?1 AND slot=?2 AND id<>?3 AND trashed_at IS NULL)",
            params![entry.date, entry.slot.as_str(), entry.id],
            |row| row.get(0),
        )?;
        if occupied {
            return Err(Error::Occupied);
        }
        entry.revision = entry.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute(
            "INSERT INTO journal_entries(id,entry_date,slot,revision,payload) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(id) DO UPDATE SET entry_date=excluded.entry_date,slot=excluded.slot,
             revision=excluded.revision,payload=excluded.payload",
            params![
                entry.id,
                entry.date,
                entry.slot.as_str(),
                entry.revision,
                serde_json::to_string(&entry)?
            ],
        )?;
        transaction.commit()?;
        Ok(entry)
    }

    /// Returns an active entry.
    pub fn get(&self, id: &str) -> Result<Entry, Error> {
        let payload: String = self
            .connection
            .query_row(
                "SELECT payload FROM journal_entries WHERE id=?1 AND trashed_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        Ok(serde_json::from_str(&payload)?)
    }

    /// Returns active entries, newest journal date first and Morning before Evening on a date.
    pub fn list(&self) -> Result<Vec<Entry>, Error> {
        self.entries(
            "SELECT payload FROM journal_entries WHERE trashed_at IS NULL
             ORDER BY entry_date DESC, CASE slot WHEN 'morning' THEN 0 ELSE 1 END",
            [],
        )
    }

    /// Returns the active entries of one journal date, Morning before Evening.
    pub fn entries_on(&self, date: &str) -> Result<Vec<Entry>, Error> {
        parse_date(date)?;
        self.entries(
            "SELECT payload FROM journal_entries WHERE entry_date=?1 AND trashed_at IS NULL
             ORDER BY CASE slot WHEN 'morning' THEN 0 ELSE 1 END",
            [date],
        )
    }

    /// Moves an active entry at `revision` to trash at `now` (Unix seconds).
    pub fn trash(&self, id: &str, revision: u32, now: i64) -> Result<(), Error> {
        let changed = self.connection.execute(
            "UPDATE journal_entries SET trashed_at=?1 WHERE id=?2 AND revision=?3 AND trashed_at IS NULL",
            params![now, id, revision],
        )?;
        if changed == 1 {
            return Ok(());
        }
        let active: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE id=?1 AND trashed_at IS NULL)",
            [id],
            |row| row.get(0),
        )?;
        Err(if active {
            Error::Conflict
        } else {
            Error::NotFound
        })
    }

    /// Returns trashed entries, most recently deleted first.
    pub fn trash_items(&self) -> Result<Vec<TrashItem>, Error> {
        let mut query = self.connection.prepare(
            "SELECT payload,trashed_at FROM journal_entries
             WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC",
        )?;
        query
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .map(|row| {
                let (payload, deleted_at) = row?;
                Ok(TrashItem {
                    entry: serde_json::from_str(&payload)?,
                    deleted_at,
                    expires_at: deleted_at.saturating_add(TRASH_RETENTION_SECONDS),
                })
            })
            .collect()
    }

    /// Returns a trashed entry to its date and slot when that slot is free.
    ///
    /// An entry whose 30-day retention ended at or before `now` (Unix seconds) is no longer
    /// restorable and reports [`Error::NotFound`], even before a purge removes it.
    pub fn restore(&self, id: &str, now: i64) -> Result<Entry, Error> {
        let transaction = self.write_transaction()?;
        let payload: String = transaction
            .query_row(
                "SELECT payload FROM journal_entries
                 WHERE id=?1 AND trashed_at IS NOT NULL AND trashed_at>?2",
                params![id, now.saturating_sub(TRASH_RETENTION_SECONDS)],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        let mut entry: Entry = serde_json::from_str(&payload)?;
        let occupied: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries
             WHERE entry_date=?1 AND slot=?2 AND trashed_at IS NULL)",
            params![entry.date, entry.slot.as_str()],
            |row| row.get(0),
        )?;
        if occupied {
            return Err(Error::Occupied);
        }
        entry.revision = entry.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute(
            "UPDATE journal_entries SET trashed_at=NULL,revision=?1,payload=?2 WHERE id=?3",
            params![entry.revision, serde_json::to_string(&entry)?, id],
        )?;
        transaction.commit()?;
        Ok(entry)
    }

    /// Removes a trashed entry from the live journal. Earlier backups may still contain it.
    pub fn permanently_delete(&self, id: &str) -> Result<(), Error> {
        let deleted = self.connection.execute(
            "DELETE FROM journal_entries WHERE id=?1 AND trashed_at IS NOT NULL",
            [id],
        )?;
        if deleted != 1 {
            return Err(Error::NotFound);
        }
        Ok(())
    }

    /// Removes trashed entries whose 30-day retention ended at or before `now`.
    pub fn purge_expired(&self, now: i64) -> Result<(), Error> {
        self.connection.execute(
            "DELETE FROM journal_entries WHERE trashed_at IS NOT NULL AND trashed_at<=?1",
            [now.saturating_sub(TRASH_RETENTION_SECONDS)],
        )?;
        Ok(())
    }

    fn entries(&self, sql: &str, parameters: impl rusqlite::Params) -> Result<Vec<Entry>, Error> {
        let mut query = self.connection.prepare(sql)?;
        query
            .query_map(parameters, |row| row.get::<_, String>(0))?
            .map(|payload| Ok(serde_json::from_str(&payload?)?))
            .collect()
    }

    /// Starts a transaction that reads before it writes, holding the write lock from the start.
    ///
    /// While another connection writes, SQLite fails at once rather than turn a read transaction
    /// into a write transaction, and a read that another connection has since overtaken can never
    /// be written. Taking the lock first waits for it like any other, for up to [`BUSY_TIMEOUT`].
    pub(crate) fn write_transaction(&self) -> Result<Transaction<'_>, Error> {
        Ok(Transaction::new_unchecked(
            &self.connection,
            TransactionBehavior::Immediate,
        )?)
    }
}

/// Removes the journal database at `path` with its `-wal`, `-shm` and `-journal` companions.
///
/// Missing files are fine. Companions are removed first: a write-ahead log left beside a new
/// database could otherwise bring erased pages back. Drop the [`Journal`] before calling this.
pub fn erase_journal_files(path: &Path) -> Result<(), Error> {
    for suffix in ["-wal", "-shm", "-journal", ""] {
        let mut name = OsString::from(path.as_os_str());
        name.push(suffix);
        match fs::remove_file(&name) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(Error::Storage),
        }
    }
    Ok(())
}

/// Commits that survive power loss, not only a crash of the app.
///
/// On macOS a plain `fsync` leaves recent writes in the drive's cache; SQLite issues
/// `F_FULLFSYNC` for commits and checkpoints only with these settings. Elsewhere they change
/// nothing. They apply to one connection and never change the database file.
const DURABLE_COMMITS: &str =
    "PRAGMA synchronous=FULL; PRAGMA fullfsync=ON; PRAGMA checkpoint_fullfsync=ON;";

/// Connection settings for the live journal: durable commits and zeroed deleted content.
pub(crate) fn configure(connection: &Connection) -> Result<(), Error> {
    connection.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;",
    )?;
    connection.execute_batch(DURABLE_COMMITS)?;
    Ok(())
}

/// The connection that snapshots and then upgrades an older journal.
///
/// It keeps the stored journal mode, so the file stays byte-for-byte unchanged until the upgrade
/// commits, but that commit is flushed like any other.
fn open_for_upgrade(path: &Path) -> Result<Connection, Error> {
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(path, flags)?;
    connection.busy_timeout(BUSY_TIMEOUT)?;
    connection.execute_batch(DURABLE_COMMITS)?;
    Ok(connection)
}

fn data_version(connection: &Connection) -> Result<i64, Error> {
    Ok(connection.pragma_query_value(None, "data_version", |row| row.get(0))?)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::{Journal, open_for_upgrade};
    use rusqlite::Connection;

    #[allow(dead_code, reason = "the shared fixtures serve several test crates")]
    mod fixtures {
        include!("../tests/common/fixtures.rs");
    }

    fn flush_settings(connection: &Connection) -> (i64, i64, i64) {
        let value = |name: &str| -> i64 {
            connection
                .pragma_query_value(None, name, |row| row.get(0))
                .unwrap()
        };
        (
            value("synchronous"),
            value("fullfsync"),
            value("checkpoint_fullfsync"),
        )
    }

    /// local-persistence — Atomic acknowledged revisions / Crash after saved acknowledgment: the
    /// live journal asks for full flushes, so an acknowledged commit also survives power loss.
    #[test]
    fn journal_connections_request_full_flushes_for_commits_and_checkpoints() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("journal.sqlite");
        let mut journal = Journal::open(&path).unwrap();
        assert_eq!(flush_settings(&journal.connection), (2, 1, 1));

        let folder = directory.path().join("backups");
        std::fs::create_dir(&folder).unwrap();
        let passphrase = "synthetic unit-test passphrase";
        let backup = journal
            .backup_to(&folder, passphrase, 1_795_363_200)
            .unwrap();
        journal.restore_from(&backup.path, passphrase).unwrap();
        assert_eq!(flush_settings(&journal.connection), (2, 1, 1));
    }

    /// local-persistence — Safe migrations: the upgrade commit is flushed like any other, without
    /// changing the older journal before its pre-migration backup.
    #[test]
    fn the_upgrade_connection_requests_full_flushes_without_changing_the_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("previous.sqlite");
        let previous = Connection::open(&path).unwrap();
        previous.execute_batch(fixtures::V1_SCHEMA).unwrap();
        previous
            .execute(
                fixtures::V1_INSERT_ENTRY,
                [fixtures::V1_ENTRY_ID, fixtures::V1_ENTRY_PAYLOAD],
            )
            .unwrap();
        drop(previous);
        let original = std::fs::read(&path).unwrap();
        let connection = open_for_upgrade(&path).unwrap();
        assert_eq!(flush_settings(&connection), (2, 1, 1));
        drop(connection);
        assert_eq!(std::fs::read(&path).unwrap(), original);
    }
}
