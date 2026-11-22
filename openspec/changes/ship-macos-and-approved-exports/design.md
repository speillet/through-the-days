# Design for prepare wider mac distribution and approved aggregate exports

## Context

See proposal.md for product motivation and scope. Milestone: 6 (README phase 6, excluding backups already advanced into milestone 1). The relevant product milestones and verified personal-use backup/restore.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README §§3, 10, 13 phase 6, 17.3, 19–20; decisions D-001 and D-005. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Select the minimum OS, architecture matrix, signing, and channel explicitly. Verify release artifacts outside the development environment. The export module works from a user-selected aggregate allowlist, not raw-record serialization; publication remains a distinct action.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Private portability is a separate boundary

Keep three flows distinct: encrypted recovery backup in milestone 1, user-selected private document export/import here, and public aggregate export governed by approved-exports. Reuse canonical records and document projections, never serialize a database file as a public export.

Define a versioned JSON envelope with selected core entities, stable IDs, timestamps, provenance, and explicit confirmed outcomes. Validate into a staging area before an atomic merge. Repeated imports are idempotent; conflicting active/trash IDs, content revisions, or slots need explicit resolution and never silently resurrect a deleted entry or add goal events.

Markdown derives from the canonical editor document. CSV exports only selected quantitative check-ins and preserves NULL; PDF renders only approved dates/content types. Describe plaintext protection accurately and preview the destination. Credentials and hidden/unselected fields stay excluded.

### Verification interfaces

Install and launch release artifacts on the selected supported matrix. Compare preview and produced export payload, test small sample disclosure and excluded fields, and check counters require explicit permission.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

A development launch does not establish signed/notarised distribution readiness. Aggregates can still disclose sensitive information; show the exact payload and selection before writing or sharing.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

## Decision gates

Resolve O-007 and exact aggregate allowlist/destination before distribution or export implementation.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
