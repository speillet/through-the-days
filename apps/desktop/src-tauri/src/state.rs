//! The native application state behind every command.
//!
//! [`Core`] owns the journal connection, the startup outcome and the device-local backup state.
//! It knows nothing about Tauri, so its behaviour is tested with temporary folders, synthetic
//! journals and an in-memory secret store. [`AppState`] guards it with one lock: a command that
//! needs the journal waits while a backup, restore or migration holds it.

mod backup;
mod restore;
#[cfg(test)]
mod tests;

pub use backup::BackupStatus;
pub use restore::{PickedBackup, RestoreOutcome, RestoreSource};

use crate::{
    diagnostics,
    error::CommandError,
    keychain::SecretStore,
    paths::{self, DataPaths},
};
use chrono::{DateTime, Utc};
use journal_core::{
    BackupPlan, Entry, Error, Journal, Preferences, TrashItem, erase_journal_files, schema_version,
    validate_passphrase,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs, io,
    path::PathBuf,
    sync::{Mutex, MutexGuard, PoisonError, TryLockError},
};
use zeroize::Zeroizing;

/// Text the person types to confirm erasing every application-managed file.
pub const ERASE_CONFIRMATION: &str = "ERASE";
/// Shown when the journal could not be opened for a reason other than its version.
const OPEN_FAILED: &str = "The journal could not be opened. It has not been changed.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StartupState {
    Ready,
    NeedsMigration,
    Unsupported,
    Failed,
}

/// Whether the journal is open, as `StartupStatus` in `apps/desktop/src/api/types.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub state: StartupState,
    /// Schema version of an existing journal that needs a protected upgrade.
    pub from_version: Option<u32>,
    /// English explanation for the states that need one.
    pub message: Option<String>,
    /// Display-only path of the application data folder.
    pub data_location: String,
}

/// The managed state: [`Core`] behind the lock every command takes.
pub struct AppState {
    core: Mutex<Core>,
}

impl AppState {
    pub fn new(paths: DataPaths, secrets: Box<dyn SecretStore>) -> Self {
        Self {
            core: Mutex::new(Core::new(paths, secrets)),
        }
    }

    /// Waits for the lock. A panic elsewhere never makes the journal unreachable.
    pub fn lock(&self) -> MutexGuard<'_, Core> {
        self.core.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Closes the journal at exit unless an operation still holds it.
    pub fn close_if_idle(&self) {
        let mut core = match self.core.try_lock() {
            Ok(core) => core,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => return,
        };
        core.journal = None;
    }
}

/// The journal, its startup outcome and the backup state of this Mac.
pub struct Core {
    paths: DataPaths,
    secrets: Box<dyn SecretStore>,
    journal: Option<Journal>,
    startup: StartupStatus,
    /// Device-local backup settings, stored in `backup-plan.json`.
    plan: BackupPlan,
    /// The backup passphrase for this session, typed or read from Keychain.
    passphrase: Option<Zeroizing<String>>,
    /// The last failed backup attempt since the last success.
    last_error: Option<CommandError>,
    /// The backup file chosen in the native open dialog. The renderer never sends paths.
    picked: Option<PathBuf>,
    plan_unreadable: bool,
    automatic_failure_at: Option<DateTime<Utc>>,
}

impl Core {
    pub fn new(paths: DataPaths, secrets: Box<dyn SecretStore>) -> Self {
        let startup = StartupStatus {
            state: StartupState::Failed,
            from_version: None,
            message: Some(OPEN_FAILED.to_owned()),
            data_location: paths.data_dir.display().to_string(),
        };
        Self {
            paths,
            secrets,
            journal: None,
            startup,
            plan: BackupPlan::default(),
            passphrase: None,
            last_error: None,
            picked: None,
            plan_unreadable: false,
            automatic_failure_at: None,
        }
    }

    /// Prepares the session: loads the backup plan, reads a remembered passphrase, then opens
    /// the journal. An older journal is upgraded automatically only when its encrypted
    /// pre-migration backup can be made; otherwise the upgrade waits for the person.
    pub fn launch(&mut self, now: DateTime<Utc>) {
        self.plan = BackupPlan::load(&self.paths.plan).unwrap_or_else(|error| {
            // Keep the damaged file until the person chooses backup settings again.
            diagnostics::record("load backup plan", error.code());
            self.plan_unreadable = true;
            BackupPlan::default()
        });
        if self.plan.remember {
            match self.secrets.read() {
                Ok(Some(passphrase)) => self.passphrase = Some(passphrase),
                // Nothing is stored any more, for example after removal in Keychain Access.
                Ok(None) => self.plan.remember = false,
                // The passphrase is simply unavailable: backups wait for it, writing does not.
                Err(_) => diagnostics::record("read keychain", "keychain"),
            }
        }
        self.open_journal(now);
    }

