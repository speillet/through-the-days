# Design for read and explore the saved journal

## Context

See proposal.md for product motivation and scope. Milestone: 2 (README phase 2). build-offline-journal, including stable save and journal-date behavior.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README §§6–8, 14.2–14.3, 16.3, 20–22. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Query the existing journal authority; reading views do not create editable copies. Cache or index derived content with invalidation after edits. Preserve slot distinctions and selected journal dates. Keep timeline and statistical calculation behavior testable through a small query interface.

Use SQLite FTS5 for local journal text search as required by the brief. A rebuildable search index is derived from saved document revisions; it is not an alternative journal authority.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Verification interfaces

Use synthetic empty days, two-slot days, Unicode text, long documents, neutral scores, score-bearing drafts, and DST transitions. Compare all views after an edit and verify exact source links.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Pagination can hide or duplicate text; rendered coverage and selection need a prototype. Draft inclusion and neutral marker rules remain open and must be explicit before charts ship.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

## Decision gates

Resolve O-002, O-003, and O-004 before their dependent visual or aggregation work. Chart library choice is an engineering proposal, not a product requirement.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
