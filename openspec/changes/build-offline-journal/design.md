# Design for build the first usable offline journal

## Context

See proposal.md for product motivation and scope. Milestone: 1 (product-roadmap phases 0–1, with backup/restore advanced by D-005). No product dependency; this is the first implementation milestone.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

The first journal needs no hosted backend, account model, bundled Python, or model runtime.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§0–5, 10–14, 19–22; decisions D-001–D-007. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Keep persistence behind Rust/Tauri commands, with SQLite as the only journal authority. The React interface never supplies arbitrary filesystem paths or SQL. Separate entry identity/lifecycle, optional reflection, and editor document while committing the entry aggregate atomically. Use a thin desktop interface over a cohesive journal module. Prototype Tiptap as the canonical editor document; Markdown is derived, not independently edited. User-confirmed civil-date, trash, and protection decisions are in the decision register.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Appendix refinements

Writing depth changes presentation, never entry identity. Quick/Daily remain usable before Deep Reflection's manual worksheet exists in milestone 3. A mode choice and suggested durations are skippable.

Add nullable progress_score with a 1–10 constraint alongside existing scores. Fresh schemas include it once; upgrades use a versioned migration with existing rows set to NULL. Expand the existing check-in contract and entry_reflections for optional learning/helped answers; do not create a competing reflection store.

Use personal_wins for explicitly approved multiple items, with stable IDs, date, optional entry link, origin, visibility, and timestamps. Existing proud_of remains the person's reflection; explicit promotion creates one linked win and is idempotent. Reports count canonical win IDs only. Do not copy every pride answer automatically or retain source-linked copies beyond source-deletion permissions.

Gentle view composes existing visibility and prompt controls as one preference. It does not erase values or suppress persistence failures and backup prompts. Expanded templates, timelines, and AI remain in their own milestones.

### Derivative data and recovery policy

All later indexes, embeddings, cached summaries, and pinned excerpts follow the source's active/visibility state; exclude them at query time immediately when a source is removed, even before background rebuilding. Clearing generated data preserves original writing and authored notes. Full application-data erasure includes managed derivatives/credentials and accurately describes independently held backup/export copies.

An existing journal must have a consistent encrypted pre-migration recovery snapshot before upgrading. If a passphrase or valid snapshot is unavailable, pause the upgrade safely. Fresh database creation is not an existing-data migration. These rules refine recovery rather than changing the confirmed daily/catch-up backup schedule.

### Verification interfaces

Exercise journal save/load/lifecycle through its command-facing interface using real temporary SQLite databases and synthetic entries. Verify renderer behavior with component/browser tests, and Mac window/keyboard/VoiceOver behavior in a native launch. Inject persistence failures and crash after an acknowledged revision. Verify backup/restore in a clean destination.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

A close event can race a pending save: expose pending state and specify recovery at the acknowledged revision. Trash and backups retain sensitive content: explain retention and avoid promising forensic erasure. Live SQLite is not application-encrypted. Backup format, schedule, and recovery still need detailed design.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

Choose a documented authenticated backup format and a standard password-based key-derivation implementation; do not invent cryptography. Verify versioning, corruption detection, temporary-file cleanup, clean-Mac restore, and recovery of an interrupted write. Back up a consistent SQLite snapshot rather than copying a live database file without coordinating its journal/WAL state.

Daily backup runs while the app is active and catches up at the next launch. A portable backup passphrase can optionally be remembered in Keychain. When unavailable, show pending backup and request the credential. Select backup retention and destination defaults during implementation; do not silently reuse the independently confirmed 30-day trash period. Retain the last valid backup until a validated replacement exists.

## Decision gates

D-006 and D-007 settle portable recovery, daily frequency, and next-launch catch-up. Specify O-009's retention, destination defaults, and credential-change behavior in the backup slice. Check editor fidelity, schema constraints, save acknowledgment, and entry-completion transitions against the engineering proposals.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
