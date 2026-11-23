//! The native application state behind every command.
//!
//! [`Core`] owns the journal connection, the startup outcome and the device-local backup state.
//! It knows nothing about Tauri or Keychain, so its behaviour is tested with temporary folders,
//! synthetic journals and an in-memory secret store. [`AppState`] guards it with one lock: a
//! command that needs the journal waits while a backup, restore or migration holds it.
//!
//! Work that waits on something outside the app never holds that lock. A Keychain operation can
//! wait for the person to answer a macOS prompt, and checking a chosen backup folder writes to a
//! drive that may be slow; journal commands, saves included, keep working meanwhile.

mod backup;
mod restore;
#[cfg(test)]
mod tests;

pub use backup::BackupStatus;
pub use restore::{PickedBackup, RestoreOutcome, RestoreSource};

use crate::{
    diagnostics,
    error::CommandError,
    keychain::{KeychainError, SecretStore},
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
/// Shown when the journal could not be opened for a reason other than its version or damage.
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

/// Waits for `lock`. A panic elsewhere never makes the journal unreachable.
fn recover<T: ?Sized>(lock: &Mutex<T>) -> MutexGuard<'_, T> {
    lock.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The managed state: [`Core`] behind the lock every command takes, and the secret store.
///
/// Locks are taken in the order `launch`, `secrets`, `core`, and a lock is never requested
/// while a later one in that order is held.
pub struct AppState {
    /// Held by the launch while its startup outcome can still change, so the startup status is
    /// never reported before it is final.
    launch: Mutex<()>,
    /// The Keychain store. Its lock keeps each Keychain operation and the session change that
    /// follows it together, without holding the journal.
    secrets: Mutex<Box<dyn SecretStore>>,
    core: Mutex<Core>,
}

/// What the launch still has to do once the journal is open.
pub struct PendingLaunch<'a> {
    /// Held until the startup outcome is final.
    _unsettled: Option<MutexGuard<'a, ()>>,
    /// The passphrase generation seen at launch, when a remembered passphrase must be read.
    keychain_read: Option<u64>,
}

impl AppState {
    pub fn new(paths: DataPaths, secrets: Box<dyn SecretStore>) -> Self {
        Self {
            launch: Mutex::new(()),
            secrets: Mutex::new(secrets),
            core: Mutex::new(Core::new(paths)),
        }
    }

