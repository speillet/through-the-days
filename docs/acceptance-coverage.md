# Acceptance coverage

Every numbered acceptance case in README §20 is assigned below. Milestone 1 is the first usable offline journal; later rows stay deferred until their milestone. These are verification plans, not executed application tests.

| README case | Observable behavior | Milestone | Capability and requirement |
|---|---|---|---|
| 1 | Morning and Evening stay independent | 1 | [journal-entries](../openspec/changes/build-offline-journal/specs/journal-entries/spec.md) — Two independent slots |
| 2 | One entry is enough without pressure, warnings, or fabricated scores | 1 | [journal-entries](../openspec/changes/build-offline-journal/specs/journal-entries/spec.md) — Two independent slots / One entry is enough |
| 3 | Autosave and draft recovery after restart | 1 | [local-persistence](../openspec/changes/build-offline-journal/specs/local-persistence/spec.md) — Atomic acknowledged revisions |
| 4 | Edited scores update Calendar and Trends | 2 | [calendar-reading](../openspec/changes/add-journal-reading/specs/calendar-reading/spec.md) — Consistent saved observations |
| 5 | Retrieve exact older dates | 2 | [calendar-reading](../openspec/changes/add-journal-reading/specs/calendar-reading/spec.md) — Month navigation and markers |
| 6 | Chronological long-form book reading | 2 | [book-reading](../openspec/changes/add-journal-reading/specs/book-reading/spec.md) — Complete pagination |
| 7 | Midnight, DST, and stable journal dates | 1; goal calculations in 4 | [journal-entries](../openspec/changes/build-offline-journal/specs/journal-entries/spec.md) — Chosen civil date |
| 8 | Keyboard, VoiceOver, colour independence, reduced motion | 1, then each added surface | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — Accessible original interface |
| 9 | Offline create, read, and edit | 1 | [local-persistence](../openspec/changes/build-offline-journal/specs/local-persistence/spec.md) — Local authority |
| 10 | Private content stays local by default | 1; sharing in 6 | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — Private defaults |
| 11 | Idempotent import and distinct evidence kinds | 5 | [chatgpt-import](../openspec/changes/add-chatgpt-analytics/specs/chatgpt-import/spec.md) — Idempotent provenance |
| 12 | Migration, backup, and restore integrity | 1, advanced by D-005 | [local-data-protection](../openspec/changes/build-offline-journal/specs/local-data-protection/spec.md) — Safe restore |
| 13 | Partial skippable check-in survives restart | 1 | [daily-check-in](../openspec/changes/build-offline-journal/specs/daily-check-in/spec.md) — Skippable reflection |
| 14 | Timeline ranges, both slots, gaps, navigation | 2 | [progress-insights](../openspec/changes/add-journal-reading/specs/progress-insights/spec.md) — Navigable progress timeline |
| 15 | Tag rename/merge/filter and approved suggestions | 4 | [tags-and-search](../openspec/changes/add-personal-exploration/specs/tags-and-search/spec.md) — Approved suggestions |
| 16 | Auditable counts, denominators, methods, reindexing | 4 | [keyword-analysis](../openspec/changes/add-personal-exploration/specs/keyword-analysis/spec.md) — Separate denominators |
| 17 | Independent goals, retained history, visibility, units | 4 | [goal-counters](../openspec/changes/add-personal-exploration/specs/goal-counters/spec.md) — Explicit lapses and retained history |
| 18 | Offline resumable manual thought record | 3, before AI | [cbt-worksheets](../openspec/changes/add-cbt-companion/specs/cbt-worksheets/spec.md) — Offline thought record |
| 19 | Bounded requested AI without silent mutation | 3, after manual worksheets | [llm-assistance](../openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md) — User control and bounded reflection |
| 20 | Source identity, per-request consent, approved exports | 3, 5, and 6 | [llm-assistance](../openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md) — Per-request remote consent |
| 21 | English UI even on a French Mac | 1, then each added surface | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — English first-party content |
| 22 | Multilingual original text and Unicode search | 1; search in 2; import in 5 | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — Faithful user text |
| 23 | English AI prompts, output validation, and fallbacks | 3; original copy in 1 | [llm-assistance](../openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md) — Validated English suggestions |

## Coverage requiring more than one capability

- Completion integrity and score-range scenarios add validation beyond case 2; optional pride has its separate 1–10 range.
- Case 7 includes goal-counters — Transparent time and visibility when goals are delivered.
- Case 12 also uses local-persistence — Safe migrations and local-data-protection — Encrypted local backups before real use.
- Case 13 also uses local-persistence — Progressive autosave and errors.
- Case 20 combines llm-assistance consent, chatgpt-import source identity, conversation-analysis provenance, and approved-exports preview/approval.
- Case 22 also uses calendar-reading — Local search and filtering and chatgpt-import — Separate original-language store.
- Case 23 additionally uses llm-assistance — English adapter instructions; source-copy originality is covered by product-guardrails — Accessible original interface.

## Additional interview acceptance cases

| Decision | Observable evidence |
|---|---|
| D-001 | The first milestone launches locally for personal use without accounts or a hosted backend. Wider distribution remains milestone 6. |
| D-002 | Writing at 00:30 can be explicitly attached to the previous civil date; changing time zone or crossing midnight does not shift existing entries. |
| D-003 | Trash restores a free slot within 30 days, handles an occupied slot without overwriting, and supports explicit permanent deletion. Backup retention is explained separately. |
| D-004 | Privacy copy accurately describes the unencrypted application database and does not assume FileVault is enabled. |
| D-005 | A fictional journal survives backup/clean restore; wrong passphrase, corruption, and interrupted writes preserve the current journal. |
| D-006 | A clean supported Mac can restore with only the backup and its portable passphrase; Keychain storage is optional. |
| D-007 | A due daily backup runs while active, catches up next launch, and reports pending rather than success when its credential is unavailable. |

## Implementation evidence

Keep tests at observable interfaces. Persistence and migration tests use real temporary databases; browser tests validate the React surface; native Mac checks cover the application shell, VoiceOver, and platform behavior that browser automation cannot establish.

Each task carries verification evidence for its own slice. Record the command or manual scenario, the actual result, and limitations when the task is implemented. Mark a requirement implemented only after its scenarios are verified; OpenSpec validation alone is not that evidence.
