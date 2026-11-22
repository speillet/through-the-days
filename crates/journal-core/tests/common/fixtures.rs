// Frozen synthetic journal content of each schema version. Every value is fictional.
//
// These strings are what each version stored and must never be regenerated from today's
// `Entry`: a change to the entry format that can no longer read them needs a migration step.
// The file has no imports or inner attributes, so another crate's tests can `include!` it.

/// Schema of the fictional version-1 journal: no trash column, a unique slot index over every
/// row and no perceived progress in entry payloads.
pub const V1_SCHEMA: &str = "
    CREATE TABLE journal_entries(id TEXT PRIMARY KEY,entry_date TEXT NOT NULL,slot TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date,slot);
    CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    PRAGMA user_version=1;";

/// Inserts one version-1 entry; bind the entry identifier and its stored payload.
pub const V1_INSERT_ENTRY: &str =
    "INSERT INTO journal_entries VALUES(?1,'2026-11-22','morning',1,?2)";

/// Identifier of the Morning entry stored in [`V1_ENTRY_PAYLOAD`].
pub const V1_ENTRY_ID: &str = "0b6f6c3e-7a51-4d4e-9b8f-2c1d5e9a7f30";

/// A version-1 entry payload exactly as that version stored it, without `progress`.
pub const V1_ENTRY_PAYLOAD: &str = r#"{"id":"0b6f6c3e-7a51-4d4e-9b8f-2c1d5e9a7f30","date":"2026-11-22","slot":"morning","document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic previous journal."}]}]},"revision":1,"mood":3,"energy":null,"complete":false,"title":"","pride":null,"emotion":"","anotherEmotion":"","depth":"daily","reflection":{"intention":"","proudOf":"","difficulty":"Synthetic difficulty from the previous version.","nextStep":"","helped":"","learned":""},"actions":[],"wins":[],"createdTimeZone":"Europe/Paris"}"#;

/// Identifier of the Evening entry stored in [`V2_ENTRY_PAYLOAD`].
pub const V2_ENTRY_ID: &str = "5d3c2b1a-0f9e-4d8c-a7b6-e5f4d3c2b1a0";

/// A version-2 entry payload exactly as this version stores it, with every field set.
pub const V2_ENTRY_PAYLOAD: &str = r#"{"id":"5d3c2b1a-0f9e-4d8c-a7b6-e5f4d3c2b1a0","date":"2026-11-21","slot":"evening","document":{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Synthetic evening"}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Synthetic words"},{"type":"text","text":" written by version 2."}]}]},"revision":3,"mood":6,"energy":5,"complete":true,"title":"Synthetic title","pride":7,"progress":8,"emotion":"calm","anotherEmotion":"Synthetic: serein","depth":"deep","reflection":{"intention":"Synthetic intention","proudOf":"Synthetic pride","difficulty":"Synthetic difficulty","nextStep":"Synthetic next step","helped":"Synthetic help","learned":"Synthetic lesson"},"actions":[{"id":"action-synthetic-walk","text":"Synthetic walk","category":"walking"}],"wins":[{"id":"win-synthetic-pride","text":"Synthetic pride","origin":"pride","includeInInsights":true}],"createdTimeZone":"Europe/London"}"#;
