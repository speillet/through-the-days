# Design for explore tags, keywords, and independent goals

## Context

See proposal.md for product motivation and scope. Milestone: 4 (product-roadmap phase 4). build-offline-journal and add-journal-reading; preserve existing reading behavior.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§15–17, 8, 19–20. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Keep source annotations, matches, and interpreted events separate. Index versioned source text and invalidate stale results on edits. Compute goal displays from retained events and periods through one goal interface; content-analysis adapters cannot mutate goal history.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Versioned analytics reuse

Appendix INT-08 refines the existing counting methods: vocabulary/model changes create new analysis-run metadata rather than relabelling historical results. Shared calculations are consumed by personal-patterns in the separate add-source-backed-insights P2 proposal. Keyword mentions, uncertain semantic topics, and any later explicitly reported event type remain separate; no new clinical episode tracker is implied.

### Verification interfaces

Use known-count Unicode fixtures, repeated edits, tag merges, source filters, DST boundaries, two goals, accidental lapse corrections, and hidden-counter exports.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Tokenization and offset conventions can make counts irreproducible; settle them before indexing. Goal mode and day conventions must remain explicit and independently tested.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

## Decision gates

Resolve O-006 before counters. Choose offset indexing, multilingual tokenization, and exact normalization rules before keyword implementation.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
