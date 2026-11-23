# Technical design

Architecture, storage, repository structure, and data contracts for the macOS application. Milestone 1 (the offline journal) implements the journal storage, protection, backups and commands described for it here; sections about later milestones remain plans.

Section numbers match the [detailed product reference](../README_THROUGH_THE_DAYS.md) so existing OpenSpec source references stay meaningful.

- [Architecture and protection](#10-recommended-technical-architecture)
- [Data model](#11-data-model)
- [Repository structure](#12-recommended-repository-structure)
- [Contracts and commands](#19-data-contracts-and-implementation-interfaces)

## 10. Recommended technical architecture

### 10.1. Technology choices

| Layer | Recommendation | Reason |
|---|---|---|
| Desktop runtime | **Tauri 2** | Lightweight macOS `.app` with controlled system access |
| Frontend | **React + TypeScript + Vite** | Reusable editor, calendar, book and chart components |
| Styling | CSS variables + optional Tailwind | Original design system, dark/light theme and accessibility |
| Editor | **Tiptap** (or alternative after proof of concept) | Rich text with portable export |
| Journal database | **SQLite**, migrations managed from Rust/Tauri | Transactional storage, reliable autosave and local search |
| Local backend | **Rust / Tauri commands** | Secure filesystem access and domain logic |
| ChatGPT pipeline | **Python 3.12+, uv, Pydantic, Typer, pytest** | Testable data ingestion and classification |
| Derived analytics | **DuckDB** (optional) | Local queries and reports; never the journal's primary source of truth |
| Charts | Recharts, ECharts or Visx; select at prototype stage | Trends, timelines, word counts and goal progress |
| CBT engine | Versioned guided worksheets + deterministic logic | Seven-step thought records work **without AI** |
| Optional LLM coach | **Ollama locally**; remote provider only with explicit opt-in | Optional Socratic questions and structured summaries |
| Blog export | **Hugo**, manually reviewed | Export selected aggregates, never private journal text by default |

**Practical decision:** start with a genuinely working macOS **Tauri + SQLite** app, without bundling Python. The Python pipeline begins as an independent local CLI and can become a packaged sidecar only after verifying distribution, code signing/notarisation, and correct operation outside the development environment. Avoid multiple sources of truth for journal data.

### 10.2. Overall architecture

```text
                 ┌───────────────────────────────────────────┐
                 │             macOS app (Tauri)             │
                 │ React / calendar / book reader / check-in │
                 │ CBT worksheets / progress timeline / charts│
                 └─────────────────────┬─────────────────────┘
                                       │ Tauri commands
                                       ▼
                 ┌───────────────────────────────────────────┐
                 │         Local SQLite (source of truth)    │
                 │ Entries + reflections + goals + CBT + tags│
                 └─────────────────────┬─────────────────────┘
                                       │ authorised local snapshots
                                       ▼
     ┌────────────────────────────────────────────────────────────┐
     │   Python analytics + optional DuckDB (local only)         │
     │   ChatGPT ZIP import / deduplication / classification      │
     │   Aggregation / reports / privacy controls                │
     └────────────────────────────┬───────────────────────────────┘
                                  │ explicitly approved export
                                  ▼
                         Optional Hugo blog
```

### 10.3. Data location and security

Use a dedicated macOS app data directory, resolved with Tauri's runtime path APIs, typically beneath `~/Library/Application Support/<application identifier>/`.

- `journal.sqlite`: journal entries, emotions, achievements, tags, goals, counters, CBT sessions and local preferences.
- `analytics.duckdb`: derived statistics and imported conversations if analytics is enabled.
- `backups/`: local backups with a **documented encryption policy**.
- **Never** store private content in the Git repository.
- LLM analysis is **off by default**. Local Ollama receives only the selected input. A remote provider requires **consent for each request**, a preview of the exact content to be sent and an option to remove fields.

For the first personal MVP, rely on macOS session/disk protections for the live store and describe ordinary SQLite as unencrypted by the application; do not assume FileVault is enabled. A separate application vault password is out of this initial scope. API secrets belong in macOS Keychain.

Before real use, provide encrypted local backups with a dedicated portable passphrase and optional Keychain storage. Back up daily while the app is active, with next-launch catch-up after a missed day. An unavailable passphrase means backup is pending, never falsely successful. A consistent recoverable encrypted backup is required before migrating an existing journal; pause safely if it cannot be made. Fresh database creation needs no prior snapshot. Backups go to a folder the person chooses in the app, and the 30 latest validated backups are kept (D-009); the confirmed 30-day period applies to trash, not backups. The [backup format](backup-format.md) specifies the encryption, validation, retention and recovery contract.

Deleted entries stay in local trash for 30 days with explicit restore/permanent deletion. Active cleanup or next launch removes expired live-store records and related retained data. Restore never overwrites an occupied date/slot. Older independent backup/export copies have a separate retention/protection policy; ordinary deletion makes no forensic-erasure promise.

Clear derivative indexes, embeddings, summaries, and pinned excerpts independently of original writing. Source deletion/exclusion immediately removes its text from retrieval and cached views, even before reindexing completes. Full application-managed erasure covers derivatives and app credentials and explains separately retained copies. Logs, CI, and issue artifacts exclude private scores, source text, model payloads, embeddings, and screenshots.

---

## 11. Data model

### 11.1. `journal_entries` — primary SQLite table

> **Milestone 1 storage.** Each entry is stored as one validated JSON aggregate beside indexed `id`, `entry_date`, `slot`, `revision` and `trashed_at` columns ([ADR 0003](adr/0003-store-each-entry-as-one-validated-aggregate.md)). The fields below describe the aggregate's logical content: actions, small wins and reflections live inside it, `body_markdown` is derived on demand rather than stored, and the trash expiry is computed from the deletion time. A partial unique index enforces one active entry per date and slot.

| Field | Indicative SQL type | Meaning |
|---|---|---|
| `id` | TEXT PRIMARY KEY | Stable UUID |
| `entry_date` | TEXT NOT NULL | Local date, `YYYY-MM-DD` |
| `slot` | TEXT NOT NULL | `morning` or `evening` |
| `status` | TEXT NOT NULL | `draft` / `complete` |
| `title` | TEXT NULL | Optional title |
| `body_json` | TEXT | Canonical rich-text document, if applicable |
| `body_markdown` | TEXT | Generated Markdown projection/export |
| `energy_score` | INTEGER NULL | `0..10`, required for `complete` |
| `valence_score` | INTEGER NULL | `0..10`, required for `complete` |
| `primary_emotion_id` | TEXT NULL | Optional English-labelled emotion vocabulary |
| `pride_score` | INTEGER NULL | Optional self-rated pride, `1..10` |
| `progress_score` | INTEGER NULL | Optional perceived progress, `1..10`; independent of mood/pride |
| `proud_of` | TEXT NULL | User-written accomplishment or point of pride |
| `daily_difficulty` | TEXT NULL | Optional difficulty |
| `next_small_step` | TEXT NULL | Optional realistic next step |
| `secondary_emotion_id` | TEXT NULL | Optional additional emotion |
| `created_at_utc` | TEXT NOT NULL | Technical creation time |
| `updated_at_utc` | TEXT NOT NULL | Last modification |
| `completed_at_utc` | TEXT NULL | Time entry became `complete` |
| `trashed_at_utc` | TEXT NULL | Explicit soft-deletion time; active entries have NULL |
| `trash_expires_at_utc` | TEXT NULL | End of the 30-day trash retention period |

Constraints: enforce uniqueness of `(entry_date, slot)` for **active** entries, for example with a partial unique index where `trashed_at_utc IS NULL`. A trashed record must not reserve the active slot or prevent conflict-safe restoration. Check mood/energy `0..10`, pride/progress `1..10` or `NULL`, valid status, and valid dates. Preserve the chosen civil date across midnight/time-zone changes; changing it is explicit. New optional fields default to `NULL`, never zero.

**Rich-text warning:** choose **one canonical format** (e.g. Tiptap JSON) and derive Markdown for exports. Do not keep two independently editable versions of an entry.

### 11.2. Related tables

- `emotions(id, name_en, description_en, family, active, version)`: original English taxonomy.
- `entry_tags(entry_id, tag_id, origin, approved_at)`, `day_tags(entry_date, tag_id, origin, approved_at)`, and `tags(id, label, category, description, active)`: AI suggestions require user approval.
- `tag_aliases(tag_id, alias, language)`: synonyms without changing canonical labels.
- `entry_actions(id, entry_id, label, category, occurred_at_local, evidence_kind)`: explicitly reported actions, separate from prose.
- `entry_reflections(entry_id, intention, helped_me, learned, gratitude, free_note)`: extend the existing optional reflection entity; depth is a presentation preference, not another entry table.
- `tracked_goals`, `goal_events`, `goal_periods`, `goal_milestones`: independent counters, reduction goals, milestones and non-destructive history.
- `keyword_definitions`, `keyword_matches`, `analysis_runs`: versioned dictionaries and auditable occurrences.
- `cbt_sessions`, `cbt_answers`, `cbt_action_plans`: saved exercises and plans; extend existing plans with prediction, effort, schedule/time zone, observation, lesson, explicit review status, and audit history rather than adding a parallel experiment table.
- `llm_requests`: **technical metadata only by default** (consent, model, timestamp, prompt version); do not retain private prompts or responses unless explicitly opted in.
- `journal_revisions` (later): recover previous edited versions.
- `app_settings`: English locale, theme, suggested writing times/depths, time zone, reduced motion, Gentle view, display preferences and sources.
- `import_runs`: source hashes, parser version, statuses and import bookkeeping.
- `conversations`, `messages`, `extracted_events`: separate local analytics store with provenance links.
- `personal_wins`: canonical multiple dated, editable user-entered or AI-confirmed wins with origin, source link and insight visibility. Explicit promotion from proud_of creates one linked win; the reflection is not independently counted again.
- `weekly_reviews`: exact ISO-week boundaries, deterministic statistics, separate user notes and optional labelled summaries, source fingerprint/version, and stale state.
- `timeline_milestones`: explicit private dated milestones, distinct from goal milestones.
- `pinned_memories`, `insight_runs`, and derived chunks: source-linked cards and versioned analysis metadata; raw content retention is opt-in and deletion/visibility propagates.

These are conceptual entities, not executable migration instructions. Add fields once through versioned migrations; do not copy the appendix's illustrative DDL unchanged. Source-version fingerprints support freshness and reproducibility while authorised revisions exist, not indefinite storage of deleted passages.

### 11.3. Fictional sample entry (JSON)

```json
{
  "id": "mock-entry-001",
  "entry_date": "2026-11-22",
  "slot": "evening",
  "status": "complete",
  "energy_score": 4,
  "valence_score": 6,
  "primary_emotion_id": "calm",
  "pride_score": 6,
  "proud_of": "I made time to rest and read.",
  "body_markdown": "Today I made time to read and go for a walk.",
  "tags": ["reading", "rest"],
  "actions": ["reading", "rest"]
}
```

These values are **illustrative** and do not describe any actual user.

---

## 12. Recommended repository structure

Milestone 1 layout:

```text
through-the-days/
├── crates/journal-core/      # journal authority: entry aggregate, validation, SQLite, trash, backups
├── apps/desktop/
│   ├── src/                  # React interface: api, domain, state, components, features, styles, guards
│   ├── e2e/                  # Playwright tests with synthetic data
│   ├── native-smoke/         # debug-only native smoke scenarios
│   └── src-tauri/            # native shell: commands, dialogs, Keychain, flush before quit
├── docs/                     # product, design, backup format, ADRs
└── openspec/                 # delivered specs and proposed changes
```

The planned layout for later milestones:

```text
through-the-days/
├── README.md                         # Short user-facing overview
├── README_THROUGH_THE_DAYS.md        # Detailed product reference (English)
├── .gitignore
├── .env.example
├── docs/
│   ├── technical-design.md            # Architecture, schema and contracts
│   ├── acceptance-tests.md            # Product acceptance scenarios
│   ├── design-system.md              # Tokens, components, states, English copy
│   ├── data-model.md                 # Migrations and schemas
│   ├── privacy.md
│   └── roadmap.md
├── apps/
│   └── desktop/
│       ├── package.json
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   │   ├── MoodPicker/
│       │   │   ├── EnergySlider/
│       │   │   ├── EntryEditor/
│       │   │   ├── CalendarView/
│       │   │   ├── BookReader/
│       │   │   ├── TrendsCharts/
│       │   │   ├── DailyReflection/
│       │   │   ├── ProgressTimeline/
│       │   │   ├── TagExplorer/
│       │   │   ├── KeywordTrends/
│       │   │   ├── GoalCounters/
│       │   │   └── CBTGuidedFlow/
│       │   ├── features/
│       │   │   ├── journal/
│       │   │   ├── emotions/
│       │   │   ├── calendar/
│       │   │   ├── reader/
│       │   │   ├── analytics/
│       │   │   ├── reflection/
│       │   │   ├── tags/
│       │   │   ├── goals/
│       │   │   └── cbt/
│       │   ├── styles/
│       │   └── tests/
│       └── src-tauri/
│           ├── src/
│           ├── capabilities/
│           └── migrations/
├── packages/
│   └── analytics-python/
│       ├── pyproject.toml
│       ├── src/through_the_days_analytics/
│       │   ├── cli.py
│       │   ├── import_chatgpt.py
│       │   ├── classification.py
│       │   ├── metrics.py
│       │   ├── reporting.py
│       │   ├── keyword_metrics.py
│       │   └── topic_extraction.py
│       └── tests/
├── tests/fixtures/                   # Synthetic data only
└── .github/workflows/
    └── ci.yml                        # Never upload personal data to CI
```

### Essential `.gitignore`

```gitignore
.env
.env.*
!.env.example
.DS_Store
node_modules/
dist/
build/
**/target/
__pycache__/
.pytest_cache/
.venv/
data/
private/
backups/
*.sqlite
*.sqlite3
*.duckdb
*.db
*.zip
conversations.json
*.pem
*.key
```

**Caution:** `.gitignore` cannot remove secrets or journal content that were already committed. Review tracked content **before** every `git add`/`git push`, particularly when working with an agent.

---

## 19. Data contracts and implementation interfaces

### 19.1. Additional SQLite schemas (illustrative)

```sql
-- Add appropriate foreign keys and created_at_utc/updated_at_utc columns.
-- These ALTER statements are examples for upgrading an existing database.
-- For a fresh database, include the fields in the initial CREATE TABLE.
ALTER TABLE journal_entries ADD COLUMN pride_score INTEGER
  CHECK (pride_score IS NULL OR pride_score BETWEEN 1 AND 10);
ALTER TABLE journal_entries ADD COLUMN proud_of TEXT;
ALTER TABLE journal_entries ADD COLUMN daily_difficulty TEXT;
ALTER TABLE journal_entries ADD COLUMN next_small_step TEXT;

CREATE TABLE tracked_goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('avoid', 'reduce', 'build')),
  started_at_utc TEXT NOT NULL,
  local_timezone TEXT NOT NULL,
  target_json TEXT, -- reduction target or habit schedule
  visibility_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE goal_events (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES tracked_goals(id),
  occurred_at_utc TEXT NOT NULL,
  event_kind TEXT NOT NULL, -- urge, lapse, resumed, activity, correction, ...
  note TEXT,
  manual_confirmation INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL
);
CREATE TABLE goal_periods (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES tracked_goals(id),
  start_at_utc TEXT NOT NULL,
  end_at_utc TEXT
);
CREATE TABLE entry_actions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  label TEXT NOT NULL,
  category TEXT,
  occurred_at_local TEXT
);
CREATE TABLE cbt_sessions (
  id TEXT PRIMARY KEY,
  entry_id TEXT REFERENCES journal_entries(id),
  exercise_type TEXT NOT NULL, -- thought_record, activation, problem_solving
  status TEXT NOT NULL,        -- draft, complete, paused
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE TABLE cbt_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cbt_sessions(id),
  step_key TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('user', 'llm_suggestion_accepted'))
);
CREATE TABLE keyword_definitions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('exact', 'lexical_family', 'semantic_topic')),
  lexicon_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1
);
```

**Other tables requiring DDL, migrations and tests:** `tags`, `tag_aliases`, `entry_tags`, `day_tags`, `entry_reflections`, `goal_milestones`, `keyword_matches`, `analysis_runs`, `cbt_action_plans`, `llm_requests`. Implement the full DDL before developing the corresponding phases. Do not run these `ALTER` statements against a fresh database that already contains the columns.

### 19.2. Service contracts (pseudo-TypeScript)

```ts
type EntrySlot = 'morning' | 'evening';
type SourceKind = 'journal' | 'chatgpt';
type GoalMode = 'avoid' | 'reduce' | 'build';
type KeywordMethod = 'exact' | 'lexical_family' | 'semantic_topic';

interface DailyCheckIn {
  entryId: string; entryDate: string; slot: EntrySlot;
  valenceScore?: number; energyScore?: number;
  prideScore?: number; progressScore?: number; proudOf?: string;
  actions: Array<{ label: string; category?: string }>;
  dailyDifficulty?: string; nextSmallStep?: string;
}
interface TimelineDay {
  date: string;
  morning?: { valence?: number; energy?: number; pride?: number; progress?: number };
  evening?: { valence?: number; energy?: number; pride?: number; progress?: number };
  actionsCount: number; hasEntry: boolean;
}
interface KeywordStats {
  keywordId: string; method: KeywordMethod; source: SourceKind | 'both';
  fromDate: string; toDate: string;
  occurrences: number; entriesWithMatch: number; distinctDays: number;
  wordsInScope: number; per1000Words: number | null;
  coverageDays: number; corpusVersion: string;
}
interface GoalSnapshot {
  goalId: string; mode: GoalMode; asOfUtc: string;
  elapsedFull24hDays?: number; elapsedLocalCalendarDays?: number;
  periodsCount: number; milestoneIds: string[];
}
interface CbtSession {
  id: string; entryId?: string;
  exerciseType: 'thought_record' | 'activation' | 'problem_solving';
  status: 'draft' | 'paused' | 'complete';
  userAnswers: Record<string, string>;
}
```

### 19.3. Required application commands

| Command / API | Responsibility | Constraints |
|---|---|---|
| `save_daily_checkin` | Create/edit check-in and actions | Atomic transaction; validated scores |
| `get_timeline` | Aggregate previous 7/14/30 days | Explicit missing data; consistent across Calendar and Book |
| `upsert_tag` / `approve_tag_suggestion` | Manage tags and AI suggestions | Never auto-approve |
| `get_keyword_stats` | Count matches, entries and days | Explicit method, source and date range |
| `create_goal` / `record_goal_event` | Manage counters and events | Lapse/reset requires manual confirmation |
| `get_goal_snapshot` | Compute counters based on date convention | Explicit units and time zone |
| `start_cbt_session` / `save_cbt_step` | Persist guided CBT worksheets | Must work without LLM |
| `suggest_cbt_next_step` | Optional LLM support | Consent, schema validation, no automatic changes |

Milestone 1 delivers the journal commands defined in `apps/desktop/src/api/types.ts` and `apps/desktop/src-tauri/src/commands.rs`: entries (`entries_on`, `save_entry`, `get_entry`, `list_entries`), trash, preferences, backups, restore, protected migration, startup retry and erasure. The other rows belong to later milestones.

**Cross-cutting invariants:** minimal Tauri permissions, parameterised SQL, no arbitrary filesystem paths supplied by renderer, no API keys in logs, correct recalculation after edits, HTML escaping/sanitisation, tested backups, and exclusively synthetic CI fixtures.

### 19.4. Product usefulness metrics (hypotheses, not claims)

Do not define success solely by fewer negative words or longer unbroken streaks. Also measure **ease of entry**, explicitly recorded helpful actions, voluntarily completed exercises, subjective satisfaction and perceived usefulness. Obtain user feedback without claiming clinical causality.

---
