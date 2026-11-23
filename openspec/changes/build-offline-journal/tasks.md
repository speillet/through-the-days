# Tasks for build the first usable offline journal

Status: application code is implemented; automated and native-smoke evidence was audited on November 23, 2026. User decisions D-001–D-009 apply. Four tasks still require acceptance evidence. The change is not archived.

## 1. Scope and first usable slice

- [x] 1.1 Specify backup format, destination defaults, retention, and safe credential changes, preserving confirmed daily frequency, catch-up, and portable recovery. Verify with documented backup format/key contract and synthetic recovery acceptance cases; include the slice's tests and relevant documentation.
- [ ] 1.2 Prototype one original Today/check-in/editor flow on macOS, including Skip, direct writing, English strings, and reduced motion. Verify with synthetic macOS walkthrough of writing, Skip, and focus; include the slice's tests and relevant documentation.

## 2. Core behavior

- [x] 2.1 Deliver one Morning draft end to end: create, write, save, restart, and recover through the public journal interface. Verify with integration test restoring an acknowledged draft after restart; include the slice's tests and relevant documentation.
- [x] 2.2 Add independent Evening entries, range validation, date correction, completion transitions, and conflict-safe edits. Verify with tests for two independent slots, invalid scores, and occupied-date conflicts; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [x] 3.1 Persist optional actions, reflections, and pride in the same acknowledged entry revision. Verify with aggregate save/load tests preserving optional and missing answers; include the slice's tests and relevant documentation.
- [x] 3.2 Expose pending/saved/failed states, explicit save, retry, crash recovery, and safe migration failure. Verify with failure-injection and migration-recovery tests with documented save guarantees; include the slice's tests and relevant documentation.

## 4. Data recovery

- [x] 4.1 Implement 30-day trash, restore conflicts, and explicit permanent deletion using synthetic retention clocks. Verify with controlled-clock trash/restore/conflict tests; include the slice's tests and relevant documentation.
- [x] 4.2 Implement encrypted backup and clean-destination restore; verify wrong-key, corrupt-backup, and partial-write failures before real-data use. Verify with clean-destination restore, wrong-passphrase, corrupt-backup, daily/catch-up, and interruption tests; include the slice's tests and relevant documentation.

## 5. Integration evidence

- [ ] 5.1 Verify offline behavior, English copy on a French Mac, multilingual text fidelity, accessibility, and absence of automatic uploads. Verify with native offline, French-system-language, Unicode, keyboard, and VoiceOver checks; include the slice's tests and relevant documentation.
- [ ] 5.2 Run the mapped acceptance scenarios, document evidence and remaining limits, then mark only delivered tasks complete. Verify with recorded results for all milestone-1 acceptance rows; include the slice's tests and relevant documentation.

## 6. Flexible reflection without scope expansion

- [x] 6.1 Add optional writing depths and duration preferences; verify switching a partial draft preserves its identity, text, scores, date, and slot, with no unavailable worksheet presented as implemented.
- [x] 6.2 Add nullable perceived progress to schema, check-in contracts, autosave, and migration fixtures; verify missing/range cases and unchanged completion behavior.
- [x] 6.3 Add explicitly approved multiple small wins and optional learning/helped prompts; verify promotion does not double-count pride text, declined suggestions create no items, and user-defined rest stays neutral.
- [x] 6.4 Add Gentle view using shared visibility controls; verify optional tracking is hidden without data loss or suppression of save/backup errors. Document each slice with its behavioral tests.

## 7. Shared derivative privacy

- [ ] 7.1 Verify that source removal/visibility changes immediately exclude its excerpts from every delivered derivative surface, and clearing generated information preserves original/user-authored records; document erasure and separately retained backup/export scope.
- [x] 7.2 Verify metadata-only diagnostics exclude scores, embeddings, screenshots, and private source/model content, and an existing-data migration pauses if its encrypted recovery backup cannot be made.

## Verification evidence

See [development status](../../../docs/milestone-1-status.md) for commands, actual results and limits: 416 interface tests, 147 Rust tests, 52 browser tests, a native bundle build and three native smoke launches passed.

- 1.1 and 4.2: `docs/backup-format.md`, core recovery/migration suites, native backup/restore state tests and browser protection scenarios cover portable encryption, retention, failure preservation, daily catch-up and clean restore. Real Keychain prompts and an actual exFAT drive remain manual checks.
- 2.1–3.2 and 4.1: core journal/persistence/schema suites, frontend autosave/flush/exit tests, native state tests and writing/editor/protection browser scenarios cover acknowledged independent entries, validation/conflicts, aggregate answers, save failures and Trash. Native smoke verifies actual save/restart recovery. The quit regression verifies a missing flush acknowledgement keeps the app open and permits a later retry, including stale-timeout cancellation. See technical design for platform termination limits.
- 6.1–6.4: domain/check-in, WritingDepth, GentleView, Today and writing browser tests cover identity-preserving depth changes, nullable progress, explicit canonical wins and visibility without data loss. Later reading-surface combinations remain in that change's task 4.4.
- 7.2: privacy guards and native diagnostics/migration tests cover metadata-only error reporting and protected migration failure.
- 1.2, 5.1, 5.2 and 7.1 remain unchecked: native Skip/focus/assistive checks, all mapped acceptance, and the full derivative-removal audit have not been established by this audit.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
