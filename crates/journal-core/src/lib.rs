//! Local journal authority. Callers never issue SQL or coordinate partial saves.

mod model;
mod store;
mod recovery;
mod preferences;

pub use model::{Action, Depth, Entry, Error, Reflection, Slot, Win, document_text};
pub use store::{Journal, TrashItem};
pub use recovery::{BackupInfo, BackupPlan, DailyBackup};
pub use preferences::Preferences;