    /// Waits for the journal and the session state.
    pub fn lock(&self) -> MutexGuard<'_, Core> {
        recover(&self.core)
    }

    fn secrets(&self) -> MutexGuard<'_, Box<dyn SecretStore>> {
        recover(&self.secrets)
    }

    /// Prepares the session: [`Self::open_at_launch`], then [`Self::finish_launch`].
    #[cfg(test)]
    pub fn launch(&self, now: DateTime<Utc>) {
        let pending = self.open_at_launch(now, || {});
        self.finish_launch(pending, now);
    }

    /// Loads the backup plan and opens the journal, holding the state from before `locked` runs
    /// until the journal is open, so no command sees a half-open journal.
    ///
    /// Keychain is not read yet: an older journal that a remembered passphrase could upgrade
    /// waits for [`Self::finish_launch`] before its startup status is reported.
    pub fn open_at_launch(&self, now: DateTime<Utc>, locked: impl FnOnce()) -> PendingLaunch<'_> {
        let launch = recover(&self.launch);
        let mut core = self.lock();
        locked();
        core.load_plan();
        core.open_journal(now);
        let keychain_read = core.plan.remember.then_some(core.secret_generation);
        let unsettled =
            keychain_read.is_some() && core.startup.state == StartupState::NeedsMigration;
        PendingLaunch {
            _unsettled: unsettled.then_some(launch),
            keychain_read,
        }
    }

    /// Reads a remembered passphrase from Keychain without holding the journal, so writing goes
    /// on while a Keychain prompt waits for an answer. Then an older journal can be upgraded
    /// with it, if its encrypted pre-migration backup can be made.
    pub fn finish_launch(&self, pending: PendingLaunch<'_>, now: DateTime<Utc>) {
        if let Some(generation) = pending.keychain_read {
            let secrets = self.secrets();
            let remembered = secrets.read();
            self.lock().adopt_remembered(generation, remembered, now);
        }
    }

    /// The startup outcome, once the launch has decided it.
    pub fn startup_status(&self) -> StartupStatus {
        let _launch = recover(&self.launch);
        self.lock().startup_status()
    }

    /// Opens the journal again after a failed or unsupported start; the cause, such as another
    /// process holding the file, may have gone. Otherwise the status is returned unchanged.
    pub fn retry_startup(&self, now: DateTime<Utc>) -> StartupStatus {
        let _launch = recover(&self.launch);
        let mut core = self.lock();
        if matches!(
            core.startup.state,
            StartupState::Failed | StartupState::Unsupported
        ) {
            core.open_journal(now);
        }
        core.startup_status()
    }

    /// Upgrades an older journal after its encrypted pre-migration backup (D-005, D-006).
    ///
    /// Needs a chosen backup folder and a passphrase: a new one, which is validated, kept for
    /// the session and remembered in Keychain when asked, or `None` for the passphrase already
    /// in the session. Using the session passphrase never removes a remembered one; it is
    /// remembered when asked. Any failure leaves the journal at its earlier version.
    pub fn migrate_journal(
        &self,
        passphrase: Option<Zeroizing<String>>,
        remember: bool,
        now: DateTime<Utc>,
    ) -> Result<StartupStatus, CommandError> {
        let secrets = self.secrets();
        let session_to_remember = {
            let core = self.lock();
            if core.startup.state != StartupState::NeedsMigration {
                return Ok(core.startup_status());
            }
            if core.plan.folder.is_none() {
                return Err(CommandError::needs_folder());
            }
            match &passphrase {
                Some(new) => {
                    validate_passphrase(new)?;
                    None
                }
                None => {
                    let session = core
                        .passphrase
                        .clone()
                        .ok_or_else(CommandError::needs_passphrase)?;
                    (remember && !core.plan.remember).then_some(session)
                }
            }
        };
        // Keychain changes happen without holding the journal.
        let keychain = match (&passphrase, &session_to_remember) {
            (Some(new), _) if remember => secrets.store(new),
            (Some(_), _) => secrets.delete(),
            (None, Some(session)) => secrets.store(session),
            (None, None) => Ok(()),
        };
        let mut core = self.lock();
        // A Keychain failure is recorded and shown by the backup status; it never blocks the
        // upgrade.
        match passphrase {
            Some(new) => core.adopt_passphrase(new, remember, keychain)?,
            None if session_to_remember.is_some() => core.remember_session_passphrase(keychain)?,
            None => {}
        }
        core.migrate(now)
    }

    /// Erases every application-managed file and secret, then opens a fresh journal.
    ///
    /// Removes the journal and its SQLite companions, journals kept aside by a restore, the
    /// backup plan, leftover temporary files and the Keychain item, and forgets the session
    /// passphrase. Backups in the chosen folder are never touched. When a step fails, the others
    /// still run, and the first failure, in the order journal files, backup plan, Keychain, is
    /// reported after the journal is reopened: a Keychain error therefore means the journal and
    /// the backup settings were erased.
    pub fn erase_app_data(
        &self,
        confirmation: &str,
        now: DateTime<Utc>,
    ) -> Result<StartupStatus, CommandError> {
        if confirmation != ERASE_CONFIRMATION {
            return Err(CommandError::confirmation());
        }
        let secrets = self.secrets();
        let keychain = secrets.delete();
        self.lock().erase(keychain, now)
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
    journal: Option<Journal>,
    startup: StartupStatus,
    /// Device-local backup settings, stored in `backup-plan.json`.
    plan: BackupPlan,
    /// `backup-plan.json` exists but could not be read. The file is kept, and the plan is not
    /// stored, until the person chooses a backup folder again.
    plan_unreadable: bool,
    /// The backup passphrase for this session, typed or read from Keychain.
    passphrase: Option<Zeroizing<String>>,
    /// Changes whenever the session passphrase or the Keychain choice changes, so a Keychain
    /// read that started earlier never replaces a newer choice.
    secret_generation: u64,
    /// The last failed backup attempt since the last success.
    last_error: Option<CommandError>,
    /// When the last automatic daily backup failed; automatic attempts pause after it.
    automatic_failure_at: Option<DateTime<Utc>>,
    /// The backup file chosen in the native open dialog. The renderer never sends paths.
    picked: Option<PathBuf>,
}

impl Core {
    pub fn new(paths: DataPaths) -> Self {
        let startup = StartupStatus {
            state: StartupState::Failed,
            from_version: None,
            message: Some(OPEN_FAILED.to_owned()),
            data_location: paths.data_dir.display().to_string(),
        };
        Self {
            paths,
            journal: None,
            startup,
            plan: BackupPlan::default(),
            plan_unreadable: false,
            passphrase: None,
            secret_generation: 0,
            last_error: None,
            automatic_failure_at: None,
            picked: None,
        }
    }

