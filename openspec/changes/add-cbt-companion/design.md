# Design for add optional guided reflection and cbt support

## Context

See proposal.md for product motivation and scope. Milestone: 3 (README phase 3). build-offline-journal; add-journal-reading is the preceding product milestone.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README §§18–20 and 13 phase 3. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Store worksheet sessions and answers separately from journal prose. A deterministic worksheet module owns steps, pause/resume, and reported outcomes. Optional provider adapters return schema-validated suggestions with prompt/model version and source references. Credentials belong in Keychain and logs contain non-sensitive metadata.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Verification interfaces

Run all manual scenarios with no model and no connection. Use synthetic model responses to exercise invalid JSON, extra fields, cancellation, timeouts, non-English output, repetitive reframing, and consent cancellation; verify no journal mutation.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Generated suggestions can be speculative or sustain repetitive analysis. Keep questions bounded, suggestions editable, and the manual fallback usable. Crisis-resource content requires an appropriate verified source during implementation.

## Migration Plan

Work first with synthetic data. Version persistent formats and derived indexes. Validate migrations against prior supported fixtures and recoverable snapshots. A failed migration or restore must preserve the prior usable journal; derived indexes can be rebuilt. New views and optional adapters can be disabled independently of writing.

## Decision gates

Resolve O-005 and the exact provider/output limits before enabling an adapter. Confirm reminder and follow-up behavior during the exercise prototype.

These are explicit gates before dependent implementation, not assumptions settled by this draft. Reopen the relevant interview branch when this milestone is requested. Technical details that do not change behavior can be selected during the prototype and recorded with evidence.
