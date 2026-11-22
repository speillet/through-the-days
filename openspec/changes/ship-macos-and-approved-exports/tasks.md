# Tasks for prepare wider mac distribution and approved aggregate exports

Status: draft implementation sequence; no tasks have been completed. Resolve this milestone's decision gates before starting dependent tasks.

## 1. Scope and first usable slice

- [ ] 1.1 Select supported OS/architectures, signing/notarisation needs, and distribution channel. Verify with published-in-repository support/signing decision record; include the slice's tests and relevant documentation.
- [ ] 1.2 Build and verify app/disk-image artifacts outside the development tree. Verify with clean-environment launch and restart evidence; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Define the aggregate allowlist, source/coverage labels, and exact export preview. Verify with exact preview and exclusion fixtures; include the slice's tests and relevant documentation.
- [ ] 2.2 Deliver explicitly approved file export without automatic publishing. Verify with preview-to-file equality and no-publication checks; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Verify no private prose, hidden counters, credentials, or unselected fields appear in export artifacts. Verify with release/export resource inspection using synthetic data; include the slice's tests and relevant documentation.
- [ ] 3.2 Record release verification evidence and remaining support limits. Verify with documented supported-matrix results and limitations; include the slice's tests and relevant documentation.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
