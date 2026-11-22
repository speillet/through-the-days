/// A failed journal operation.
///
/// Every variant is a fixed English message without journal text, scores or secrets, so it can be
/// shown to the person and recorded in diagnostics. [`Error::code`] is the stable identifier shared
/// with the desktop interface (`ErrorCode` in `apps/desktop/src/api/types.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum Error {
    #[error("The journal could not be saved. Check available disk space and try again.")]
    Storage,
    #[error(
        "This entry has changed. Reopen it before saving to avoid overwriting another revision."
    )]
    Conflict,
    #[error("This date and slot already contain an entry. Choose a free slot.")]
    Occupied,
    #[error("The entry is no longer available.")]
    NotFound,
    #[error("Choose a valid journal date in YYYY-MM-DD format.")]
    Date,
    #[error("The journal document has an unsupported structure.")]
    Document,
    #[error("This journal needs a protected migration before it can be opened.")]
    MigrationRequired,
    #[error(
        "This journal was created by a newer version of Through the Days or is not a journal database. It has not been changed."
    )]
    Unsupported,
    #[error("Mood and energy must be whole numbers from 0 to 10; pride and progress from 1 to 10.")]
    Score,
    #[error(
        "Add some writing, a mood score and an energy score before marking this entry complete."
    )]
    Completion,
    #[error("Each action and small win needs a unique ID and some text.")]
    Reflection,
    #[error("Choose an emotion from the list or describe it in your own words.")]
    Emotion,
    #[error(
        "The backup could not be created. Check the selected folder and available disk space, then try again."
    )]
    Backup,
    #[error("Backup validation failed. The previous backups remain available.")]
    BackupValidation,
    #[error(
        "The backup could not be restored. Check the passphrase and choose a complete supported backup. Your current journal is unchanged."
    )]
    Restore,
    #[error(
        "Choose a backup passphrase with at least 12 characters. Keep it somewhere safe for recovery."
    )]
    Passphrase,
}

impl Error {
    /// Stable camelCase identifier of this failure, independent of its English message.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Storage => "storage",
            Self::Conflict => "conflict",
            Self::Occupied => "occupied",
            Self::NotFound => "notFound",
            Self::Date => "date",
            Self::Document => "document",
            Self::MigrationRequired => "migrationRequired",
            Self::Unsupported => "unsupported",
            Self::Score => "score",
            Self::Completion => "completion",
            Self::Reflection => "reflection",
            Self::Emotion => "emotion",
            Self::Backup => "backup",
            Self::BackupValidation => "backupValidation",
            Self::Restore => "restore",
            Self::Passphrase => "passphrase",
        }
    }
}

// Conversions discard library details on purpose: they can quote SQL, paths or stored values.
impl From<rusqlite::Error> for Error {
    fn from(_: rusqlite::Error) -> Self {
        Self::Storage
    }
}

impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::Document
    }
}
