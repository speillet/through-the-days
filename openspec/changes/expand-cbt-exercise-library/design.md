# Design for the extended offline exercise library

## Context

The original manual worksheets and experiments are phase 3. This is an independent P2 catalogue extension, scheduled alongside phase 4.1. It must not become a hidden prerequisite for archiving the earlier change.

## Goals / Non-Goals

Add bounded, inspectable English templates without changing journal completion, requiring an LLM, or creating another experiment/action-plan authority. Preserve the original exercises and their saved answers.

## Decisions

Reuse existing cbt_sessions/cbt_answers and approved cbt_action_plans. Identify templates by stable versioned identifiers; keep earlier answers linked to the version they used rather than silently rewriting them after content edits. Behavioural Experiment invokes the existing manual plan flow.

Review the wording/steps under O-012 before shipping each template. No diagnostic or clinical-effectiveness claim is implied. Optional AI suggestions reuse llm-assistance's shared boundary and at-most-two choice rule; delivered manual templates work without any model.

## Risks / Trade-offs

A broad library can overwhelm choice: offer deliberate selection and at most two optional suggestions. Avoid forced reframing and prescriptive unsafe tasks. Undelivered templates must remain clearly unavailable while original manual workflows stay usable.

## Migration Plan

Add versioned template definitions only after the original session format exists. Preserve earlier session answers/version references and test a template update on synthetic saved sessions. Share deletion and source-visibility rules with existing CBT records.

## Verification

Exercise every delivered template offline; verify no model call, journal mutation, duplicated plan, forced completion, or loss of an earlier session after template updates. Document content review and bounded steps with the slice's tests.
