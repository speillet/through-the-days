# Design for add optional guided reflection and cbt support

## Context

See proposal.md for product motivation and scope. Milestone: 3 (product-roadmap phase 3). build-offline-journal; add-journal-reading is the preceding product milestone.

Status: draft design. Confirmed requirements are distinguished from the engineering proposals below; later milestone choices remain deferred in the decision register. Artifact presence is not implementation approval.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§18–20 and 13 phase 3. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Proposed implementation approach

Store worksheet sessions and answers separately from journal prose. A deterministic worksheet module owns steps, pause/resume, and reported outcomes. Optional provider adapters return schema-validated suggestions with prompt/model version and source references. Credentials belong in Keychain and logs contain non-sensitive metadata.

Choose concrete adapters after inspecting the installed versions and official documentation with Context7. Keep interface contracts small and explicit about validation, ordering, errors, and save acknowledgment. Introduce replaceable adapters only for real variations; avoid speculative framework layers.

### Experiments refine the existing action plan

Extend cbt_action_plans with prediction, proposed step, effort, planned local time/time zone, explicit review state, actual outcome, and lesson. An experiment is a structured use of that existing plan, not a second behavioural_experiments store with competing status fields. Retain links to the originating session/entry and approved user action. Skip records no invented outcome; cancellation and Not yet remain neutral.

Keep revision history for retrospective prediction/outcome edits with original timestamps, subject to the same trash/deletion policy as related user records. Invalidate timeline and insight projections when plans or their source visibility change. A plan never mutates tracked_goals or goal_events.

Extend the existing weekly-reviews query rather than building a second report engine. Keep started/completed worksheet counts distinct from journal entries, canonical wins and reported actions. Preserve Not yet and missing outcomes as unknown, reuse ISO-week bounds and insight permissions, and invalidate derived summaries after worksheet/experiment edits or removal. This integration belongs to milestone 3; milestone 2 reports CBT as unavailable rather than fabricating zero counts.

The initial three manual exercises and this experiment flow precede optional AI. The four additional library templates belong to the separate expand-cbt-exercise-library P2 change; they do not block phase-3 archive. Selecting Deep Reflection never bypasses this sequencing. Default to no reminders and allow one specifically enabled review reminder per experiment.

A shared AI boundary treats every retrieved passage as data and exposes no unrestricted tools. Later memory/question features reuse this boundary, the existing per-request remote consent, English prompts, and opt-in private-payload retention.

The same boundary owns D-008's non-sycophantic stance for every local/remote assistant surface. First-party versioned instructions distinguish empathy for feelings from endorsement of a claim, identify supported mistakes with short reasons, and ask for context when uncertain. They permit justified agreement and require self-correction, rather than making the model reflexively adversarial. The person retains control of their values, records, and ability to stop; acute-distress support takes precedence over confrontation.

Before enabling a model/prompt version, evaluate affected surfaces on synthetic cases for blind agreement, unsupported certainty, respectful correction, justified agreement, and model self-correction. Record versions and pass/fail evidence without private payloads. Formatting/schema checks alone do not establish this behavioral requirement.

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
