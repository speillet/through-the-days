//! Backup settings, status and the explicit and daily backups (D-005 to D-007, D-009).
//!
//! The chosen folder, the Keychain choice and the last success live in the device-local backup
//! plan. The passphrase lives in memory for the session and, when remembered, in Keychain.

use super::{AppState, Core};
use crate::{diagnostics, error::CommandError, keychain::KeychainError, paths};
use chrono::{DateTime, TimeDelta, Utc};
use journal_core::{
    BackupRecord, DailyBackup, Error, list_backups, probe_backup_folder, validate_passphrase,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

/// How long automatic daily backups pause after one fails, unless the folder or the passphrase
/// changes. "Back up now" always tries.
const AUTOMATIC_RETRY_DELAY: TimeDelta = TimeDelta::minutes(60);

/// What the backup routine needs or reports, as `BackupState` in `api/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackupState {
    SettingsUnreadable,
    NeedsFolder,
    NeedsPassphrase,
    Due,
    UpToDate,
    Failed,
}

/// Derives the backup state, checking in this order: the stored backup settings could be read,
/// a folder is chosen, today's backup succeeded, the passphrase is available, the last attempt
/// failed.
pub fn backup_state(
    settings_unreadable: bool,
    has_folder: bool,
    last_success_date: Option<&str>,
    today: Option<&str>,
    passphrase_available: bool,
    has_error: bool,
) -> BackupState {
    if settings_unreadable {
        BackupState::SettingsUnreadable
    } else if !has_folder {
        BackupState::NeedsFolder
    } else if last_success_date.is_some() && last_success_date == today {
        BackupState::UpToDate
    } else if !passphrase_available {
        BackupState::NeedsPassphrase
    } else if has_error {
        BackupState::Failed
    } else {
        BackupState::Due
    }
}

/// What Keychain did not do after a passphrase change, which still applies to the session, as
/// `KeychainWarning` in `api/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(
    clippy::enum_variant_names,
    reason = "each variant names what Keychain did not do, as the renderer's names do"
)]
pub enum KeychainWarning {
    /// The passphrase could not be stored, so it lasts for this session only.
    NotRemembered,
    /// The passphrase could not be stored in place of the one remembered before. It lasts for
    /// this session only, and the earlier one may remain in Keychain, where the app no longer
    /// reads it.
    NotReplaced,
    /// The remembered passphrase could not be removed. It may remain in Keychain, where the app
    /// no longer reads it.
    NotRemoved,
}

impl KeychainWarning {
    /// The warning after Keychain stored a new passphrase with the outcome `stored`. A refused
    /// store leaves a passphrase remembered before (`replacing`) where it was.
    fn after_store(stored: Result<(), KeychainError>, replacing: bool) -> Option<Self> {
        stored.err().map(|_| {
            if replacing {
                Self::NotReplaced
            } else {
                Self::NotRemembered
            }
        })
    }

    /// The warning after Keychain deleted the item with the outcome `deleted`.
    fn after_delete(deleted: Result<(), KeychainError>) -> Option<Self> {
        deleted.err().map(|_| Self::NotRemoved)
    }
}

/// The backup routine's state for the renderer, as `BackupStatus` in `api/types.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub state: BackupState,
    /// Display-only; the renderer never sends it back.
    pub folder_name: Option<String>,
    pub folder_path: Option<String>,
    pub passphrase_available: bool,
    pub remembered: bool,
    /// The launch is still reading the remembered passphrase from Keychain, for example while
    /// a macOS prompt waits for an answer, and no passphrase change has replaced it since.
    pub keychain_pending: bool,
    /// Set only in the reply to a passphrase change that Keychain did not follow.
    pub keychain_warning: Option<KeychainWarning>,
    /// Set only in the reply to a passphrase change whose backup settings could not be stored.
    /// The change still applies to this session, but the next launch follows the Keychain choice
    /// stored before.
    pub settings_not_saved: bool,
    pub last_success_date: Option<String>,
    pub last_success_at: Option<i64>,
    pub last_error: Option<CommandError>,
    pub retention_warning: bool,
    pub backup_count: usize,
}