    pub fn startup_status(&self) -> StartupStatus {
        self.startup.clone()
    }

    pub fn session_passphrase(&self) -> Option<Zeroizing<String>> {
        self.passphrase.clone()
    }

    pub fn retry_startup(&mut self, now: DateTime<Utc>) -> StartupStatus {
        if matches!(
            self.startup.state,
            StartupState::Failed | StartupState::Unsupported
        ) {
            self.open_journal(now);
        }
        self.startup_status()
    }

    /// The current civil date in the journal's time zone.
    pub fn today(&self, now: DateTime<Utc>) -> Result<String, CommandError> {
        Ok(self.journal()?.preferences()?.journal_date(now)?)
    }

    pub fn preferences(&self) -> Result<Preferences, CommandError> {
        Ok(self.journal()?.preferences()?)
    }

    /// Validates and stores the preferences sent by the renderer, returning what was stored.
    pub fn set_preferences(&self, value: Value) -> Result<Preferences, CommandError> {
        let journal = self.journal()?;
        let preferences: Preferences =
            serde_json::from_value(value).map_err(|_| Error::Document)?;
        journal.set_preferences(&preferences)?;
        Ok(journal.preferences()?)
    }

    pub fn entries_on(&self, date: &str) -> Result<Vec<Entry>, CommandError> {
        Ok(self.journal()?.entries_on(date)?)
    }

    pub fn list_entries(&self) -> Result<Vec<Entry>, CommandError> {
        Ok(self.journal()?.list()?)
    }

    pub fn get_entry(&self, id: &str) -> Result<Entry, CommandError> {
        Ok(self.journal()?.get(id)?)
    }

    /// Saves the whole aggregate and returns it at its acknowledged revision.
    pub fn save_entry(&self, value: Value) -> Result<Entry, CommandError> {
        let journal = self.journal()?;
        Ok(journal.save(parse_entry(value)?)?)
    }

    pub fn trash_entry(
        &self,
        id: &str,
        revision: u32,
        now: DateTime<Utc>,
    ) -> Result<(), CommandError> {
        Ok(self.journal()?.trash(id, revision, now.timestamp())?)
    }

    pub fn list_trash(&self) -> Result<Vec<TrashItem>, CommandError> {
        Ok(self.journal()?.trash_items()?)
    }

    pub fn restore_entry(&self, id: &str, now: DateTime<Utc>) -> Result<Entry, CommandError> {
        Ok(self.journal()?.restore(id, now.timestamp())?)
    }

    pub fn delete_entry_permanently(&self, id: &str) -> Result<(), CommandError> {
        Ok(self.journal()?.permanently_delete(id)?)
    }

    pub fn purge_expired_trash(&self, now: DateTime<Utc>) -> Result<(), CommandError> {
        Ok(self.journal()?.purge_expired(now.timestamp())?)
    }

    /// Upgrades an older journal after its encrypted pre-migration backup (D-005, D-006).
    ///
    /// Needs a chosen backup folder and a valid passphrase, which is kept for the session and
    /// remembered in Keychain when asked. Any failure leaves the journal at its earlier version.
    pub fn migrate_journal(
        &mut self,
        passphrase: Zeroizing<String>,
        remember: bool,
        now: DateTime<Utc>,
    ) -> Result<StartupStatus, CommandError> {
        if self.startup.state != StartupState::NeedsMigration {
            return Ok(self.startup.clone());
        }
        let folder = self
            .plan
            .folder
            .clone()
            .ok_or_else(CommandError::needs_folder)?;
        validate_passphrase(&passphrase)?;
        // A Keychain failure is recorded and shown by the backup status; it never blocks the upgrade.
        let _keychain = self.adopt_passphrase(passphrase, remember)?;
        let passphrase = self
            .passphrase
            .as_deref()
            .ok_or_else(CommandError::needs_passphrase)?;
        let journal = Journal::migrate_with_backup(
            &self.paths.journal,
            &folder,
            passphrase,
            now.timestamp(),
        )?;
        self.journal = Some(journal);
        self.startup = self.status(StartupState::Ready, None, None);
        self.purge_after_opening(now);
        Ok(self.startup.clone())
    }

