# Tasks for explore tags, keywords, and independent goals

Status: draft implementation sequence; no tasks have been completed. Resolve this milestone's decision gates before starting dependent tasks.

## 1. Scope and first usable slice

- [ ] 1.1 Deliver manual entry/date tags with rename, merge, and source-linked filtering. Verify with tag rename/merge/source-filter tests; include the slice's tests and relevant documentation.
- [ ] 1.2 Add explicit approval for suggestions and preserve annotation origin. Verify with approval and annotation-origin tests; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Specify normalization and offsets; deliver exact counts and matches per 1,000 words using known-count fixtures. Verify with known-count fixtures and documented normalization/offset rules; include the slice's tests and relevant documentation.
- [ ] 2.2 Add approved lexical families and separately labelled semantic topics, including reindex invalidation. Verify with separate-method and stale-match invalidation tests; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Choose goal units and deliver independent avoid/reduce/build modes with retained history. Verify with recorded time-unit decision and independent-mode tests; include the slice's tests and relevant documentation.
- [ ] 3.2 Verify manual lapse confirmation, undo/correction, visibility controls, and non-mutation by imported or analysed text. Verify with lapse correction, privacy visibility, and import non-mutation tests; include the slice's tests and relevant documentation.

## 4. Versioned comparisons

- [ ] 4.1 Verify that rescanning a synthetic corpus after dictionary/model changes creates distinct versioned run metadata, preserves visibility/deletion controls, and does not mix lexical, semantic, or self-reported event counts. Document the shared calculation contract consumed by later personal-patterns views.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
