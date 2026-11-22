# Through the Days — Product Intelligence & Progress Features

> **Document:** `appendix.md`
> **Version:** 0.1 (product specification)
> **Companion document:** [`README_THROUGH_THE_DAYS.md`](README_THROUGH_THE_DAYS.md), product requirements v0.6
> **Platform:** macOS, local-first
> **Product language:** English (`en-GB`) for all application-owned UI, notifications, generated reports, CBT guidance, and AI output. Never translate personal writing without consent.
> **Status:** Proposed enhancements; not implemented.

---

> **Integration status:** Historical proposal incorporated selectively into [product requirements v0.7](README_THROUGH_THE_DAYS.md) and OpenSpec. See [the integration assessment](docs/appendix-integration.md) for canonical ownership, deferrals, and rejected alternatives. In particular, per-request remote consent and the previously confirmed backup/trash policies remain authoritative.

## 1. Purpose and relationship to the README

**Through the Days** should help a person remember what happened, recognise effort even on difficult days, test useful behavioural strategies, and see meaningful change over time. It should not merely chart distress or maximise the frequency of self-monitoring.

This appendix specifies enhancements to the existing journal/check-in, calendar, book reader, timeline, tags, counters, keyword analytics, CBT companion, and ChatGPT-import roadmap. **It extends, rather than replaces, the README.**

### Interpretation and precedence

- Keep existing core choices: Tauri 2 + React/TypeScript, local SQLite, optional Python/DuckDB analytics, two primary journal slots (`morning`, `evening`), English-only UI, local-first storage, explicit AI consent, original design inspired by—not copied from—other products.
- A feature in this appendix may add optional data, views or services without changing the existing entry's identity, date, or slot.
- If a proposed enhancement conflicts with an existing README requirement, maintain the safer, more privacy-preserving behaviour until an explicit architecture decision record (ADR) resolves it.
- **Do not weaken the current completion rule** (non-empty entry text plus mood and energy) merely because a new optional metric is blank. Drafts and quick check-ins may remain partial.
- All examples in this document are fictional. No clinical benefit or AI accuracy is claimed.

### Product success principles

1. **Reflection before optimisation:** help the person understand a day, not earn a perfect score.
2. **Effort matters independently of mood:** a hard day can contain a meaningful win.
3. **Small experiments beat endless analysis:** offer one actionable next step, then review what happened.
4. **Evidence over storytelling:** any historical observation links to dated user-authored sources.
5. **Personal agency:** every AI suggestion, reminder, comparison and counter can be declined, hidden or deleted.
6. **Compassionate defaults:** no punitive streaks, crisis-risk scores, unsolicited diagnoses or claims about someone else's motives.

---

## 2. Feature overview and priorities

| ID | Feature | User benefit | Delivery tier |
|---|---|---|---|
| INT-01 | Flexible three-depth journaling | Write even when tired; no mandatory long questionnaire | P0 |
| INT-02 | Four-dimensional check-in | Separate mood, energy, pride and perceived progress | P0 |
| INT-03 | CBT-to-action experiments | Turn reflection into a small, reviewable action | P0/P1 |
| INT-04 | Evidence-backed personal memory | Recall real examples of efforts and changes | P1 |
| INT-05 | Weekly review | Create a humane summary with user verification | P1 |
| INT-06 | **The Path So Far** | Explore a long-range timeline of meaningful change | P1 |
| INT-07 | Ask My Journal | Ask natural-language questions with source citations | P2 |
| INT-08 | Personal Patterns | Explore associations, with uncertainty and coverage | P2 |
| INT-09 | Extended CBT exercise library | Select an exercise appropriate to the situation | P2 |
| INT-10 | Privacy, export and reversible AI | Keep user content portable and under user control | P0, then hardening |

P0/P1/P2 describe relative priority, not delivery dates. The README's existing phase plan remains authoritative; see §13 for mapping.

---

## 3. INT-01 — Three journaling depths

### User experience

At any entry creation point (Today, Calendar, Book, menu shortcut), present a light-weight mode choice, **never a gate**:

| Mode | Suggested duration (not a timer) | Essential flow |
|---|---|---|
| **Quick Check-in** | About 30 seconds | Optional mood, energy, emotion and one sentence; save as draft if incomplete |
| **Daily Journal** | About 5–10 minutes | Mood, energy, today's actions, pride, progress, free writing |
| **Deep Reflection** | About 15–20 minutes | Daily Journal + one optional structured CBT worksheet |

Required controls: **Skip**, **Write directly**, **Save as draft**, **Back to journal**. Changing depth must **preserve all typed text and selected values**; never create a second entry for the same `(date, slot)`.