    pub fn startup_status(&self) -> StartupStatus {
        self.startup.clone()
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

    /// Returns a trashed entry to its slot. Trash whose 30 days have passed at `now` is gone,
    /// even before a purge removes it (D-003).
    pub fn restore_entry(&self, id: &str, now: DateTime<Utc>) -> Result<Entry, CommandError> {
        Ok(self.journal()?.restore(id, now.timestamp())?)
    }

    pub fn delete_entry_permanently(&self, id: &str) -> Result<(), CommandError> {
        Ok(self.journal()?.permanently_delete(id)?)
    }

    pub fn purge_expired_trash(&self, now: DateTime<Utc>) -> Result<(), CommandError> {
        Ok(self.journal()?.purge_expired(now.timestamp())?)
    }

    /// Reads the backup plan. An unreadable file is kept until the person chooses a backup
    /// folder again, and is reported rather than silently replaced by an empty plan.
    fn load_plan(&mut self) {
        match BackupPlan::load(&self.paths.plan) {
            Ok(plan) => {
                self.plan = plan;
                self.plan_unreadable = false;
            }
            Err(error) => {
                diagnostics::record("load backup plan", error.code());
                self.plan = BackupPlan::default();
                self.plan_unreadable = true;
            }
        }
    }

    /// Uses the passphrase read from Keychain at launch, unless the passphrase or the Keychain
    /// choice changed since `generation`, then upgrades an older journal that waited for it.
    fn adopt_remembered(
        &mut self,
        generation: u64,
        remembered: Result<Option<Zeroizing<String>>, KeychainError>,
        now: DateTime<Utc>,
    ) {
        if generation == self.secret_generation {
            match remembered {
                Ok(Some(passphrase)) => {
                    self.passphrase = Some(passphrase);
                    self.automatic_failure_at = None;
                }
                // Nothing is stored any more, for example after removal in Keychain Access.
                Ok(None) => self.plan.remember = false,
                // The passphrase is simply unavailable: backups wait for it, writing does not.
                Err(_) => diagnostics::record("read keychain", "keychain"),
            }
        }
        if self.startup.state == StartupState::NeedsMigration && self.journal.is_none() {
            self.startup = self.migrate_at_launch(now);
            self.purge_after_opening(now);
        }
    }

    /// Runs the protected upgrade with the folder and passphrase of this session.
    fn migrate(&mut self, now: DateTime<Utc>) -> Result<StartupStatus, CommandError> {
        let folder = self
            .plan
            .folder
            .clone()
            .ok_or_else(CommandError::needs_folder)?;
        let journal = {
            let passphrase = self
                .passphrase
                .as_deref()
                .ok_or_else(CommandError::needs_passphrase)?;
            Journal::migrate_with_backup(&self.paths.journal, &folder, passphrase, now.timestamp())?
        };
        self.journal = Some(journal);
        self.startup = self.status(StartupState::Ready, None, None);
        self.purge_after_opening(now);
        Ok(self.startup.clone())
    }

    /// The erasure itself, after the Keychain item was deleted with the outcome `keychain`.
    fn erase(
        &mut self,
        keychain: Result<(), KeychainError>,
        now: DateTime<Utc>,
    ) -> Result<StartupStatus, CommandError> {
        // The connection must be closed before its files are removed.
        self.journal = None;
        let mut failure = None;
        if let Err(error) = erase_journal_files(&self.paths.journal) {
            diagnostics::record("erase journal", error.code());
            failure.get_or_insert(CommandError::from(error));
        }
        if paths::remove_set_aside_journals(&self.paths.journal).is_err() {
            diagnostics::record("erase set-aside journal", Error::Storage.code());
            failure.get_or_insert(CommandError::from(Error::Storage));
        }
        match fs::remove_file(&self.paths.plan) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => {
                diagnostics::record("erase backup plan", Error::Storage.code());
                failure.get_or_insert(CommandError::from(Error::Storage));
            }
        }
        if keychain.is_err() {
            diagnostics::record("erase keychain item", "keychain");
            failure.get_or_insert(CommandError::keychain());
        }
        self.plan = BackupPlan::default();
        self.plan_unreadable = false;
        self.passphrase = None;
        self.secret_generation = self.secret_generation.wrapping_add(1);
        self.last_error = None;
        self.automatic_failure_at = None;
        self.picked = None;
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
            // A damaged header or schema: the file is left as it is, and a backup can replace it.
            Err(Error::Damaged) => {
                diagnostics::record("open journal", Error::Damaged.code());
                self.status(StartupState::Failed, None, Some(Error::Damaged.to_string()))
            }
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

    /// Stores the backup plan, reporting a failure to the caller. While the stored file is
    /// unreadable it is kept as it is: choosing a backup folder writes the plan again.
    fn persist_plan(&self) -> Result<(), CommandError> {
        if self.plan_unreadable {
            return Ok(());
        }
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
