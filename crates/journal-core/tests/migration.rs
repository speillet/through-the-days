use journal_core::{Entry, Journal, Slot};
use serde_json::json;

fn previous_journal(path: &std::path::Path) -> String {
    let connection = rusqlite::Connection::open(path).unwrap();
    connection.execute_batch("CREATE TABLE journal_entries(id TEXT PRIMARY KEY,entry_date TEXT NOT NULL,slot TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL);
        CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date,slot);
        CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        PRAGMA user_version=1;").unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    entry.revision = 1;
    entry.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic previous journal."}]}]});
    let mut payload = serde_json::to_value(&entry).unwrap();
    payload.as_object_mut().unwrap().remove("progress");
    connection.execute("INSERT INTO journal_entries VALUES(?1,?2,'morning',1,?3)", rusqlite::params![entry.id,entry.date,payload.to_string()]).unwrap();
    entry.id
}

#[test]
fn existing_journal_waits_for_recovery_then_migrates_with_nullable_progress() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("previous.sqlite");
    let id = previous_journal(&path);
    let original = std::fs::read(&path).unwrap();
    assert!(Journal::open(&path).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(Journal::migrate_with_backup(&path, &directory.path().join("missing"), "synthetic migration passphrase", 1_795_363_200).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    let journal = Journal::migrate_with_backup(&path, directory.path(), "synthetic migration passphrase", 1_795_363_200).unwrap();
    let entry = journal.get(&id).unwrap();
    assert_eq!(entry.progress, None);
    assert_eq!(entry.date, "2026-11-22");
    assert_eq!(entry.document["content"][0]["content"][0]["text"], "Synthetic previous journal.");
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().filter_map(Result::ok).filter(|e| e.path().extension().is_some_and(|e| e == "age")).count(), 1);
}
