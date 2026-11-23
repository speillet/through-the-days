# Design for read and explore the saved journal

## Context

See proposal.md for product motivation and scope. Milestone: 2 (product-roadmap phase 2). build-offline-journal, including stable save and journal-date behavior.

Status: implemented development design; see `tasks.md` and `docs/development-status.md` for verified slices and outstanding acceptance. Later capabilities remain deferred. This change is not archived.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§6–8, 14.2–14.3, 16.3, 20–22. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Implementation approach

Query the existing journal authority; reading views do not create editable copies. Cache or index derived content with invalidation after edits. Preserve slot distinctions and selected journal dates. Keep timeline and statistical calculation behavior testable through a small query interface.

Use SQLite FTS5 for local journal text search as required by the brief. The current Rust query rebuilds a transient in-memory index from active saved document revisions with Unicode accent/case folding and literal tokens. Edits and trash cannot leave a stale persistent search index. This is not an alternative journal authority; larger-journal performance remains a future measurement.

The native Tauri adapter delegates search, reports, notes and milestone operations to the Rust journal authority. Browser tests use the explicit synthetic memory adapter. React reading state retains filters, selected sources and per-entry scroll positions; source mutations invalidate dependent queries. Weekly authored-note autosave survives navigation and retries failures independently of summary generation.

### Weekly reviews and The Path So Far

These are views over shared journal queries and provenance, not another editable journal or another metric engine. Reuse progress-insights aggregation rules and extend selectable measures with nullable perceived progress. Calendar/Book links carry the current range/filter context.

Store one weekly_reviews record per ISO week in the current single-user context, with exact boundaries, snapshot fingerprint/version metadata, deterministic statistics, separate user_notes, and an optionally retained labelled summary. Count distinct in-scope journal dates, canonical win IDs, and started/completed exercises separately. A generated review never becomes an extra original entry in its own denominators.

Invalidate derived material on source edits, trash/deletion, or insight-visibility changes. Old excerpts must not remain visible as current evidence. Recalculation preserves authored notes. Snapshot metadata supports freshness checks; it does not authorise retaining copies of deleted text.

The long-range personal-timeline composes available layers and timeline_milestones with the existing mini timeline and date navigation. Add later CBT/goal/import layers only when those capabilities exist. New range controls do not duplicate the 7/14/30-day mini timeline or introduce interpolation by default.

### Verification interfaces

Use synthetic empty days, two-slot days, Unicode text, long documents, neutral scores, score-bearing drafts, and DST transitions. Compare all views after an edit and verify exact source links.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Pagination can hide or duplicate text; rendered coverage and selection need a prototype. D-010–D-012 fix inclusion and neutral markers. Morning mood 2 and Evening mood 7 yield two observations, mean 4.5 and one recorded date. Missing pride adds no observation. A 5 on either numeric axis has a neutral marker even when the chosen emotion is Anxious.

## Migration Plan

Schema 3 adds authoritative weekly-review and timeline-milestone tables. Protected migrations support schema-1/2 images, and encrypted backups validate and restore the authored reading records. Reading-source exclusion defaults to enabled for older entries. Search indexes are transient and rebuilt. Migration, clean restore and reading-data round trips are covered by the Rust suites; manual native acceptance remains outstanding.

## Decision gates

D-010–D-012 resolve this milestone's product gates. Book navigation pages by entry, renders all text once and scrolls long content; resizing preserves its position. The canonical JSON document is shared with the editor. SQLite FTS5 provides rebuildable literal-token search; weekly notes and private milestones are authoritative authored records included in encrypted snapshots. Optional local summaries are labelled and invalidated by source-revision fingerprints; generated content can be cleared independently of notes.

These product gates were resolved before their dependent implementation. Reopen them only if the proposed behaviour changes. Keep acceptance combinations that have not been verified unchecked, including native reading interactions and the outstanding tasks in `tasks.md`.
