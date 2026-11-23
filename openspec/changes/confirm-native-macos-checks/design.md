# Native verification approach

## Context

See `proposal.md`. Browser automation and the Rust tests cover their respective interfaces. The native smoke runner launches a debug Tauri bundle with `TTD_DATA_DIR` pointing at a temporary synthetic journal; it does not exercise VoiceOver or hardware dialogs.

## Goals / Non-Goals

Establish reproducible evidence for platform-dependent acceptance cases. This plan does not change requirements, introduce a testing service, or authorise access to a personal journal.

## Decisions

- Use an isolated debug data directory and synthetic content for every manual scenario, preserving the existing development-data boundary.
- Record macOS version, hardware, scenario, actual result, and limitations in `docs/acceptance-coverage.md`. An automated accessibility scan is recorded separately from a VoiceOver pass.
- Retain the original milestones' incomplete tasks. A verification-only change cannot establish milestone completion by moving their obligations elsewhere.

## Risks / Trade-offs

- Unavailable hardware or assistive-technology testing → leave the task unchecked and report the missing evidence.
- A discovered defect requires code changes → fix it through the applicable product change, then rerun the affected scenario.

## Migration Plan

No application or data migration. Archive this checklist only after its actual results are recorded; assess the original changes independently.
