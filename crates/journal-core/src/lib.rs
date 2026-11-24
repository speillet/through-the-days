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
mod reading;
mod recovery;
mod registry;
mod reviews;
mod schema;
mod store;

pub use emotions::{Emotion, EmotionFamily, EmotionVocabulary, emotion_vocabulary};
pub use error::Error;
pub use model::{Action, Depth, Entry, Reflection, Slot, Win, document_text};
pub use plan::{BackupPlan, DailyBackup};
pub use preferences::Preferences;
pub use reading::{
    DayObservations, Measure, Observation, ReadingReport, ScoreMetric, SearchRequest,
};
pub use recovery::{BackupInfo, probe_backup_folder, validate_passphrase, verify_backup};
pub use registry::{BackupRecord, list_backups};
pub use reviews::{Milestone, WeeklyReview};
pub use schema::schema_version;
pub use store::{Journal, TrashItem, erase_journal_files};