impl AppState {
    /// Uses `folder` for future backups once it is known to be outside the application data
    /// folder and able to receive backups.
    ///
    /// The check writes, publishes and removes a small file, as a backup would, without holding
    /// the journal. A refused folder leaves the backup settings unchanged.
    pub fn choose_backup_folder(
        &self,
        folder: PathBuf,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        let data_dir = self.lock().paths.data_dir.clone();
        if paths::is_within(&folder, &data_dir) {
            return Err(CommandError::data_folder_chosen());
        }
        if let Err(error) = probe_backup_folder(&folder) {
            diagnostics::record("check backup folder", error.code());
            return Err(error.into());
        }
        self.lock().set_backup_folder(folder, now)
    }

    /// Keeps a new passphrase for this session and remembers it in Keychain only when asked.
    /// Existing backups keep the passphrase they were created with.
    ///
    /// Keychain is used without holding the journal. When it fails, the passphrase still works
    /// for this session and is recorded as not remembered, and the status returned says what
    /// Keychain did not do, including a passphrase remembered before that it may still hold.
    /// Backup settings that cannot be stored never undo the change either: the status returned
    /// says they were not saved.
    pub fn set_backup_passphrase(
        &self,
        passphrase: Zeroizing<String>,
        remember: bool,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        validate_passphrase(&passphrase)?;
        let _changing = self.secrets();
        let keychain = if remember {
            self.keychain.store(&passphrase)
        } else {
            self.keychain.delete()
        };
        let mut core = self.lock();
        // Holding `secrets` kept the Keychain choice as it was before the operation.
        let keychain_warning = if remember {
            KeychainWarning::after_store(keychain, core.plan.remember)
        } else {
            KeychainWarning::after_delete(keychain)
        };
        let settings_not_saved = core
            .adopt_passphrase(passphrase, remember, keychain)
            .is_err();
        Ok(BackupStatus {
            keychain_warning,
            settings_not_saved,
            ..core.backup_status(now)
        })
    }

    /// Forgets the session passphrase and removes the Keychain item. When Keychain cannot
    /// remove it, the passphrase is forgotten all the same and no longer read at launch, and the
    /// status returned says it may remain in Keychain. When the backup settings cannot be stored,
    /// the passphrase is forgotten for this session, and the status returned says they were not
    /// saved, so a later launch may still read the item.
    pub fn forget_backup_passphrase(
        &self,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        let _changing = self.secrets();
        let deleted = self.keychain.delete();
        let mut core = self.lock();
        let settings_not_saved = core.forget_passphrase(deleted).is_err();
        Ok(BackupStatus {
            keychain_warning: KeychainWarning::after_delete(deleted),
            settings_not_saved,
            ..core.backup_status(now)
        })
    }
}

impl Core {
    pub fn backup_status(&self, now: DateTime<Utc>) -> BackupStatus {
        let folder = self.plan.folder.as_deref();
        let today = self.journal_today(now);
        BackupStatus {
            state: backup_state(
                self.plan_unreadable,
                folder.is_some(),
                self.plan.last_success_date.as_deref(),
                today.as_deref(),
                self.passphrase.is_some(),
                self.last_error.is_some(),
            ),
            folder_name: folder.map(display_name),
            folder_path: folder.map(|folder| folder.display().to_string()),
            passphrase_available: self.passphrase.is_some(),
            remembered: self.plan.remember,
            keychain_pending: self.launch_read == Some(self.secret_generation),
            keychain_warning: None,
            settings_not_saved: false,
            last_success_date: self.plan.last_success_date.clone(),
            last_success_at: self.plan.last_success_at,
            last_error: self.last_error.clone(),
            retention_warning: self.plan.retention_warning,
            backup_count: folder
                .map_or(0, |folder| list_backups(folder).map_or(0, |all| all.len())),
        }
    }

