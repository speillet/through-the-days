#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, document};
use journal_core::{Entry, Journal, Milestone, Slot};
use std::{
    os::unix::process::ExitStatusExt,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};

const CRASH_TEST: &str = "crash_after_saved_acknowledgement_restores_the_exact_revision";
const CHILD_DATABASE: &str = "TTD_TEST_CRASH_CHILD_DATABASE";
/// How long another connection keeps the journal's write lock: well within the journal's
/// three-second wait for a lock.
const LOCK_HOLD: Duration = Duration::from_millis(200);

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

/// local-persistence — Progressive autosave and errors (a lock released within the wait is not a
/// save failure; a lock held past it still fails, as
/// `stale_or_locked_save_keeps_the_last_acknowledged_aggregate` in `tests/journal.rs` checks).
///
/// Another connection, such as a second copy of the app, holds the journal's write lock for a
/// moment. Every operation that reads before it writes waits for that lock and succeeds, instead
/// of failing at once: SQLite never waits to turn a read transaction into a write transaction.
#[test]
fn writers_wait_for_another_connections_write_lock_instead_of_failing() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut morning = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let evening = journal
        .save(Entry::draft("2026-11-21", Slot::Evening))
        .unwrap();
    journal.trash(&evening.id, evening.revision, NOW).unwrap();

    morning.document = document("Synthetic: saved while another connection was writing.");
    let morning = while_another_connection_writes(&path, || journal.save(morning)).unwrap();
    assert_eq!(morning.revision, 2);
    let evening =
        while_another_connection_writes(&path, || journal.restore(&evening.id, NOW)).unwrap();
    assert_eq!(evening.revision, 2);
    let review = while_another_connection_writes(&path, || {
        journal.save_weekly_notes("2026-11-22", "Synthetic weekly notes.", 0)
    })
    .unwrap();
    assert_eq!(review.revision, 1);
    let review =
        while_another_connection_writes(&path, || journal.generate_weekly_summary("2026-11-22"))
            .unwrap();
    assert!(review.summary.is_some());
    let milestone = while_another_connection_writes(&path, || {
        journal.save_milestone(Milestone::new("2026-11-22", "Synthetic milestone"))
    })
    .unwrap();
    assert_eq!(milestone.revision, 1);

    drop(journal);
    let reopened = Journal::open(&path).unwrap();
    assert_eq!(reopened.get(&morning.id).unwrap(), morning);
    assert_eq!(reopened.get(&evening.id).unwrap(), evening);
    let stored = reopened.weekly_review("2026-11-22").unwrap();
    assert_eq!(
        (stored.notes.as_str(), stored.summary),
        ("Synthetic weekly notes.", review.summary)
    );
    assert_eq!(reopened.milestones().unwrap(), vec![milestone]);
}

/// Runs `operation` while another connection holds the journal's write lock, which it releases
/// after [`LOCK_HOLD`] without changing anything.
fn while_another_connection_writes<T>(journal: &Path, operation: impl FnOnce() -> T) -> T {
    let other = rusqlite::Connection::open(journal).unwrap();
    other.execute_batch("BEGIN IMMEDIATE").unwrap();
    let release = thread::spawn(move || {
        thread::sleep(LOCK_HOLD);
        other.execute_batch("COMMIT").unwrap();
    });
    let result = operation();
    release.join().unwrap();
    result
}
