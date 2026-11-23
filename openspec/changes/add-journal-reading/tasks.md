# Tasks for read and explore the saved journal

Status: implementation is present in the development worktree. Seven slices have the evidence below; three tasks retain outstanding acceptance combinations. D-010–D-012 resolve the product gates. The change is not archived.

## 1. Scope and first usable slice

- [x] 1.1 Settle draft inclusion, neutral marker treatment, and document-reading acceptance examples. Verify with recorded draft/neutral-marker decisions with example expected values; include the slice's tests and relevant documentation.
- [x] 1.2 Deliver calendar date selection and an exact entry preview from the existing store. Verify with calendar selection and source-entry tests; include the slice's tests and relevant documentation.

## 2. Core behavior

- [x] 2.1 Deliver chronological Book View with complete long text, keyboard navigation, and stable return position. Verify with long-document rendered-coverage and keyboard/resize checks; include the slice's tests and relevant documentation.
- [x] 2.2 Add local search and filters with edit invalidation and original-language excerpts. Verify with Unicode search and stale-index invalidation tests; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [x] 3.1 Deliver timeline ranges, per-slot values, visible gaps, and keyboard activation. Verify with 7/14/30-day, slot, missing-data, and keyboard tests; include the slice's tests and relevant documentation.
- [ ] 3.2 Verify cross-view consistency, coverage/denominators, reduced motion, and source links. Verify with cross-view edit consistency and denominator/source-link checks; include the slice's tests and relevant documentation.

## 4. Weekly review and long-range chronology

- [x] 4.1 Deliver deterministic Monday–Sunday weekly counts and manual notes without AI; verify three in-scope entries on two dates report two recorded days, sparse weeks stay qualified, and win/exercise denominators remain distinct.
- [x] 4.2 Add optional labelled summaries and source-version freshness; verify editing/removing/hiding a source invalidates generated material without losing authored notes or retaining deleted excerpts.
- [ ] 4.3 Deliver The Path So Far from shared journal queries with private milestones, ranges, available layers, and source/date navigation; verify missing gaps, two slots, keyboard zoom, and Book return context.
- [ ] 4.4 Apply Gentle view and per-surface permissions to long-range and weekly views; verify hidden counters and excluded sources never reappear in another layer. Include slice tests and documentation.

## Verification evidence

Audit: November 23, 2026; see [development status](../../../docs/development-status.md) and [acceptance coverage](../../../docs/acceptance-coverage.md#november-23-2026-audit). The full interface/Rust/browser suites pass; this change is not yet ready to archive.

- 1.1: D-010–D-012 are recorded in the decision register and reflected in the specs. Rust reading tests verify scored drafts, two slots, missing metrics and separate observation/day denominators; the Calendar component test verifies neutral 5 independently of slot.
- 1.2 and 2.1: `Reading.test.tsx` and `e2e/reading.spec.ts` verify exact Calendar sources, chronological Morning/Evening reading, full long text once, selection, arrow navigation and scroll retention across resize/return.
- 2.2: `crates/journal-core/tests/reading.rs` verifies Unicode/accent-folded local search and edit/trash invalidation. The component suite combines a text query with slot filters and opens the exact saved source for editing.
- 4.2: Rust and browser tests verify source edit/removal/exclusion invalidates visible summaries while preserving authored notes. Reading tests also cover note-save failure/retry, restart, clearing summaries and authored reading-data backup/restore.
- 3.1: the component and WebKit/Chromium reading suites verify the historical 14-day default, 7/30-day changes, distinct Morning/Evening values, missing pride and empty-day gaps, all-series-hidden persistence across reload, and Enter opening the exact historical date/source.
- 4.1: the public Rust journal interface and Weekly Review component verify three scored drafts on two civil dates count as 3 entries and 2 recorded days within a Monday–Sunday week. Each metric has its own denominator, a promoted pride win counts once, authored notes add no entry, an outside-week entry is excluded and an empty week stays neutral. The UI explicitly states CBT exercises are unavailable and not counted.
- 3.2, 4.3 and 4.4 retain their unchecked acceptance work. Their code is present, but the current tests do not establish every cross-view edit, layer/context or Gentle-view combination. Native reading/VoiceOver checks remain outstanding as well.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
