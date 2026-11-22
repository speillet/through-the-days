# Design for import and analyse explicitly supplied chatgpt exports

## Context

See proposal.md for product motivation and scope. Milestone: 5 (product-roadmap phase 5). Stable journal and source-aware exploration; analytics remains optional and independent.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§8.2–9, 10, 16, 19–20. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Use Python with uv, Pydantic, Typer, and pytest for a separate local pipeline. The analytics store is derived and separate from the journal authority. Parse supplied files within documented bounds, preserve provenance, and process imports idempotently. Reprocessing references explicit parser/classifier versions.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Verification interfaces

Use synthetic ZIP/JSON exports with branches, Unicode, invalid dates, repeated identifiers, corrupted members, and repeated imports. Verify bounds and path traversal rejection, source links, incremental processing, and original-language preservation.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Export structure changes and extracted classifications are uncertain. Report unsupported formats clearly, record review status, and keep message counts distinct from clinical or time-duration claims.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

## Decision gates

Resolve O-008 and supported export branching/timestamp rules before implementation. An opt-in collector is a separate later investigation, not an assumed data source.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