### Design constraints

- Modes change presentation, not the underlying entry model. A Morning or Evening entry can switch modes without data loss.
- Do not require completion of every card to reach the editor. Autosave progressively.
- The user can disable suggested durations and all nudges.
- No nagging language such as *"You broke your routine"*. A day without an entry is an **unrecorded day**, not a failure.
- In accessibility or reduced-motion settings, no animated check-in gate.

**Acceptance cases**

- Given an unfinished Quick Check-in, switching to Deep Reflection retains the exact draft and check-in values.
- Given low or missing energy, the application never assumes the user wants an extended exercise.
- One calendar day still has at most one Morning and one Evening primary entry.

---

## 4. INT-02 — Four distinct daily dimensions

The existing check-in tracks emotional valence (mood), energy, and optional pride. Add **optional perceived progress** as a fourth dimension, not as a proxy for mental health.

| Measure | Range | Example English question | Interpretation |
|---|---|---|---|
| **Mood** (`valence_score`) | 0–10 | “How pleasant or unpleasant does today feel?” | Self-reported emotional valence, not a clinical scale |
| **Energy** (`energy_score`) | 0–10 | “How much energy do you have?” | Self-reported energy |
| **Pride** (`pride_score`) | 1–10, nullable | “How proud are you of the way you showed up today?” | Optional personal appraisal |
| **Sense of progress** (`progress_score`) | 1–10, nullable | “How much do you feel you moved forward today?” | Optional subjective progress; **not** derived from mood |

### Progress beyond the scores

Optional prompts, never mandatory:

- **“What did you do today?”** — a few self-reported actions or activities.
- **“What are you proud of, even if it was small?”** — a short free-text win.
- **“What helped, even a little?”** — coping strategies or supportive contexts.
- **“What did you learn?”** — optional reflection.
- **“What's one gentle step for tomorrow?”** — optional intention, not an obligation.

Use accessible numeric values and descriptive labels. **Do not combine all four values into a single mental-health score**, rank the user's days, or infer psychiatric severity.

### Daily versus entry-level display

- Each Morning/Evening entry may store its own four values.
- In Calendar and **The Path So Far**, show individual entry values or a clear aggregation label such as “Evening” or “Average of 2 check-ins”.
- Never silently treat `NULL` as `0`; show a gap / “Not recorded”.
- Aggregation is opt-in and must disclose the rule.

### Small win library

- A win is either **user-entered**, or an **AI suggestion confirmed by the user**.
- Store a dated, editable item with an optional category (social, learning, rest, movement, work, self-care, other).
- Rest can be described as a win **only if the user identifies it as meaningful**; do not impose a positive interpretation.
- Wins are shown in reviews with links to their original entry and can be hidden from analytics.

---

## 5. INT-03 — CBT exercises that lead to real-world experiments

### Goal

Move from *“I thought about this”* to *“I tried something, observed what happened, and learned from it.”* Use CBT-informed structured reflection, not claims of therapy provision.

### Experience: Explore → Choose → Try → Review

