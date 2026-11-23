#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::document;
use journal_core::{Entry, Journal, Slot};
use std::{
    os::unix::process::ExitStatusExt,
    path::{Path, PathBuf},
    process::Command,
};

const CRASH_TEST: &str = "crash_after_saved_acknowledgement_restores_the_exact_revision";
const CHILD_DATABASE: &str = "TTD_TEST_CRASH_CHILD_DATABASE";

/// local-persistence — Atomic acknowledged revisions / Crash after saved acknowledgment.
///
/// A child process saves, records the acknowledged revision, then is killed with SIGKILL before
/// any destructor can close or checkpoint the journal.
#[test]
fn crash_after_saved_acknowledgement_restores_the_exact_revision() {
    if let Some(database) = std::env::var_os(CHILD_DATABASE) {
        save_then_get_killed(Path::new(&database));
    }
    let directory = tempfile::tempdir().unwrap();
    let database = directory.path().join("journal.sqlite");
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", CRASH_TEST, "--nocapture", "--test-threads=1"])
        .env(CHILD_DATABASE, &database)
        .output()
        .unwrap();
    assert_eq!(
        child.status.signal(),
        Some(9),
        "the child must be killed after its acknowledgement: {}",
        String::from_utf8_lossy(&child.stderr)
    );
    let acknowledged: Entry =
        serde_json::from_slice(&std::fs::read(acknowledgement(&database)).unwrap()).unwrap();
    assert_eq!(acknowledged.revision, 2);
    let reopened = Journal::open(&database).unwrap();
    assert_eq!(reopened.get(&acknowledged.id).unwrap(), acknowledged);
}

fn save_then_get_killed(database: &Path) -> ! {
    let journal = Journal::open(database).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    // Deliberate multilingual synthetic fixture.
    entry.document = document("Synthetic: saved just before the app stopped. Ça va 🌙");
    entry.mood = Some(4);
    entry.reflection.difficulty = "Synthetic difficulty.".into();
    let mut next = journal.save(entry).unwrap();
    next.energy = Some(6);
    next.reflection.helped = "Synthetic help.".into();
    let acknowledged = journal.save(next).unwrap();
    std::fs::write(
        acknowledgement(database),
        serde_json::to_vec(&acknowledged).unwrap(),
    )
    .unwrap();
    let _ = Command::new("kill")
        .args(["-KILL", &std::process::id().to_string()])
        .status();
    std::thread::sleep(std::time::Duration::from_secs(5));
    // Reaching this point means the kill failed; the parent then reports a normal exit.
    std::process::exit(101);
}

fn acknowledgement(database: &Path) -> PathBuf {
    database.with_extension("acknowledged.json")
}

/// local-persistence — Progressive autosave and errors / Partial reflection restart.
#[test]
fn partially_answered_check_in_is_restored_without_requiring_completion() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut partial = Entry::draft("2026-11-22", Slot::Morning);
    partial.mood = Some(3);
    partial.emotion = "tired".into();
    partial.reflection.intention = "Synthetic: one small step".into();
    let partial = journal.save(partial).unwrap();
    drop(journal);
    let restored = Journal::open(&path).unwrap().get(&partial.id).unwrap();
    assert_eq!(restored, partial);
    assert!(!restored.complete);
    assert_eq!(
        (restored.energy, restored.pride, restored.progress),
        (None, None, None)
    );
}
