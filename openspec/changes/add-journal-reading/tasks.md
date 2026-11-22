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

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