    /// The chosen backup folder, where the restore dialog starts.
    pub fn backup_folder(&self) -> Option<PathBuf> {
        self.plan.folder.clone()
    }

    /// Uses `folder` for future backups. Choosing another folder forgets the results that
    /// described the previous one, so the new folder receives its own backup today. Choosing a
    /// folder also replaces stored backup settings that could not be read.
    pub(super) fn set_backup_folder(
        &mut self,
        folder: PathBuf,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        if self.plan_unreadable || self.plan.folder.as_ref() != Some(&folder) {
            let previous = self.plan.clone();
            self.plan.folder = Some(folder);
            self.plan.last_success_date = None;
            self.plan.last_success_at = None;
            self.plan.retention_warning = false;
            let unreadable = std::mem::replace(&mut self.plan_unreadable, false);
            if let Err(error) = self.persist_plan() {
                self.plan = previous;
                self.plan_unreadable = unreadable;
                return Err(error);
            }
            self.last_error = None;
            self.automatic_failure_at = None;
        }
        Ok(self.backup_status(now))
    }

    /// Backs up now, whatever the daily schedule says.
    pub fn backup_now(&mut self, now: DateTime<Utc>) -> Result<BackupStatus, CommandError> {
        let journal = self.journal()?;
        let (folder, passphrase) = self.backup_target()?;
        // Display preferences that cannot be read never stop a backup (D-016): the journal date
        // follows the defaults that the interface shows meanwhile.
        let date = journal
            .preferences()
            .unwrap_or_default()
            .journal_date(now)?;
        match journal.backup_to(folder, passphrase, now.timestamp()) {
            Ok(saved) => {
                self.record_success(date, saved.created_at, saved.retention_warning);
                Ok(self.backup_status(now))
            }
            Err(error) => Err(self.backup_failed(error)),
        }
    }

    /// The backup folder and the session passphrase, or the error that asks for the first one
    /// missing.
    pub(super) fn backup_target(&self) -> Result<(&Path, &str), CommandError> {
        let folder = self
            .plan
            .folder
            .as_deref()
            .ok_or_else(CommandError::needs_folder)?;
        let passphrase = self
            .passphrase
            .as_deref()
            .ok_or_else(CommandError::needs_passphrase)?;
        Ok((folder, passphrase))
    }

    /// Keeps the error of a failed backup for the status, and returns it.
    pub(super) fn backup_failed(&mut self, error: Error) -> CommandError {
        let error = CommandError::from(error);
        self.last_error = Some(error.clone());
        error
    }

    /// Runs the daily backup when none succeeded today (D-007). A missing folder or passphrase
    /// and a failed attempt are reported in the status, not as errors. While the stored display
    /// preferences cannot be read, today's date follows the defaults (D-016).
    ///
    /// After a failed attempt, the next automatic attempts wait [`AUTOMATIC_RETRY_DELAY`]
    /// unless the folder or the passphrase changes, so a folder that keeps failing does not cost
    /// a snapshot and two key derivations each time the app is focused. The status stays
    /// `failed` with the last error meanwhile.
    pub fn run_daily_backup(&mut self, now: DateTime<Utc>) -> Result<BackupStatus, CommandError> {
        let journal = self.journal()?;
        let preferences = journal.preferences().unwrap_or_default();
        if self.automatic_retry_paused(now) {
            return Ok(self.backup_status(now));
        }
        let mut plan = self.plan.clone();
        let passphrase = self.passphrase.as_deref().map(String::as_str);
        match journal.backup_if_due(&mut plan, passphrase, now, &preferences) {
            Ok(DailyBackup::Saved) => {
                self.plan = plan;
                self.succeeded();
            }
            Ok(DailyBackup::NotDue | DailyBackup::NeedsFolder | DailyBackup::NeedsPassphrase) => {}
            Err(error) => {
                diagnostics::record("daily backup", error.code());
                self.last_error = Some(error.into());
                self.automatic_failure_at = Some(now);
            }
        }
        Ok(self.backup_status(now))
    }

