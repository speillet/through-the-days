//! Backup settings, status and the explicit and daily backups (D-005 to D-007, D-009).
//!
//! The chosen folder, the Keychain choice and the last success live in the device-local backup
//! plan. The passphrase lives in memory for the session and, when remembered, in Keychain.

use super::Core;
use crate::{diagnostics, error::CommandError, keychain::KeychainError};
use chrono::{DateTime, Utc};
use journal_core::{BackupRecord, DailyBackup, list_backups, validate_passphrase};
use serde::Serialize;
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

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

/// Derives the backup state, checking in this order: a folder is chosen, today's backup
/// succeeded, the passphrase is available, the last attempt failed.
pub fn backup_state(
    has_folder: bool,
    last_success_date: Option<&str>,
    today: Option<&str>,
    passphrase_available: bool,
    has_error: bool,
) -> BackupState {
    if !has_folder {
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
    pub last_success_date: Option<String>,
    pub last_success_at: Option<i64>,
    pub last_error: Option<CommandError>,
    pub retention_warning: bool,
    pub backup_count: usize,
}

impl Core {
    pub fn backup_status(&self, now: DateTime<Utc>) -> BackupStatus {
        let folder = self.plan.folder.as_deref();
        let today = self.journal_today(now);
        BackupStatus {
            state: if self.plan_unreadable {
                BackupState::SettingsUnreadable
            } else {
                backup_state(
                    folder.is_some(),
                    self.plan.last_success_date.as_deref(),
                    today.as_deref(),
                    self.passphrase.is_some(),
                    self.last_error.is_some(),
                )
            },
            folder_name: folder.map(display_name),
            folder_path: folder.map(|folder| folder.display().to_string()),
            passphrase_available: self.passphrase.is_some(),
            remembered: self.plan.remember,
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
    /// described the previous one, so the new folder receives its own backup today.
    pub fn set_backup_folder(
        &mut self,
        folder: PathBuf,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        journal_core::probe_backup_folder(&folder)?;
        if self.plan.folder.as_ref() != Some(&folder) {
            self.plan.folder = Some(folder);
            self.plan.last_success_date = None;
            self.plan.last_success_at = None;
            self.plan.retention_warning = false;
            self.last_error = None;
            self.persist_plan()?;
            self.plan_unreadable = false;
            self.automatic_failure_at = None;
        }
        Ok(self.backup_status(now))
    }

    /// Keeps a new passphrase for this session and remembers it in Keychain only when asked.
    /// Existing backups keep the passphrase they were created with.
    pub fn set_backup_passphrase(
        &mut self,
        passphrase: Zeroizing<String>,
        remember: bool,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        validate_passphrase(&passphrase)?;
        self.adopt_passphrase(passphrase, remember)?
            .map_err(|_| CommandError::keychain())?;
        Ok(self.backup_status(now))
    }

    pub fn forget_backup_passphrase(
        &mut self,
        now: DateTime<Utc>,
    ) -> Result<BackupStatus, CommandError> {
        self.passphrase = None;
        let deleted = self.secrets.delete();
        if deleted.is_err() {
            diagnostics::record("forget passphrase", "keychain");
        }
        self.plan.remember = false;
        self.persist_plan()?;
        deleted.map_err(|_| CommandError::keychain())?;
        Ok(self.backup_status(now))
    }

    /// Backs up now, whatever the daily schedule says.
    pub fn backup_now(&mut self, now: DateTime<Utc>) -> Result<BackupStatus, CommandError> {
        let journal = self.journal()?;
        let folder = self
            .plan
            .folder
            .as_deref()
            .ok_or_else(CommandError::needs_folder)?;
        let passphrase = self
            .passphrase
            .as_deref()
            .ok_or_else(CommandError::needs_passphrase)?;
        let date = journal.preferences()?.journal_date(now)?;
        match journal.backup_to(folder, passphrase, now.timestamp()) {
            Ok(saved) => {
                self.record_success(date, saved.created_at, saved.retention_warning);
                Ok(self.backup_status(now))
            }
            Err(error) => {
                let error = CommandError::from(error);
                self.last_error = Some(error.clone());
                Err(error)
            }
        }
    }

    /// Runs the daily backup when none succeeded today (D-007). A missing folder or passphrase
    /// and a failed attempt are reported in the status, not as errors.
    pub fn run_daily_backup(&mut self, now: DateTime<Utc>) -> Result<BackupStatus, CommandError> {
        if self.plan_unreadable
            || self
                .automatic_failure_at
                .is_some_and(|last| now.signed_duration_since(last).num_seconds() < 3600)
        {
            return Ok(self.backup_status(now));
        }
        let journal = self.journal()?;
        let preferences = journal.preferences()?;
        let mut plan = self.plan.clone();
        let passphrase = self.passphrase.as_deref().map(String::as_str);
        match journal.backup_if_due(&mut plan, passphrase, now, &preferences) {
            Ok(DailyBackup::Saved) => {
                self.plan = plan;
                self.last_error = None;
                self.automatic_failure_at = None;
                // The backup is complete; if the plan cannot be stored, the next launch backs up again.
                let _ = self.persist_plan();
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

    /// Keeps `passphrase` for the session and stores or deletes the Keychain item.
    ///
    /// The outer error is a backup plan that could not be stored. The inner result is the
    /// Keychain outcome: after a failure the passphrase still works for this session and is
    /// recorded as not remembered, so the next launch never reads an outdated item.
    pub(super) fn adopt_passphrase(
        &mut self,
        passphrase: Zeroizing<String>,
        remember: bool,
    ) -> Result<Result<(), KeychainError>, CommandError> {
        let keychain = if remember {
            self.secrets.store(&passphrase)
        } else {
            self.secrets.delete()
        };
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
        self.automatic_failure_at = None;
        self.plan.remember = remember && keychain.is_ok();
        self.persist_plan()?;
        Ok(keychain)
    }

    fn record_success(&mut self, date: String, created_at: i64, retention_warning: bool) {
        self.plan.last_success_date = Some(date);
        self.plan.last_success_at = Some(created_at);
        self.plan.retention_warning = retention_warning;
        self.last_error = None;
        // The backup is complete; if the plan cannot be stored, the next launch backs up again.
        let _ = self.persist_plan();
    }

    /// Today's journal date, from the stored preferences when the journal is open.
    fn journal_today(&self, now: DateTime<Utc>) -> Option<String> {
        self.journal
            .as_ref()
            .and_then(|journal| journal.preferences().ok())
            .unwrap_or_default()
            .journal_date(now)
            .ok()
    }
}

fn display_name(folder: &Path) -> String {
    folder.file_name().map_or_else(
        || folder.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::{BackupState, backup_state};

    const TODAY: Option<&str> = Some("2026-11-22");
    const YESTERDAY: Option<&str> = Some("2026-11-21");

    #[test]
    fn a_missing_folder_comes_first() {
        assert_eq!(
            backup_state(false, TODAY, TODAY, true, true),
            BackupState::NeedsFolder
        );
    }

    #[test]
    fn todays_success_outranks_a_missing_passphrase_or_an_old_error() {
        assert_eq!(
            backup_state(true, TODAY, TODAY, false, true),
            BackupState::UpToDate
        );
    }

    #[test]
    fn a_due_backup_asks_for_the_passphrase_before_reporting_a_failure() {
        assert_eq!(
            backup_state(true, YESTERDAY, TODAY, false, true),
            BackupState::NeedsPassphrase
        );
        assert_eq!(
            backup_state(true, YESTERDAY, TODAY, true, true),
            BackupState::Failed
        );
        assert_eq!(
            backup_state(true, None, TODAY, true, false),
            BackupState::Due
        );
    }

    #[test]
    fn an_unknown_today_is_never_up_to_date() {
        assert_eq!(
            backup_state(true, None, None, true, false),
            BackupState::Due
        );
        assert_eq!(
            backup_state(true, TODAY, None, true, false),
            BackupState::Due
        );
    }

    #[test]
    fn states_serialise_with_the_renderer_names() {
        let names: Vec<_> = [
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
    }
}
