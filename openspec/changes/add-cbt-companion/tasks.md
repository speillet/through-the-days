# Tasks for the CBT companion

Status: phase-3 draft; no tasks are complete. Manual worksheets and experiments precede optional model adapters. The P2 library has its own expand-cbt-exercise-library change and is not an archive prerequisite here.

## 1. Manual worksheets

- [ ] 1.1 Deliver and persist the manual seven-step thought record with pause/resume and separate user answers; verify offline resume and unchanged journal prose, with slice tests and documentation.
- [ ] 1.2 Deliver activation/problem-solving plans and explicitly reported outcomes without AI; verify planned actions are not counted as completed and document the manual flow.

## 2. Manual experiments on existing action plans

- [ ] 2.1 Extend cbt_action_plans with prediction, outcome, and lesson fields rather than adding a parallel store; verify manual create/review, neutral statuses, declined suggestions, and no changes to goals.
- [ ] 2.2 Add auditable corrections and one optional review reminder; verify original timestamps, Skip, Gentle view, and derived-view invalidation after deletion. Include slice tests and documentation before enabling AI.

## 3. Shared AI boundary and optional local assistance

- [ ] 3.1 Specify bounded contracts, consent previews, and verified country-aware support behavior; exercise prompt-like instructions in synthetic sources and verify unchanged permissions and no arbitrary actions.
- [ ] 3.2 Add opt-in local assistance only after the manual experiment flow works; verify offline operation after model download, at most two suggestions, and no journal mutation. Include adapter tests and documentation.

## 4. Optional remote adapter and integration

- [ ] 4.1 Add a remote adapter only with per-request preview/consent and Keychain credentials; verify each request requires fresh consent and document exact shared fields.
- [ ] 4.2 Verify cancellation, malformed output, loop prevention, English prompts/fallbacks, metadata-only default retention, and absence of silent mutations using synthetic request/response fixtures.

## Workflow follow-up

- Archive once this phase-3 scope and its verification evidence are delivered, independently of the P2 library.
- Keep later templates in their separate change and preserve the delivered manual flows.