    /// Validated backups registered in the chosen folder, newest first.
    pub fn list_backups(&self) -> Result<Vec<BackupRecord>, CommandError> {
        match &self.plan.folder {
            Some(folder) => Ok(list_backups(folder)?),
            None => Ok(Vec::new()),
        }
    }

    /// Keeps `passphrase` for the session after Keychain stored or deleted the item with the
    /// outcome `keychain`.
    ///
    /// After a Keychain failure the passphrase still works for this session and is recorded as
    /// not remembered, so the next launch never reads an outdated item. The error is a backup
    /// plan that could not be stored: the session keeps the change all the same, and the next
    /// launch follows the plan stored before.
    pub(super) fn adopt_passphrase(
        &mut self,
        passphrase: Zeroizing<String>,
        remember: bool,
        keychain: Result<(), KeychainError>,
    ) -> Result<(), CommandError> {
        if keychain.is_err() {
            diagnostics::record(
                if remember {
                    "remember passphrase"
                } else {
                    "forget passphrase"
                },
                "keychain",
            );
        }
        self.passphrase = Some(passphrase);
        self.last_error = None;
        self.plan.remember = remember && keychain.is_ok();
        self.secrets_changed();
        self.persist_plan()
    }

    /// Records that Keychain now remembers the session passphrase, when `stored` succeeded. The
    /// error is a backup plan that could not be stored; the session keeps the change all the same.
    pub(super) fn remember_session_passphrase(
        &mut self,
        stored: Result<(), KeychainError>,
    ) -> Result<(), CommandError> {
        if stored.is_err() {
            diagnostics::record("remember passphrase", "keychain");
            return Ok(());
        }
        self.plan.remember = true;
        self.secrets_changed();
        self.persist_plan()
    }

    /// Forgets the session passphrase after Keychain deleted the item with the outcome `deleted`.
    /// The error is a backup plan that could not be stored; the session forgets it all the same.
    fn forget_passphrase(
        &mut self,
        deleted: Result<(), KeychainError>,
    ) -> Result<(), CommandError> {
        self.passphrase = None;
        if deleted.is_err() {
            diagnostics::record("forget passphrase", "keychain");
        }
        self.plan.remember = false;
        self.secrets_changed();
        self.persist_plan()
    }

    /// The passphrase or the Keychain choice changed: an earlier Keychain read is outdated, and
    /// automatic backups may try again at once.
    fn secrets_changed(&mut self) {
        self.secret_generation = self.secret_generation.wrapping_add(1);
        self.automatic_failure_at = None;
    }

    /// Whether automatic attempts still wait after the last failed daily backup. A clock set
    /// back before that failure does not extend the wait.
    fn automatic_retry_paused(&self, now: DateTime<Utc>) -> bool {
        self.last_error.is_some()
            && self.automatic_failure_at.is_some_and(|failed| {
                failed <= now
                    && failed
                        .checked_add_signed(AUTOMATIC_RETRY_DELAY)
                        .is_some_and(|until| now < until)
            })
    }

    fn record_success(&mut self, date: String, created_at: i64, retention_warning: bool) {
        self.plan.last_success_date = Some(date);
        self.plan.last_success_at = Some(created_at);
        self.plan.retention_warning = retention_warning;
        self.succeeded();
    }

    /// A backup recorded in the plan succeeded: the last failure is over, and the plan is stored.
    fn succeeded(&mut self) {
        self.last_error = None;
        self.automatic_failure_at = None;
        // The backup is complete; if the plan cannot be stored, the next launch backs up again.
        let _ = self.persist_plan();
    }

