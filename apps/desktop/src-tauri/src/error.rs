//! The single error shape every command rejects with: `{ code, message }`.
//!
//! Codes match `ErrorCode` in `apps/desktop/src/api/types.ts`. Messages are fixed English
//! sentences, so they never carry journal text, paths or secrets. The shell's own messages are
//! identical to those of the browser preview in `apps/desktop/src/api/memory.ts`.

use serde::Serialize;

/// A rejected command, serialised as `{ "code": ErrorCode, "message": English }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl CommandError {
    fn shell(code: &'static str, message: &str) -> Self {
        Self {
            code,
            message: message.to_owned(),
        }
    }

    /// The journal is not open: it needs a migration, is unsupported or failed to open.
    pub fn not_ready() -> Self {
        Self::shell(
            "notReady",
            "The journal is not open yet. Finish the step on screen first.",
        )
    }

    pub fn needs_folder() -> Self {
        Self::shell("needsFolder", "Choose a backup folder first.")
    }

    pub fn needs_passphrase() -> Self {
        Self::shell("needsPassphrase", "Enter your backup passphrase first.")
    }

    pub fn keychain() -> Self {
        Self::shell(
            "keychain",
            "macOS Keychain could not store or read the backup passphrase. You can still type it when needed.",
        )
    }

    pub fn confirmation() -> Self {
        Self::shell("confirmation", "Type ERASE in capital letters to confirm.")
    }

    pub fn safety_backup_failed() -> Self {
        Self::shell(
            "safetyBackupFailed",
            "A safety backup of your current journal could not be made, so nothing was restored. If your current journal is damaged, you can restore without a safety backup.",
        )
    }

    /// An unexpected internal failure, such as a background task that could not finish.
    pub fn unknown() -> Self {
        Self::shell("unknown", "Something went wrong. Please try again.")
    }
}

impl From<journal_core::Error> for CommandError {
    fn from(error: journal_core::Error) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::CommandError;
    use journal_core::Error;

    fn shell_errors() -> Vec<CommandError> {
        vec![
            CommandError::not_ready(),
            CommandError::needs_folder(),
            CommandError::needs_passphrase(),
            CommandError::keychain(),
            CommandError::confirmation(),
            CommandError::unknown(),
        ]
    }

    /// Codes are only useful to the renderer if its `ErrorCode` union knows them.
    #[test]
    fn every_shell_and_core_code_is_part_of_the_renderer_contract() {
        let types = include_str!("../../src/api/types.ts");
        let core_errors = [
            Error::Storage,
            Error::Conflict,
            Error::Occupied,
            Error::NotFound,
            Error::Date,
            Error::Document,
            Error::MigrationRequired,
            Error::Unsupported,
            Error::Score,
            Error::Completion,
            Error::Reflection,
            Error::Emotion,
            Error::Backup,
            Error::BackupValidation,
            Error::Restore,
            Error::Passphrase,
        ];
        let errors = shell_errors()
            .into_iter()
            .chain(core_errors.into_iter().map(CommandError::from));
        for error in errors {
            assert!(
                types.contains(&format!("| '{}'", error.code)),
                "ErrorCode in types.ts is missing {}",
                error.code
            );
            assert!(error.message.ends_with('.'), "{}", error.message);
        }
    }

    #[test]
    fn core_errors_keep_their_code_and_english_message() {
        let error = CommandError::from(Error::Occupied);
        assert_eq!(error.code, "occupied");
        assert_eq!(
            error.message,
            "This date and slot already contain an entry. Choose a free slot."
        );
    }

    #[test]
    fn errors_serialise_as_code_and_message_only() {
        let value = serde_json::to_value(CommandError::needs_folder()).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"code": "needsFolder", "message": "Choose a backup folder first."})
        );
    }
}
