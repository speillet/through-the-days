//! Versioned journal schema: read-only detection, creation and the shared upgrade steps.

use crate::{Error, error::is_damage};
use rusqlite::{Connection, OpenFlags, Transaction, TransactionBehavior};
use std::{fs, io, path::Path};

/// Version this build writes to `PRAGMA user_version`.
pub(crate) const SCHEMA_VERSION: u32 = 2;
/// Oldest schema this build can upgrade, after an encrypted pre-migration backup.
pub(crate) const OLDEST_SUPPORTED_VERSION: u32 = 1;

const CREATE_CURRENT_SCHEMA: &str = "
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
    PRAGMA user_version=2;";

/// Version 1 kept trashed entries out of the schema and had no perceived-progress answer.
const UPGRADE_1_TO_2: &str = "
    ALTER TABLE journal_entries ADD COLUMN trashed_at INTEGER NULL;
    DROP INDEX active_slot;
    CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date,slot) WHERE trashed_at IS NULL;
    UPDATE journal_entries SET payload=json_set(payload,'$.progress',NULL);
    PRAGMA user_version=2;";

/// What a journal path holds, determined without changing it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stored {
    /// No file, an empty file, or an SQLite database without any schema: safe to initialise.
    Nothing,
    /// An SQLite database with this `user_version`; `journal` when it has the journal tables.
    Database { version: u32, journal: bool },
}

impl Stored {
    /// Why this database cannot be opened as the current journal, if it cannot.
    pub(crate) fn refusal(self) -> Option<Error> {
        match self {
            Self::Nothing
            | Self::Database {
                version: SCHEMA_VERSION,
                journal: true,
            } => None,
            Self::Database {
                version,
                journal: true,
            } if is_upgradable(version) => Some(Error::MigrationRequired),
            Self::Database { .. } => Some(Error::Unsupported),
        }
    }
}

/// Whether this build can upgrade a journal from `version` to [`SCHEMA_VERSION`].
pub(crate) fn is_upgradable(version: u32) -> bool {
    (OLDEST_SUPPORTED_VERSION..SCHEMA_VERSION).contains(&version)
}

/// Reads the schema version of the journal database at `path` without modifying it.
///
/// Returns `None` when there is nothing to migrate: the file does not exist, is empty, or is an
/// SQLite database without any schema. Any other database reports its `user_version`, including
/// `Some(0)` for a database that is not a journal. A file whose header or schema SQLite cannot
/// read is [`Error::Damaged`]; a negative version is [`Error::Unsupported`].
pub fn schema_version(path: &Path) -> Result<Option<u32>, Error> {
    Ok(match inspect(path)? {
        Stored::Nothing => None,
        Stored::Database { version, .. } => Some(version),
    })
}

/// Classifies `path` through a read-only connection, so damaged or unsupported files are never
/// changed.
pub(crate) fn inspect(path: &Path) -> Result<Stored, Error> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => return Err(Error::Unsupported),
        Ok(metadata) if metadata.len() == 0 => return Ok(Stored::Nothing),
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Stored::Nothing),
        Err(_) => return Err(Error::Storage),
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(path, flags).map_err(open_error)?;
    classify(&connection)
}

/// Creates the current schema in an empty database, or confirms an existing current journal.
///
/// The check is repeated inside an immediate transaction so a concurrent creator cannot race it.
pub(crate) fn initialise(connection: &Connection) -> Result<(), Error> {
    let transaction = Transaction::new_unchecked(connection, TransactionBehavior::Immediate)?;
    match classify(&transaction)? {
        Stored::Nothing => create_current(&transaction)?,
        stored => {
            if let Some(error) = stored.refusal() {
                return Err(error);
            }
        }
    }
    transaction.commit()?;
    Ok(())
}

/// Creates the current schema, with every constraint, in an empty database.
///
/// The caller owns the transaction. A restore also uses it, so the restored journal always has
/// this build's definitions rather than the ones stored in the backup.
pub(crate) fn create_current(connection: &Connection) -> Result<(), Error> {
    connection.execute_batch(CREATE_CURRENT_SCHEMA)?;
    Ok(())
}

/// Applies every versioned step from `from` up to [`SCHEMA_VERSION`].
///
/// The caller owns the transaction. The same steps upgrade a live journal after its
/// pre-migration backup and a staged copy of an older backup before it is validated.
pub(crate) fn upgrade(connection: &Connection, from: u32) -> Result<(), Error> {
    if from != SCHEMA_VERSION && !is_upgradable(from) {
        return Err(Error::Unsupported);
    }
    for version in from..SCHEMA_VERSION {
        let step = match version {
            1 => UPGRADE_1_TO_2,
            _ => return Err(Error::Unsupported),
        };
        connection.execute_batch(step)?;
    }
    Ok(())
}

/// Reads `PRAGMA user_version`, rejecting values that no journal uses.
pub(crate) fn user_version(connection: &Connection) -> Result<u32, Error> {
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(open_error)?;
    u32::try_from(version).map_err(|_| Error::Unsupported)
}

fn classify(connection: &Connection) -> Result<Stored, Error> {
    let version = user_version(connection)?;
    let count = |sql: &str| -> Result<i64, Error> {
        connection
            .query_row(sql, [], |row| row.get(0))
            .map_err(open_error)
    };
    if version == 0 && count("SELECT count(*) FROM sqlite_master")? == 0 {
        return Ok(Stored::Nothing);
    }
    let journal_tables = count(
        "SELECT count(*) FROM sqlite_master
         WHERE type='table' AND name IN ('journal_entries','preferences')",
    )?;
    Ok(Stored::Database {
        version,
        journal: journal_tables == 2,
    })
}

/// A header or schema that SQLite cannot read is a damaged journal; other failures are storage.
///
/// A readable database that is newer or not a journal is classified by [`Stored::refusal`]
/// instead, as [`Error::Unsupported`].
fn open_error(error: rusqlite::Error) -> Error {
    if is_damage(&error) {
        Error::Damaged
    } else {
        Error::Storage
    }
}