    /// Today's journal date, from the stored preferences when the journal is open and they can
    /// be read, otherwise from the defaults.
    fn journal_today(&self, now: DateTime<Utc>) -> Option<String> {
        self.journal
            .as_ref()
            .and_then(|journal| journal.preferences().ok())
            .unwrap_or_default()
            .journal_date(now)
            .ok()
    }
}

/// The last part of `path` as the interface shows it, or the whole path when it has none.
pub(super) fn display_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::{BackupState, KeychainWarning, backup_state};

    const TODAY: Option<&str> = Some("2026-11-22");
    const YESTERDAY: Option<&str> = Some("2026-11-21");

    #[test]
    fn unreadable_settings_come_first() {
        assert_eq!(
            backup_state(true, true, TODAY, TODAY, true, true),
            BackupState::SettingsUnreadable
        );
        assert_eq!(
            backup_state(true, false, None, TODAY, false, false),
            BackupState::SettingsUnreadable
        );
    }

    #[test]
    fn a_missing_folder_comes_next() {
        assert_eq!(
            backup_state(false, false, TODAY, TODAY, true, true),
            BackupState::NeedsFolder
        );
    }

    #[test]
    fn todays_success_outranks_a_missing_passphrase_or_an_old_error() {
        assert_eq!(
            backup_state(false, true, TODAY, TODAY, false, true),
            BackupState::UpToDate
        );
    }

    #[test]
    fn a_due_backup_asks_for_the_passphrase_before_reporting_a_failure() {
        assert_eq!(
            backup_state(false, true, YESTERDAY, TODAY, false, true),
            BackupState::NeedsPassphrase
        );
        assert_eq!(
            backup_state(false, true, YESTERDAY, TODAY, true, true),
            BackupState::Failed
        );
        assert_eq!(
            backup_state(false, true, None, TODAY, true, false),
            BackupState::Due
        );
    }

    #[test]
    fn an_unknown_today_is_never_up_to_date() {
        assert_eq!(
            backup_state(false, true, None, None, true, false),
            BackupState::Due
        );
        assert_eq!(
            backup_state(false, true, TODAY, None, true, false),
            BackupState::Due
        );
    }

    #[test]
    fn states_serialise_with_the_renderer_names() {
        let names: Vec<_> = [
            BackupState::SettingsUnreadable,
            BackupState::NeedsFolder,
            BackupState::NeedsPassphrase,
            BackupState::Due,
            BackupState::UpToDate,
            BackupState::Failed,
        ]
        .iter()
        .map(|state| serde_json::to_value(state).ok())
        .collect();
        let expected: Vec<_> = [
            "settingsUnreadable",
            "needsFolder",
            "needsPassphrase",
            "due",
            "upToDate",
            "failed",
        ]
        .iter()
        .map(|name| Some(serde_json::Value::from(*name)))
        .collect();
        assert_eq!(names, expected);
        // Every state is one the renderer's BackupState union knows.
        let types = include_str!("../../../src/api/types.ts");
        let state_union = types
            .split("export type BackupState")
            .nth(1)
            .and_then(|declaration| declaration.split(';').next())
            .unwrap_or_default();
        for name in expected.iter().flatten().filter_map(|name| name.as_str()) {
            assert!(state_union.contains(&format!("'{name}'")), "{name}");
        }
    }

    #[test]
    fn keychain_warnings_serialise_with_the_renderer_names() {
        let types = include_str!("../../../src/api/types.ts");
        let warning_union = types
            .split("export type KeychainWarning")
            .nth(1)
            .and_then(|declaration| declaration.split(';').next())
            .unwrap_or_default();
        for (warning, name) in [
            (KeychainWarning::NotRemembered, "notRemembered"),
            (KeychainWarning::NotReplaced, "notReplaced"),
            (KeychainWarning::NotRemoved, "notRemoved"),
        ] {
            assert_eq!(
                serde_json::to_value(warning).ok(),
                Some(serde_json::Value::from(name))
            );
            assert!(warning_union.contains(&format!("'{name}'")), "{name}");
        }
    }
}
