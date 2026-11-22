use crate::{Entry, Error};
use rusqlite::{Connection, OptionalExtension, params};
use std::{path::Path, time::Duration};
use serde::Serialize;

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem { pub entry: Entry, pub expires_at: i64 }

pub struct Journal {
    pub(crate) connection: Connection,
}

impl Journal {
    /// Protects an existing supported schema before the upgrade transaction starts.
    pub fn migrate_with_backup(path: &Path, folder: &Path, passphrase: &str, now: i64) -> Result<Self, Error> {
        let mut connection = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)?;
        let version: u32 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version != 1 { return Err(Error::MigrationRequired); }
        let before: u32 = connection.pragma_query_value(None, "data_version", |r| r.get(0))?;
        crate::recovery::publish_snapshot(&connection, folder, passphrase, now)?;
        {
            let transaction = connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            let after: u32 = transaction.pragma_query_value(None, "data_version", |r| r.get(0))?;
            if before != after { return Err(Error::Conflict); }
            transaction.execute_batch("ALTER TABLE journal_entries ADD COLUMN trashed_at INTEGER NULL;
                DROP INDEX active_slot;
                CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date,slot) WHERE trashed_at IS NULL;
                UPDATE journal_entries SET payload=json_set(payload,'$.progress',NULL);
                PRAGMA user_version=2;")?;
            transaction.commit()?;
        }
        drop(connection);
        Self::open(path)
    }

    /// Opens the local authority; an unknown schema never becomes an empty journal.
    pub fn open(path: &Path) -> Result<Self, Error> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(3))?;
        let version: u32 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version == 0 {
            let tables: u32 = connection.query_row("SELECT count(*) FROM sqlite_master WHERE type='table'", [], |r| r.get(0))?;
            if tables != 0 { return Err(Error::MigrationRequired); }
            connection.execute_batch("BEGIN IMMEDIATE;
                CREATE TABLE journal_entries (
                    id TEXT PRIMARY KEY,
                    entry_date TEXT NOT NULL,
                    slot TEXT NOT NULL CHECK(slot IN ('morning','evening')),
                    revision INTEGER NOT NULL CHECK(revision > 0),
                    payload TEXT NOT NULL CHECK(json_valid(payload)),
                    trashed_at INTEGER NULL
                );
                CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date, slot) WHERE trashed_at IS NULL;
                CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                PRAGMA user_version=2;
                COMMIT;")?;
        } else if version != SCHEMA_VERSION { return Err(Error::MigrationRequired); }
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
        Ok(Self { connection })
    }

    /// Commits a complete aggregate before returning its acknowledged revision.
    pub fn save(&self, mut entry: Entry) -> Result<Entry, Error> {
        entry.validate()?;
        let transaction = self.connection.unchecked_transaction()?;
        let trashed: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM journal_entries WHERE id=?1 AND trashed_at IS NOT NULL)", [&entry.id], |r| r.get(0))?;
        if trashed { return Err(Error::NotFound); }
        let existing: Option<String> = transaction.query_row(
            "SELECT payload FROM journal_entries WHERE id=?1", [&entry.id], |r| r.get(0)
        ).optional()?;
        let existing: Option<Entry> = existing.map(|p| serde_json::from_str(&p)).transpose()?;
        if existing.as_ref().map_or(0, |e| e.revision) != entry.revision { return Err(Error::Conflict); }
        if entry.complete && !entry.can_complete() {
            if existing.as_ref().is_some_and(|e| e.complete) { entry.complete = false; }
            else { return Err(Error::Completion); }
        }
        let occupied: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE entry_date=?1 AND slot=?2 AND id<>?3 AND trashed_at IS NULL)",
            params![entry.date, entry.slot.as_str(), entry.id], |r| r.get(0)
        )?;
        if occupied { return Err(Error::Occupied); }
        entry.revision = entry.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute(
            "INSERT INTO journal_entries(id,entry_date,slot,revision,payload) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(id) DO UPDATE SET entry_date=excluded.entry_date,slot=excluded.slot,revision=excluded.revision,payload=excluded.payload",
            params![entry.id, entry.date, entry.slot.as_str(), entry.revision, serde_json::to_string(&entry)?]
        )?;
        transaction.commit()?;
        Ok(entry)
    }

    pub fn get(&self, id: &str) -> Result<Entry, Error> {
        let payload: String = self.connection.query_row("SELECT payload FROM journal_entries WHERE id=?1 AND trashed_at IS NULL", [id], |r| r.get(0))
            .optional()?.ok_or(Error::NotFound)?;
        Ok(serde_json::from_str(&payload)?)
    }

    pub fn list(&self) -> Result<Vec<Entry>, Error> {
        let mut query = self.connection.prepare("SELECT payload FROM journal_entries WHERE trashed_at IS NULL ORDER BY entry_date DESC, slot DESC")?;
        query.query_map([], |r| r.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    pub fn trash(&self, id: &str, revision: u32, now: i64) -> Result<(), Error> {
        let changed = self.connection.execute("UPDATE journal_entries SET trashed_at=?1 WHERE id=?2 AND revision=?3 AND trashed_at IS NULL", params![now, id, revision])?;
        if changed != 1 { return Err(Error::Conflict); }
        Ok(())
    }

    pub fn trash_items(&self) -> Result<Vec<TrashItem>, Error> {
        let mut query = self.connection.prepare("SELECT payload,trashed_at FROM journal_entries WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC")?;
        query.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
            .map(|row| { let (payload, deleted_at) = row?; Ok(TrashItem { entry: serde_json::from_str(&payload)?, expires_at: deleted_at.saturating_add(30*86_400) }) }).collect()
    }

    pub fn restore(&self, id: &str) -> Result<Entry, Error> {
        let transaction = self.connection.unchecked_transaction()?;
        let payload: String = transaction.query_row("SELECT payload FROM journal_entries WHERE id=?1 AND trashed_at IS NOT NULL", [id], |r| r.get(0)).optional()?.ok_or(Error::NotFound)?;
        let mut entry: Entry = serde_json::from_str(&payload)?;
        let occupied: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM journal_entries WHERE entry_date=?1 AND slot=?2 AND trashed_at IS NULL)", params![entry.date, entry.slot.as_str()], |r| r.get(0))?;
        if occupied { return Err(Error::Occupied); }
        entry.revision = entry.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute("UPDATE journal_entries SET trashed_at=NULL, revision=?1,payload=?2 WHERE id=?3", params![entry.revision,serde_json::to_string(&entry)?,id])?;
        transaction.commit()?;
        Ok(entry)
    }

    pub fn permanently_delete(&self, id: &str) -> Result<(), Error> {
        if self.connection.execute("DELETE FROM journal_entries WHERE id=?1 AND trashed_at IS NOT NULL", [id])? != 1 { return Err(Error::NotFound); }
        Ok(())
    }

    pub fn purge_expired(&self, now: i64) -> Result<(), Error> {
        self.connection.execute("DELETE FROM journal_entries WHERE trashed_at IS NOT NULL AND trashed_at<=?1", [now.saturating_sub(30*86_400)])?;
        Ok(())
    }
}
