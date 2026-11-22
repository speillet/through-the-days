# Tasks for read and explore the saved journal

Status: draft implementation sequence; no tasks have been completed. Resolve this milestone's decision gates before starting dependent tasks.

## 1. Scope and first usable slice

- [ ] 1.1 Settle draft inclusion, neutral marker treatment, and document-reading acceptance examples. Verify with recorded draft/neutral-marker decisions with example expected values; include the slice's tests and relevant documentation.
- [ ] 1.2 Deliver calendar date selection and an exact entry preview from the existing store. Verify with calendar selection and source-entry tests; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Deliver chronological Book View with complete long text, keyboard navigation, and stable return position. Verify with long-document rendered-coverage and keyboard/resize checks; include the slice's tests and relevant documentation.
- [ ] 2.2 Add local search and filters with edit invalidation and original-language excerpts. Verify with Unicode search and stale-index invalidation tests; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Deliver timeline ranges, per-slot values, visible gaps, and keyboard activation. Verify with 7/14/30-day, slot, missing-data, and keyboard tests; include the slice's tests and relevant documentation.
- [ ] 3.2 Verify cross-view consistency, coverage/denominators, reduced motion, and source links. Verify with cross-view edit consistency and denominator/source-link checks; include the slice's tests and relevant documentation.

## 4. Weekly review and long-range chronology

- [ ] 4.1 Deliver deterministic Monday–Sunday weekly counts and manual notes without AI; verify three in-scope entries on two dates report two recorded days, sparse weeks stay qualified, and win/exercise denominators remain distinct.
- [ ] 4.2 Add optional labelled summaries and source-version freshness; verify editing/removing/hiding a source invalidates generated material without losing authored notes or retaining deleted excerpts.
- [ ] 4.3 Deliver The Path So Far from shared journal queries with private milestones, ranges, available layers, and source/date navigation; verify missing gaps, two slots, keyboard zoom, and Book return context.
- [ ] 4.4 Apply Gentle view and per-surface permissions to long-range and weekly views; verify hidden counters and excluded sources never reappear in another layer. Include slice tests and documentation.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