    /// Erases every application-managed file and secret, then opens a fresh journal.
    ///
    /// Removes the journal and its SQLite companions, the backup plan, leftover temporary files
    /// and the Keychain item, and forgets the session passphrase. Backups in the chosen folder
    /// are never touched. When a step fails, the others still run and the first failure is
    /// reported after the journal is reopened.
    pub fn erase_app_data(
        &mut self,
        confirmation: &str,
        now: DateTime<Utc>,
    ) -> Result<StartupStatus, CommandError> {
        if confirmation != ERASE_CONFIRMATION {
            return Err(CommandError::confirmation());
        }
        // The connection must be closed before its files are removed.
        self.journal = None;
        let mut failure = None;
        if paths::erase_recovery_folders(&self.paths.data_dir).is_err() {
            failure.get_or_insert(CommandError::from(Error::Storage));
        }
        if let Err(error) = erase_journal_files(&self.paths.journal) {
            diagnostics::record("erase journal", error.code());
            failure.get_or_insert(CommandError::from(error));
        }
        match fs::remove_file(&self.paths.plan) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => {
                diagnostics::record("erase backup plan", Error::Storage.code());
                failure.get_or_insert(CommandError::from(Error::Storage));
            }
        }
        if self.secrets.delete().is_err() {
            diagnostics::record("erase keychain item", "keychain");
            failure.get_or_insert(CommandError::keychain());
        }
        self.plan = BackupPlan::default();
        self.passphrase = None;
        self.last_error = None;
        self.picked = None;
        self.plan_unreadable = false;
        self.automatic_failure_at = None;
        self.open_journal(now);
        match failure {
            Some(error) => Err(error),
            None => Ok(self.startup.clone()),
        }
    }

    fn journal(&self) -> Result<&Journal, CommandError> {
        self.journal.as_ref().ok_or_else(CommandError::not_ready)
    }

    fn open_journal(&mut self, now: DateTime<Utc>) {
        self.journal = None;
        if paths::create_private_dir(&self.paths.data_dir).is_err() {
            diagnostics::record("create data folder", Error::Storage.code());
            self.startup = self.status(StartupState::Failed, None, Some(OPEN_FAILED.to_owned()));
            return;
        }
        paths::remove_stale_temporaries(&self.paths.data_dir);
        self.startup = match Journal::open(&self.paths.journal) {
            Ok(journal) => {
                self.journal = Some(journal);
                self.status(StartupState::Ready, None, None)
            }
            Err(Error::MigrationRequired) => self.migrate_at_launch(now),
            Err(Error::Unsupported) => self.status(
                StartupState::Unsupported,
                None,
                Some(Error::Unsupported.to_string()),
            ),
            Err(error) => {
                diagnostics::record("open journal", error.code());
                self.status(StartupState::Failed, None, Some(OPEN_FAILED.to_owned()))
            }
        };
        self.purge_after_opening(now);
    }

    /// Upgrades at launch when the folder and passphrase are already known.
    fn migrate_at_launch(&mut self, now: DateTime<Utc>) -> StartupStatus {
        let from_version = schema_version(&self.paths.journal).ok().flatten();
        let (Some(folder), Some(passphrase)) = (&self.plan.folder, &self.passphrase) else {
            return self.status(StartupState::NeedsMigration, from_version, None);
        };
        match Journal::migrate_with_backup(&self.paths.journal, folder, passphrase, now.timestamp())
        {
            Ok(journal) => {
                self.journal = Some(journal);
                self.status(StartupState::Ready, None, None)
            }
            Err(error) => {
                diagnostics::record("migrate journal", error.code());
                self.status(
                    StartupState::NeedsMigration,
                    from_version,
                    Some(error.to_string()),
                )
            }
        }
    }

    /// Removes trash whose 30 days have passed, as soon as the journal opens (D-003).
    fn purge_after_opening(&self, now: DateTime<Utc>) {
        if let Some(journal) = &self.journal
            && let Err(error) = journal.purge_expired(now.timestamp())
        {
            diagnostics::record("purge expired trash", error.code());
        }
    }

    fn status(
        &self,
        state: StartupState,
        from_version: Option<u32>,
        message: Option<String>,
    ) -> StartupStatus {
        StartupStatus {
            state,
            from_version,
            message,
            data_location: self.paths.data_dir.display().to_string(),
        }
    }

    /// Stores the backup plan, reporting a failure to the caller.
    fn persist_plan(&self) -> Result<(), CommandError> {
        self.plan.store(&self.paths.plan).map_err(|error| {
            diagnostics::record("store backup plan", error.code());
            CommandError::from(error)
        })
    }
}

/// Reads an entry sent by the renderer.
///
/// A score that is not a whole number is a score error, like an out-of-range one, rather than a
/// generic argument failure; any other malformed entry is a document error.
fn parse_entry(value: Value) -> Result<Entry, CommandError> {
    const SCORES: [&str; 4] = ["mood", "energy", "pride", "progress"];
    let malformed_score = SCORES.iter().any(|key| match value.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::Number(number)) => number
            .as_i64()
            .is_none_or(|score| i32::try_from(score).is_err()),
        Some(_) => true,
    });
    if malformed_score {
        return Err(Error::Score.into());
    }
    serde_json::from_value(value).map_err(|_| Error::Document.into())
}
