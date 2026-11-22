# Tasks for add optional guided reflection and cbt support

Status: draft implementation sequence; no tasks have been completed. Resolve this milestone's decision gates before starting dependent tasks.

## 1. Scope and first usable slice

- [ ] 1.1 Deliver and persist the manual seven-step thought record with pause/resume and separate user answers. Verify with manual offline pause/resume tests; include the slice's tests and relevant documentation.
- [ ] 1.2 Deliver activation/problem-solving plans and explicitly reported outcomes without AI. Verify with tests separating planned actions from explicitly reported outcomes; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Specify bounded provider/output contracts, consent previews, and country-aware support behavior. Verify with documented consent/schema/limit contracts and verified support-resource source; include the slice's tests and relevant documentation.
- [ ] 2.2 Add opt-in local assistance and verify an offline run after a model is downloaded. Verify with offline local-adapter test with no journal mutation; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Add a remote adapter only with per-request preview/consent and Keychain credentials. Verify with tests proving a fresh send preview and consent for every remote request; include the slice's tests and relevant documentation.
- [ ] 3.2 Verify cancellation, malformed output, loop prevention, English prompt instructions/fallbacks, metadata-only default retention, and absence of silent mutations. Verify with synthetic request/response, retention-choice, malformed-output, loop, cancellation, and fallback checks; include the slice's tests and relevant documentation.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