1. **Explore** — the user starts a worksheet explicitly; use the README's thought record / behavioural activation / problem-solving flows.
2. **Choose** — the assistant offers **at most two** feasible action ideas, with a brief rationale. The user accepts, edits, creates their own, or chooses **No action**.
3. **Try** — schedule an optional **behavioural experiment** with an objective, predicted outcome, manageable step, expected effort, and an optional contingency (“If X happens, I'll try Y”).
4. **Review** — at the chosen date/time, ask one concise question: **“Did you try the step you chose?”** Responses: **Done**, **Partly**, **Not yet**, **No longer relevant**, **Skip**.
5. **Learn** — optionally compare prediction with outcome and save a short lesson, without demanding that the person feel better.

### Illustrative card

```text
SMALL EXPERIMENT                                    Planned for tomorrow

Thought: "I never make progress."
Step: Write down one concrete thing I accomplished.
Prediction: "I won't think of anything."
Effort: Low

[Edit] [Try tomorrow] [Don't schedule]

NEXT-DAY REVIEW
Did you try this step?
[Done] [Partly] [Not yet] [No longer relevant] [Skip]

What did you notice? [Optional free text]
[Save reflection]
```

### Rules and anti-loop protection

- Action plans are **suggestions, not assignments**. The assistant must never mark a step completed or “failed”.
- Avoid prescriptive exposure, unsafe or medically consequential tasks, coercion, and advice to repeatedly check another person's activity or social media.
- A user may edit a prediction and result retrospectively with revision history; original timestamps remain auditable.
- After repeating the same thought-record topic without new information, offer **“Pause this topic”**, **“Try one small action”**, **“Return to writing”**. Do not trap the person in repeated reassurance-seeking.
- Daily reminders are off by default; at most **one optional review reminder per planned experiment** unless configured otherwise.
- Show participation counts (experiments tried, lessons recorded) descriptively, never as a treatment outcome or success percentage without clear denominator.

**Acceptance cases**

- No AI call is necessary for a deterministic worksheet or a manually created experiment.
- An unconfirmed AI suggestion is never stored as a user decision.
- Skipping or postponing a step does not create a negative mood or pride score.
- Deleting an experiment removes it from the timeline and derived analytics after reindexing.

---

## 6. INT-04 — Evidence-backed personal memory

### Experience: Looking Back

When the user asks for perspective, the app can surface older, **real** journal passages about similar situations or earlier efforts.

Example request: **“Have I made any progress with getting out more?”**

A valid response should display:

1. A **modest, evidence-qualified summary** (e.g., “You recorded several outings during the last month”).
2. Two to five **dated source excerpts** with a **Read entry** action.
3. A coverage statement: **“Based on 9 journal entries between [date] and [date].”**
4. An explicit option: **“That's not how I see it”** or **“Hide this interpretation”**.

### Technical design

- Implement a local search index first (SQLite FTS5 over user-approved text), then optional local embeddings for semantic retrieval.
- Search across entry text, optional win descriptions, CBT actions and reflections, subject to source visibility permissions.
- Index and cache at the **excerpt/chunk level**, each with a stable provenance pointer: `source_type`, `source_id`, `chunk_id`, offsets/range and content hash.
- **Retrieval is not evidence of truth:** distinguish *“You wrote…”* from *“It appears…”*. User reports are not independently verified events.
- A quote must match a saved source span (after clearly marked whitespace normalisation if necessary). If there is no credible supporting passage, say **“I couldn't find enough relevant entries to answer.”**
- Never fabricate a date, quote, activity, improvement, motive, causal explanation or source link.
- Never silently mix ChatGPT-derived events with journal-authored data; expose source filters.

### Optional memory cards

A user can pin a **“Moment worth remembering”** card. Pinned items remain editable/removable and do not become permanent model memory outside the local app.

---

## 7. INT-05 — Weekly reflection

### Trigger and format

- Default: user opens **Weekly Review** from the app; optional local reminder only with opt-in.
- Weeks use ISO weeks, **Monday–Sunday**, in the configured local timezone (`en-GB` display).
- Source snapshot and `from_date`/`to_date` are stored with each generated review.
- Weekly reviews can be regenerated when entries are edited; preserve user annotations and mark generated summaries as stale.

### Suggested sections

```text
YOUR WEEK IN REVIEW                   16–22 November (illustrative)

5 days with entries · 4 recorded small wins · 2 CBT exercises

WHAT FELT IMPORTANT?
[User-entered or AI-supported summary, with linked entries]

WHAT HELPED?
[Reported activities or coping strategies; no causal claims]

WHAT WAS CHALLENGING?
[Optional, non-judgmental reflection]

WHAT DID YOU TRY?
[Experiments: Done / Partly / Not yet / No longer relevant]

ONE QUESTION FOR NEXT WEEK
"What would make the coming week feel meaningful?"

[Edit summary] [Save reflection] [View sources] [Hide numbers]
```

### Computation rules

- **Days with entries** = number of distinct dates containing at least one user-authored entry, not entry count.
- **Recorded small wins** = count of saved, user-approved win items within the interval, not inferred success.
- **CBT exercises** = explicitly started sessions; report completed sessions separately if shown.
- A week with no entries is *“No entries recorded”*, not *“Bad week”*.
- User-added review notes remain user-authored; generated text must be labelled **AI summary** and editable/deleteable.
- If only one or two days contain entries, do not make broad claims about trends.

**Acceptance cases:** a changed entry invalidates the cached weekly review; a source link resolves to the correct day and slot; a review remains usable with AI disabled.

---

## 8. INT-06 — The Path So Far (signature experience)

### Concept

A calm, explorable **long-range personal timeline** that connects days, meaningful events, practical experiments, and evolving themes. Its purpose is to help answer **“What have I lived through, what have I tried, and what has changed?”**

### Timeline layers (togglable)

1. **Check-ins:** mood, energy, pride, perceived progress, with separate scales and missing-data gaps.
2. **Journal chapters:** week/month boundaries and dated entry links.
3. **Small wins:** user-approved accomplishments.
4. **Experiments and lessons:** planned action, reviewed outcome and lesson learned.
5. **Themes and tags:** user-approved tags; optionally supported semantic clusters.
6. **Goals / counters:** milestones and history, only if the user explicitly enables this layer.
7. **Imported conversations:** optional ChatGPT conversation-derived themes, visibly marked as imported.

### Navigation

- Time scale: **7 days / 30 days / 90 days / 1 year / custom**.
- Zoom, keyboard navigation, scroll/pan, and source-type filters.
- Selecting a day opens the existing day panel; **Read in Book** moves the reader to that date without losing the current search/filter context.
- An optional bottom-of-page **mini timeline** in the editor and book view focuses on the last 7/14/30 days; hide in focus mode.
- A user can add manual, private milestones like **“First pottery class”**, **“Tried a new routine”**, or **“Important decision”**, without presenting them as clinical outcomes.

### Visual and psychological safety

- Neutral design, accessible colour and text labels; never make distress days appear as failures.
- Avoid a single red/green *“life is getting better/worse”* gauge.
- Offer **Hide scores**, **Show only recorded wins**, **Hide counters**, and **Gentle view**.
- No auto-generated sentiment label like *“Your worst month”*.
- **Missing data must remain visually missing**; no invented interpolation without explicit toggle and legend.

### Example interaction

```text
THE PATH SO FAR
[7D] [30D] [90D] [1Y]    [Wins ✓] [CBT ✓] [Mood ✓] [Counters ○]

Nov 02       Nov 09       Nov 16       Nov 23
  |------------|------------|------------|
  • Recorded a small win      ◇ Tried a behavioural experiment
           ■ New reflection    ○ No check-in recorded

Selected: 16 November
  Mood: 4/10 · Energy: 3/10 · Pride: 7/10
  One small win: [user-authored snippet]
  [Read day] [Open experiment] [View source]
```

---

## 9. INT-07 — Ask My Journal: conversational exploration

### Suggested entry points

- Global **Ask My Journal** tab; **Ask about this week** from Weekly Review; **Explore related entries** from Book/Calendar.
- Suggested questions:
  - “What have I been thinking about most this month?”
  - “When did I feel proud of myself?”
  - “Which activities did I mention on higher-energy days?”
  - “Which CBT exercises did I actually try?”
  - “What changed between October and November?”

### Required answer structure

```ts
type JournalAnswer = {
  question: string;
  answer: string;              // English, qualified, source-based
  evidence: Array<{
    sourceType: 'journal_entry' | 'cbt_session' | 'chatgpt_message' | 'weekly_review';
    sourceId: string;
    date: string;              // YYYY-MM-DD, local date or clearly marked source date
    excerpt: string;           // exact/traceably normalised quotation
  }>;
  dataCoverage: {
    dateFrom: string;
    dateTo: string;
    daysWithEntries: number;
    sourcesConsidered: number;
  };
  limitations: string[];
  inferenceLevel: 'descriptive' | 'exploratory';
};
```

### Response rules

- Present the sources **first-class**: clickable, dated, and filterable.
- The assistant should distinguish **counted facts**, **quoted statements**, **interpretations** and **open questions**.
- Search scope is explicit: journal only by default, user-enabled sources afterward.
- If a question has insufficient evidence, answer that plainly; do not substitute affirmations for missing data.
- Before remote inference, show a granular preview of exactly which snippets and fields will be transmitted; explicit opt-in each time unless the user has actively enabled a clearly scoped persistent permission.
- AI cannot write to or change journals, goals, emotion scores, saved CBT results or history from query output.
- Any sourced answer must be reproducible against a retained local data snapshot and analysis/prompt version.

---

## 10. INT-08 — Personal Patterns and reliable analytics

### Goal

Explore associations the user might find useful, without pretending to infer causes or diagnose a condition.

Examples: *“On days when I logged reading, what energy did I report?”* or *“How often did I record social activities in the last 30 days?”*

### Metrics and method contracts

| Metric | Definition | Caveat |
|---|---|---|
| Days with entries | Distinct local dates with ≥1 entry | Measures journaling, not wellbeing |
| Avg. evening energy | Arithmetic mean of recorded Evening scores in period | Show `n`; missing days excluded, never treated as zero |
| Pride / progress distribution | Histogram of non-null self-ratings | Subjective and not a validated mental-health measure |
| Logged action days | Distinct dates with a saved action of selected type | Not a complete record of actual behaviour |
| Keyword occurrences | Matched token/phrase count using chosen exact/lexical method | Mentions ≠ episodes |
| Mentioning days | Distinct recorded days containing a match | Show words-in-scope / corpus coverage |
| CBT action follow-up | Reviewed actions with explicit status | Missing follow-ups are **unknown**, not unsuccessful |
| Goal periods | Durations derived from manually confirmed events | Never infer lapses from text or ChatGPT requests |

For textual themes such as **rumination**, the product must keep three measures separate:

1. **Lexical mentions** of a configured word or family.
2. **Topic references** suggested by a semantic model (uncertain; must be labelled as such).
3. **Self-reported rumination episodes** explicitly entered by the user (when this optional event type exists).

The title “rumination count” must never ambiguously mix these measures. Include an optional **“Hide this metric”** control in case monitoring increases distress.

### Trend comparison rules

- Provide weekly and monthly series only when data exist; show the actual dates and denominator.
- Offer both **raw counts** and **normalised counts per 1,000 written words** where relevant.
- Allow comparing weeks/months without equal numbers of entries, but visually show coverage and warn about small `n`.
- Store model and dictionary versions; rescanning after a vocabulary/model change should produce new `analysis_run` records, not silently replace historical results.
- For correlations, show `n`, compared variables, time window and confounder warning. Say **“associated in these entries”**, not **“caused by”**.
- No automated diagnosis, relapse prediction, wellbeing forecast, or hidden distress classification.

---

## 11. INT-09 — Expanded CBT exercise library

Keep the existing three exercises from the README and add optional exercises with bounded, inspectable user-facing steps:

| Exercise | When a person may select it | Typical output |
|---|---|---|
| **Thought Record** (existing) | Revisit a distressing automatic thought | Evidence, balanced interpretation, optional next step |
| **Behavioural Activation** (existing) | Feeling stuck or avoiding meaningful actions | One feasible action and a review point |
| **Structured Problem-solving** (existing) | A practical problem with available choices | Options, selected next step, review |
| **Behavioural Experiment** (new) | Test a prediction in real life | Prediction, safe step, observation, learning |
| **Coping Estimate** (new) | Overestimating threat / underestimating coping | Concrete coping resources and uncertainty |
| **Positive Evidence Journal** (new) | Habitually overlooking achievements | User-selected evidence of effort or competence |
| **Values-to-Action Reflection** (new) | Feeling disconnected from meaningful activities | One personally chosen value and small action |

The model may offer **at most two context-appropriate exercises**, explaining why in one sentence. The user always makes the choice. All core templates must function **offline without an LLM**.

**Boundary:** This is a self-reflection and skills tool, not a diagnostic instrument, therapist, emergency service or a substitute for professional care. Do not encourage forced positive thinking or demand cognitive reframing for every painful feeling.

---

## 12. INT-10 — Privacy, export and portability

### Local-first requirements

- Journal content, metrics, indices and AI-derived information live on the device by default.
- Default AI mode is **off / manual worksheets**; optional local model can be enabled by the user, and remote providers require explicit, scoped consent.
- Keep API tokens in macOS Keychain. Never log private prompts, raw entries, embeddings, mood data or screenshots to standard output, CI, analytics telemetry or issue templates.
- Encryption-at-rest claims must correspond to the implementation (e.g., FileVault for device protection, or a correctly integrated encrypted database); plain SQLite is **not** encrypted by itself.
- Users can delete derived semantic indices, summaries and memory cards without deleting original entries; provide a full deletion path for all data.
- Any optional backup/export must clearly state destination and protection; never push the private journal to the public Hugo site or GitHub repository by default.

### Export formats

- **Markdown:** dated entries, slots and optional YAML front matter; user chooses whether to include mood/CBT/counter information.
- **JSON:** versioned, complete, machine-readable export including linkable IDs and provenance.
- **PDF:** human-readable private journal book, intentionally selected date range and content types.
- **CSV:** opt-in quantitative check-ins only, with clear field definitions and missing values preserved.

Round-trip **JSON import → export → import** must preserve core user data, entry identity, timestamps and confirmed CBT/action outcomes without duplication. Provide backups before migrations.

### Gentle view

A global **Gentle view** preference should:

- Hide negative trend interpretations and optional numeric score panels, without deleting data.
- Hide all addiction/abstinence counters and streak prompts unless re-enabled.
- Suppress unsolicited AI insights and automatic follow-up prompts.
- Keep the journal editor, calendar navigation, user-authored wins and manual CBT templates accessible.

---

## 13. Technical integration and data model additions

The main README already defines `journal_entries`, `entry_actions`, `cbt_sessions`, `cbt_answers`, `tracked_goals`, analytics tables and source provenance. **Reuse those entities.** Introduce the following additions through versioned SQLite migrations; exact migration ordering depends on the existing implementation.

### 13.1. Add optional progress score

**Conceptual migration (only if the column is not already present):**

```sql
ALTER TABLE journal_entries
  ADD COLUMN progress_score INTEGER
  CHECK (progress_score IS NULL OR progress_score BETWEEN 1 AND 10);
```

Do not execute this twice. Existing values are `NULL`, not zero. Keep the README's original `UNIQUE(entry_date, slot)` and completion policy.

### 13.2. Proposed new tables

```sql
-- User-owned, explicit wins; may link to an existing entry.
CREATE TABLE IF NOT EXISTS personal_wins (
  id TEXT PRIMARY KEY,
  entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  local_date TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('user', 'ai_confirmed')),
  include_in_insights INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_wins_date ON personal_wins(local_date);

-- Separate from the CBT session itself: an action the user decided to try.
CREATE TABLE IF NOT EXISTS behavioural_experiments (
  id TEXT PRIMARY KEY,
  cbt_session_id TEXT REFERENCES cbt_sessions(id) ON DELETE SET NULL,
  entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  proposed_step TEXT NOT NULL,
  predicted_outcome TEXT,
  effort TEXT CHECK (effort IN ('low', 'medium', 'high')),
  planned_for_local TEXT,
  local_timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'done', 'partly', 'not_yet', 'no_longer_relevant', 'cancelled')),
  actual_outcome TEXT,
  lesson_learned TEXT,
  user_confirmed INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  reviewed_at_utc TEXT
);
CREATE INDEX IF NOT EXISTS idx_experiments_planned ON behavioural_experiments(planned_for_local);

-- Reviews retain a source snapshot to support reproducible summaries.
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  week_start_local TEXT NOT NULL UNIQUE,
  week_end_local TEXT NOT NULL,
  statistics_json TEXT NOT NULL,
  generated_summary TEXT,
  user_notes TEXT,
  source_snapshot_hash TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  is_stale INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

-- Explicit user-defined moments on the long-range timeline.
CREATE TABLE IF NOT EXISTS timeline_milestones (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'hidden')),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_milestones_date ON timeline_milestones(local_date);

-- Optional pinboard: never cross-synchronised to a model's persistent memory.
CREATE TABLE IF NOT EXISTS pinned_memories (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_excerpt TEXT NOT NULL,
  source_content_hash TEXT NOT NULL,
  title TEXT,
  created_at_utc TEXT NOT NULL
);

-- Derived analysis is auditable and can be deleted independently.
CREATE TABLE IF NOT EXISTS insight_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source_scope_json TEXT NOT NULL,
  source_snapshot_hash TEXT NOT NULL,
  engine TEXT NOT NULL,
  model_or_rule_version TEXT NOT NULL,
  generated_at_utc TEXT NOT NULL,
  result_json TEXT NOT NULL
);
```

**Implementation notes**

- Add foreign keys, validation, migrations and revision/audit tables before shipping. Enable SQLite `PRAGMA foreign_keys = ON` for every connection.
- Avoid duplicating a win that is already stored as `journal_entries.proud_of`: choose a canonical representation/migration and document projections. The new `personal_wins` table is for **multiple user-approved wins per day**.
- A behavioural experiment is **not** equivalent to a relapse-prevention counter. `tracked_goals` and `goal_events` remain independent and are never modified by LLM output.
- Provenance pointers to an edited source may become stale; revalidate hashes on read and show **“Source changed”** rather than quoting outdated content as current.
- Mark insights and reviews stale whenever referenced user content is edited/deleted. Recalculation never rewrites the original journal.
- Full-text or vector indices are **derivative data**, not the authoritative store.
- If `week_start_local` alone is not unique for a future multi-profile implementation, scope it by profile ID; the current README assumes a single-user local application.

### 13.3. Suggested TypeScript services

```ts
interface ReflectionModeService {
  setMode(entryId: string, mode: 'quick' | 'daily' | 'deep'): Promise<void>;
}
interface ExperimentService {
  createFromApprovedStep(input: {
    entryId?: string; cbtSessionId?: string; step: string;
    prediction?: string; plannedForLocal?: string; timezone: string;
  }): Promise<string>;
  review(id: string, input: {
    status: 'done' | 'partly' | 'not_yet' | 'no_longer_relevant';
    actualOutcome?: string; lessonLearned?: string;
  }): Promise<void>;
}
interface JournalMemoryService {
  retrieve(query: string, sourceScope: string[]): Promise<Array<{
    sourceType: string; sourceId: string; localDate: string;
    quote: string; contentHash: string;
  }>>;
}
interface WeeklyReviewService {
  generate(weekStartLocal: string, includeAi: boolean): Promise<string>;
  markStaleForEntry(entryId: string): Promise<void>;
}
interface JournalInsightsService {
  answer(question: string, scope: string[], useRemoteAi: boolean): Promise<unknown>;
  clearDerivedData(kind?: string): Promise<void>;
}
```

### 13.4. AI processing contract

A deterministic **planner/retriever** should select relevant source snippets before an optional model produces natural language. Do not provide unrestricted tool execution to an LLM.

- Inputs: validated source snippets, source IDs, date window, user question, chosen exercise type, user-approved permission scope.
- Outputs: JSON validated against an exact schema (e.g. `answer`, `evidence`, `limitations`, `suggested_exercises`, `suggested_actions`).
- Every candidate quote must match an authorised source; reject unsupported references and hallucinated dates.
- AI can **suggest**, not commit changes. A user action is required to create a win, experiment, tag, milestone, goal event or saved reflection.
- If model calls fail: show deterministic counts or local-search results and allow manual entry; do not block the journal.
- API prompt version, provider/local model ID, source snapshot hash and consent scope go into local **metadata-only logs**. No private request/response logging by default.
- Because journal material may contain instructions written as ordinary text, treat all retrieved entries and imports as **untrusted content** (never as commands or authority over app behaviour).

---

## 14. User-facing English copy guide

Use concise, human, non-judgmental language rather than technical jargon:

| Context | Preferred copy | Avoid |
|---|---|---|
| Empty day | “Nothing recorded for this day.” | “You missed a day.” |
| Hard day | “Would you like a shorter check-in?” | “You need to work harder.” |
| Pride | “What are you proud of, however small?” | “List your achievements.” |
| Experiment review | “What did you notice?” | “Did you succeed or fail?” |
| Analytics uncertainty | “Based on the days you recorded…” | “Your mood improved because…” |
| No evidence | “I couldn't find enough entries to answer.” | “You've definitely become more confident.” |
| AI consent | “Review what will be shared” | “Enable magic insights” |
| Counter visibility | “Hide this counter” | “Don't break your streak” |
| Gentle view | “Keep things simple for now” | “Disable negative feedback” |

App name is always **Through the Days** (proper title case). The tagline from the README remains: **“Every day you make it through becomes another page.”**

---

## 15. Screen and navigation integration

Add without displacing the existing Today / Calendar / Book / Trends / CBT / Goals screens:

```text
Through the Days
├── Today
│   ├── Quick Check-in / Daily Journal / Deep Reflection
│   ├── Four measures (optional pride + perceived progress)
│   ├── What I did / My small wins
│   └── Mini timeline / optional next-step review
├── Calendar
│   └── Day view → entry / wins / optional counters
├── Book
│   └── Read / keyword exploration / source-backed related entries
├── The Path So Far                 [NEW]
│   ├── 7 / 30 / 90 days / 1 year
│   └── Wins / CBT experiments / check-ins / milestones / filters
├── Insights
│   ├── Trends and Keywords
│   ├── Weekly Review              [NEW]
│   ├── Personal Patterns          [NEW, later]
│   └── Ask My Journal             [NEW, later]
├── CBT Companion
│   ├── Existing guided exercises
│   ├── One Small Step / Behavioural Experiments
│   └── Exercise Library           [NEW, later]
├── Goals & Counters
└── Settings
    ├── Gentle view
    ├── Data sources and permissions
    ├── AI providers and consent
    ├── Backups and exports
    └── English-only app language
```

The initial implementation may make **The Path So Far** an Insights sub-tab to reduce navigation complexity; the route/component ID should remain stable.

---

## 16. Verification and acceptance tests

All test fixtures must be synthetic. Tests should assert both correct calculations and **absence of invented claims**.

| ID | Given | When | Expected result |
|---|---|---|---|
| TEST-01 | A partial morning draft | Switching between Quick/Daily/Deep | Same entry ID; no lost text or scores |
| TEST-02 | A 0–10 mood score and no progress score | Saving a draft | `progress_score = NULL`, never zero |
| TEST-03 | A bad-mood day with a recorded win | Opening The Path So Far | Both coexist; no contradictory “failed day” label |
| TEST-04 | Three journal entries on two dates | Building weekly stats | `days_with_entries = 2` |
| TEST-05 | A proposed AI action | User declines | No experiment stored |
| TEST-06 | A saved experiment marked “Not yet” | Generating a review | Status remains neutral; no failure score |
| TEST-07 | An entry changes after review generation | Opening Weekly Review | Review marked stale; regenerate option shown |
| TEST-08 | A personal-memory query with matching entries | Generating insight | Every quoted passage links to a real dated source |
| TEST-09 | A memory query with no evidence | Generating insight | States insufficient evidence; creates no quotes |
| TEST-10 | An entry is removed | Rebuilding search index | Deleted text no longer appears in insights |
| TEST-11 | 2 check-ins on one date | Plotting check-ins | Display two values or labelled aggregate, not two days |
| TEST-12 | Missing week of entries | Rendering timeline | Gaps remain gaps; no zero mood or trend claim |
| TEST-13 | Unequal word counts across months | Comparing “rumination” | Show count, per-1,000-word rate and coverage; do not call mentions episodes |
| TEST-14 | A remote AI request | No explicit permission | No network transmission; local fallback |
| TEST-15 | Private journal + public Hugo build | Building/publication | No raw notes, private indices or CBT records in generated site |
| TEST-16 | A user hides a counter | Rendering all views | Counter hidden in Today, Calendar and Path So Far |
| TEST-17 | Gentle view enabled | Navigating analytics | Optional distress metrics and streak elements hidden, journal intact |
| TEST-18 | AI is disabled/offline | Creating a CBT worksheet | Manual template works end-to-end |
| TEST-19 | User text includes malicious prompt-like strings | Running AI insight | Content treated as data; no permission override or external actions |
| TEST-20 | macOS language set to French | Launching app | All first-party UI and AI guidance remain in English |
| TEST-21 | A derived summary and pinned memory exist | Deleting derived AI data | Derived records/indices deleted; original journal unchanged |
| TEST-22 | Export → import of the same JSON twice | Reimporting | Preserves data; no duplicates or new counters |

Automated test coverage should include schema constraints, date boundaries/DST, empty datasets, index invalidation, source-scoped retrieval, consent, autosave/recovery and keyboard/VoiceOver access.

---

## 17. Suggested implementation sequence

### Increment A — Improve the core journal (P0)

- [ ] Implement mode choice (Quick / Daily / Deep) without separate storage silos.
- [ ] Add optional `progress_score` to entry and check-in UI.
- [ ] Add user-owned small wins and *“What helped?”* prompts.
- [ ] Add **Gentle view**, hideable scores, and neutral empty states.
- [ ] Write validation, autosave and draft-preservation tests.

### Increment B — CBT becomes actionable (P0/P1)

- [ ] Add manual behavioural experiment creation from a CBT session.
- [ ] Add prediction, review status, observation and lesson fields.
- [ ] Implement optional one-off review reminder, disabled by default.
- [ ] Allow local LLM to propose **no more than two** actions, only after explicit initiation.
- [ ] Validate user approval, offline fallback and anti-rumination loop handling.

### Increment C — Review and timeline (P1)

- [ ] Add Weekly Review with correct deterministic summaries and source links.
- [ ] Add **The Path So Far** timeline with layers and navigation to Calendar/Book.
- [ ] Add user-created milestones and optional pinned memories.
- [ ] Implement `source_snapshot_hash`, staleness and invalidation after edits.

### Increment D — Semantic intelligence (P2)

- [ ] Build local full-text indexing and source-verifying retrieval.
- [ ] Add **Ask My Journal** with answer evidence and coverage.
- [ ] Add **Personal Patterns**, transparent denominators and uncertainty.
- [ ] Add expanded offline CBT exercise templates and optional AI suggestions.
- [ ] Ensure ChatGPT imports stay optional, source-labelled and non-mutating.

### Increment E — Security and distribution (continuous)

- [ ] Implement and test export / import formats and backups.
- [ ] Conduct a privacy and redaction review of logs, cloud permissions, Git/CI and Hugo build.
- [ ] Test app offline, with missing/failed AI provider, on supported macOS targets.
- [ ] Verify accessibility, keyboard navigation, English-only UI and local timezone handling.

---

## 18. Definition of Done for this appendix

This appendix is considered implemented when a person can:

1. Journal in a lightweight, standard or in-depth mode with no lost drafts.
2. Record four independent dimensions when desired, including optional pride and perceived progress.
3. Save a small win without being compelled to reframe a difficult day positively.
4. Choose a self-directed CBT step and later record **what happened**, not just whether a streak continued.
5. See a source-backed weekly review and follow links to original entries.
6. Explore **The Path So Far** with honest gaps, configurable layers, and direct reading navigation.
7. Ask a question about past entries and receive either source-verified evidence or a clear admission of insufficient evidence.
8. Hide all optional tracking/counter panels and use the journal fully offline.
9. Export and recover original content without leakage to public GitHub/Hugo assets.
10. Use all application-supplied UI, exercise prompts and generated reports in English.

**Product north star:** *Help people notice what they have lived through, what they have tried, and what has changed—without turning personal reflection into another obligation.*
