//! Local journal authority for Through the Days.
//!
//! Callers never issue SQL or coordinate partial saves: each operation validates its input,
//! commits a complete entry aggregate or nothing, and reports an [`Error`] whose English message
//! contains no journal text. Encrypted backups follow `docs/backup-format.md`.

mod emotions;
mod error;
mod fsutil;
mod model;
mod plan;
mod preferences;
mod recovery;
mod registry;
mod schema;
mod store;

pub use emotions::{Emotion, EmotionFamily, EmotionVocabulary, emotion_vocabulary};
pub use error::Error;
pub use model::{Action, Depth, Entry, Reflection, Slot, Win, document_text};
pub use plan::{BackupPlan, DailyBackup};
pub use preferences::Preferences;
pub use recovery::{BackupInfo, validate_passphrase, verify_backup};
pub use registry::{BackupRecord, list_backups};
pub use schema::schema_version;
pub use store::{Journal, TrashItem, erase_journal_files};
