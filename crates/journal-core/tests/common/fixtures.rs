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

/// A new journal exactly as version 2 created it: write-ahead-log mode, which version 2 set on
/// every journal, and its schema with the trash column, one active entry per date and slot, and
/// no weekly-review or milestone tables. The definitions are version 2's, character for
/// character, because SQLite keeps their text.
pub const V2_SCHEMA: &str = "
    PRAGMA journal_mode=WAL;
    CREATE TABLE journal_entries (
        id TEXT PRIMARY KEY,
        entry_date TEXT NOT NULL,
        slot TEXT NOT NULL CHECK(slot IN ('morning','evening')),
        revision INTEGER NOT NULL CHECK(revision > 0),
        payload TEXT NOT NULL CHECK(json_valid(payload)),
        trashed_at INTEGER NULL
    );
    CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date, slot) WHERE trashed_at IS NULL;
    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version=2;";

/// Inserts one version-2 Evening entry of 21 November 2026; bind the entry identifier, its
/// revision, its stored payload and its deletion time in Unix seconds (`NULL` while active).
pub const V2_INSERT_ENTRY: &str =
    "INSERT INTO journal_entries VALUES(?1,'2026-11-21','evening',?2,?3,?4)";

/// Stores the display preferences of version 2; bind [`V2_DISPLAY_PREFERENCES`].
pub const V2_INSERT_PREFERENCES: &str = "INSERT INTO preferences VALUES('display',?1)";

/// Identifier of the Evening entry stored in [`V2_ENTRY_PAYLOAD`].
pub const V2_ENTRY_ID: &str = "5d3c2b1a-0f9e-4d8c-a7b6-e5f4d3c2b1a0";

/// Identifier of the earlier Evening entry stored in [`V2_TRASHED_ENTRY_PAYLOAD`].
pub const V2_TRASHED_ENTRY_ID: &str = "8e7d6c5b-4a39-4f28-9e0d-1c2b3a495867";

/// When [`V2_TRASHED_ENTRY_PAYLOAD`] was moved to the trash: 21 November 2026, 16:00 UTC.
pub const V2_TRASHED_AT: i64 = 1_795_276_800;

/// A version-2 entry payload exactly as that version stored it, with every field it had set.
/// It predates the choice to leave an entry out of insights.
pub const V2_ENTRY_PAYLOAD: &str = r#"{"id":"5d3c2b1a-0f9e-4d8c-a7b6-e5f4d3c2b1a0","date":"2026-11-21","slot":"evening","document":{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Synthetic evening"}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Synthetic words"},{"type":"text","text":" written by version 2."}]}]},"revision":3,"mood":6,"energy":5,"complete":true,"title":"Synthetic title","pride":7,"progress":8,"emotion":"calm","anotherEmotion":"Synthetic: serein","depth":"deep","reflection":{"intention":"Synthetic intention","proudOf":"Synthetic pride","difficulty":"Synthetic difficulty","nextStep":"Synthetic next step","helped":"Synthetic help","learned":"Synthetic lesson"},"actions":[{"id":"action-synthetic-walk","text":"Synthetic walk","category":"walking"}],"wins":[{"id":"win-synthetic-pride","text":"Synthetic pride","origin":"pride","includeInInsights":true}],"createdTimeZone":"Europe/London"}"#;

/// A trashed version-2 entry payload exactly as that version stored it. Version 2 let the
/// active [`V2_ENTRY_PAYLOAD`] take its date and slot once it was in the trash.
pub const V2_TRASHED_ENTRY_PAYLOAD: &str = r#"{"id":"8e7d6c5b-4a39-4f28-9e0d-1c2b3a495867","date":"2026-11-21","slot":"evening","document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic evening moved to the trash."}]}]},"revision":2,"mood":4,"energy":null,"complete":false,"title":"","pride":null,"progress":null,"emotion":"","anotherEmotion":"","depth":"quick","reflection":{"intention":"","proudOf":"","difficulty":"","nextStep":"","helped":"","learned":""},"actions":[],"wins":[],"createdTimeZone":"Europe/Paris"}"#;

/// The display preferences of version 2 exactly as it stored them, every field set to a value
/// other than its default.
pub const V2_DISPLAY_PREFERENCES: &str = r#"{"timeZone":"Europe/London","theme":"dark","gentle":true,"showDurations":false,"showToolbar":false,"showScores":false,"sidebarOpen":false,"reduceMotion":true,"defaultDepth":"deep","showWordCount":true,"textScale":130}"#;

/// The entry rows of the version-2 journal, bound in order to [`V2_INSERT_ENTRY`]: identifier,
/// revision, stored payload and deletion time.
pub const V2_ENTRY_ROWS: [(&str, u32, &str, Option<i64>); 2] = [
    (V2_ENTRY_ID, 3, V2_ENTRY_PAYLOAD, None),
    (
        V2_TRASHED_ENTRY_ID,
        2,
        V2_TRASHED_ENTRY_PAYLOAD,
        Some(V2_TRASHED_AT),
    ),
];
