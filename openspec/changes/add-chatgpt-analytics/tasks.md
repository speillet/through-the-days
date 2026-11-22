# Tasks for import and analyse explicitly supplied chatgpt exports

Status: draft implementation sequence; no tasks have been completed. Resolve this milestone's decision gates before starting dependent tasks.

## 1. Scope and first usable slice

- [ ] 1.1 Document supported export formats and resource bounds using synthetic samples. Verify with documented supported schemas and bounded synthetic fixtures; include the slice's tests and relevant documentation.
- [ ] 1.2 Deliver validated manual import with stable source IDs and idempotent repeated ingestion. Verify with repeat-import, stable-ID, and malformed-input tests; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Deliver versioned, reviewable event extraction with exact source references. Verify with provenance and classifier-version tests; include the slice's tests and relevant documentation.
- [ ] 2.2 Deliver English reports with original-language excerpts and separate source denominators. Verify with coverage/source-separation and original-text fidelity tests; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Verify journal independence, privacy, bounded malformed input handling, and no counter changes. Verify with offline journal and bounded-import integration checks; include the slice's tests and relevant documentation.
- [ ] 3.2 Document reproducible CLI commands and limitations; evaluate any sidecar or collector as a later change. Verify with documented CLI commands executed on synthetic data; include the slice's tests and relevant documentation.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
