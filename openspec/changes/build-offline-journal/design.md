# Design for build the first usable offline journal

## Context

See proposal.md for product motivation and scope. Milestone: 1 (product-roadmap phases 0–1, with backup/restore advanced by D-005). No product dependency; this is the first implementation milestone.

Status: implemented development design. See `tasks.md` and `docs/milestone-1-status.md` for actual evidence and remaining native acceptance. Later milestone choices remain separate; this change is not archived.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

The first journal needs no hosted backend, account model, bundled Python, or model runtime.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§0–5, 10–14, 19–22; decisions D-001–D-007. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Implementation approach

`crates/journal-core` owns validation, SQLite and recovery behind the Rust/Tauri commands. One validated entry aggregate contains the canonical Tiptap JSON document, answers, actions and wins; indexed identity/date/slot/revision columns enforce conflict-safe saves (ADR 0003). React never supplies arbitrary filesystem paths or SQL. Markdown is derived from the canonical document.

The native adapter uses system dialogs, a device-local backup plan and optional Keychain storage. Waiting for a Keychain prompt or testing a backup folder does not hold the journal lock. Startup status is finalised before it is reported; protected upgrades, failed opens and damaged-journal recovery have distinct states. A damaged journal and its companions are kept aside before a validated replacement is installed. Explicit application erasure also removes those managed set-aside files, leaving independent backup copies alone.

### Appendix refinements

Writing depth changes presentation, never entry identity. Quick/Daily remain usable before Deep Reflection's manual worksheet exists in milestone 3. A mode choice and suggested durations are skippable.

Schema 2 stores nullable progress (1–10), learning/helped answers and other reflection fields inside the entry aggregate. Missing older fields default without inventing scores; protected migrations and historical fixtures verify preservation. No competing reflection table is introduced.

Explicit small wins have stable IDs, date, source/origin and visibility within their owning entry aggregate. Existing pride text remains a reflection; explicit promotion creates one linked win idempotently. Rest and unapproved suggestions never automatically create a win. Reports in later milestones count canonical win IDs.

Gentle view composes existing visibility and prompt controls as one preference. It does not erase values or suppress persistence failures and backup prompts. Expanded templates, timelines, and AI remain in their own milestones.

### Derivative data and recovery policy

All later indexes, embeddings, cached summaries, and pinned excerpts follow the source's active/visibility state; exclude them at query time immediately when a source is removed, even before background rebuilding. Clearing generated data preserves original writing and authored notes. Full application-data erasure includes managed derivatives/credentials and accurately describes independently held backup/export copies.

An existing journal must have a consistent encrypted pre-migration recovery snapshot before upgrading. If a passphrase or valid snapshot is unavailable, pause the upgrade safely. The journal itself can prevent the snapshot, for example with a damaged page, so a failed upgrade also offers the recovery of a journal that cannot be opened: a validated backup replaces it while it is kept aside, or application data is erased. Fresh database creation is not an existing-data migration. These rules refine recovery rather than changing the confirmed daily/catch-up backup schedule.

### Verification interfaces

Exercise journal save/load/lifecycle through its command-facing interface using real temporary SQLite databases and synthetic entries. Verify renderer behavior with component/browser tests, and Mac window/keyboard/VoiceOver behavior in a native launch. Inject persistence failures and crash after an acknowledged revision. Verify backup/restore in a clean destination.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

A close event can race a pending save: flush before supported window-close/app-quit flows, retain failures for retry and recover the last acknowledged revision. Missing renderer replies, timeout, event emission or timer failures keep the app open; a matching timeout permits a later quit retry and stale timers cannot cancel newer requests. macOS-initiated termination paths remain a documented limitation in `docs/product-decisions.md`. Trash and backups retain sensitive content: explain retention without promising forensic erasure. Live SQLite is not application-encrypted.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

Backups use authenticated age-v1 passphrase encryption over a consistent canonical SQLite snapshot, with bounded scrypt work, verification before publication and cleanup on failure. `docs/backup-format.md` records the format and recovery contract. Rust tests cover decryption failures, corruption, clean restore, interrupted publication and preservation of the previous valid journal.

Daily backup runs while active and catches up at launch, using a folder selected in settings. Keep the 30 latest validated backups (D-009), pruning only after a verified replacement succeeds. Changed passphrases apply to future snapshots; older files retain their original key. A portable passphrase can be remembered in Keychain; unavailable credentials leave backup pending and writing usable. The 30-day Trash policy is separate.

## Decision gates

D-006/D-007/D-009 and the backup contract resolve O-009. Editor fidelity, schema constraints, acknowledged saves and completion transitions are covered by the implementation suites. Manual native acceptance remains in the original tasks and the supplementary native checklist.

Keep failed or unexecuted acceptance unchecked. Sync only verified behaviour into main specifications and archive this change only after every tracked task is delivered.
