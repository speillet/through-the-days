# Tasks for build the first usable offline journal

Status: draft implementation sequence; no tasks have been completed. User decisions D-001–D-007 apply.

## 1. Scope and first usable slice

- [ ] 1.1 Specify backup format, destination defaults, retention, and safe credential changes, preserving confirmed daily frequency, catch-up, and portable recovery. Verify with documented backup format/key contract and synthetic recovery acceptance cases; include the slice's tests and relevant documentation.
- [ ] 1.2 Prototype one original Today/check-in/editor flow on macOS, including Skip, direct writing, English strings, and reduced motion. Verify with synthetic macOS walkthrough of writing, Skip, and focus; include the slice's tests and relevant documentation.

## 2. Core behavior

- [ ] 2.1 Deliver one Morning draft end to end: create, write, save, restart, and recover through the public journal interface. Verify with integration test restoring an acknowledged draft after restart; include the slice's tests and relevant documentation.
- [ ] 2.2 Add independent Evening entries, range validation, date correction, completion transitions, and conflict-safe edits. Verify with tests for two independent slots, invalid scores, and occupied-date conflicts; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [ ] 3.1 Persist optional actions, reflections, and pride in the same acknowledged entry revision. Verify with aggregate save/load tests preserving optional and missing answers; include the slice's tests and relevant documentation.
- [ ] 3.2 Expose pending/saved/failed states, explicit save, retry, crash recovery, and safe migration failure. Verify with failure-injection and migration-recovery tests with documented save guarantees; include the slice's tests and relevant documentation.

## 4. Data recovery

- [ ] 4.1 Implement 30-day trash, restore conflicts, and explicit permanent deletion using synthetic retention clocks. Verify with controlled-clock trash/restore/conflict tests; include the slice's tests and relevant documentation.
- [ ] 4.2 Implement encrypted backup and clean-destination restore; verify wrong-key, corrupt-backup, and partial-write failures before real-data use. Verify with clean-destination restore, wrong-passphrase, corrupt-backup, daily/catch-up, and interruption tests; include the slice's tests and relevant documentation.

## 5. Integration evidence

- [ ] 5.1 Verify offline behavior, English copy on a French Mac, multilingual text fidelity, accessibility, and absence of automatic uploads. Verify with native offline, French-system-language, Unicode, keyboard, and VoiceOver checks; include the slice's tests and relevant documentation.
- [ ] 5.2 Run the mapped acceptance scenarios, document evidence and remaining limits, then mark only delivered tasks complete. Verify with recorded results for all milestone-1 acceptance rows; include the slice's tests and relevant documentation.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
