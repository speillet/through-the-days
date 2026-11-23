# Acceptance coverage

Every numbered case in the [product acceptance tests](acceptance-tests.md), linked from product-reference section 20, is assigned below. Milestone 1 is the first usable offline journal; later rows stay deferred until their milestone. These are verification plans, not executed application tests.

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
| 24 | Depth switching retains one entry | 1; worksheets in 3 | [daily-check-in](../openspec/changes/build-offline-journal/specs/daily-check-in/spec.md) — Writing depth preserves entry identity |
| 25 | Independent nullable progress and unchanged completion | 1 | [daily-check-in](../openspec/changes/build-offline-journal/specs/daily-check-in/spec.md) — Optional perceived progress |
| 26 | Explicit multiple wins and no double counting | 1 | [daily-check-in](../openspec/changes/build-offline-journal/specs/daily-check-in/spec.md) — User-owned small wins |
| 27 | ISO-week counts, staleness, and preserved notes | 2 | [weekly-reviews](../openspec/changes/add-journal-reading/specs/weekly-reviews/spec.md) — Local weekly reflection; Authorship and source freshness |
| 28 | Long-range layers, gaps, and reading context | 2; later layers as delivered | [personal-timeline](../openspec/changes/add-journal-reading/specs/personal-timeline/spec.md) — Long-range source navigation; Optional available layers |
| 29 | Manual experiment prediction, review, and learning | 3 | [cbt-worksheets](../openspec/changes/add-cbt-companion/specs/cbt-worksheets/spec.md) — Prediction-to-learning experiments |
| 30 | Verified personal evidence and read-only questions | 4.1 (P2) | [journal-questions](../openspec/changes/add-source-backed-insights/specs/journal-questions/spec.md) — Explicit source scope and answer evidence |
| 31 | Qualified descriptive patterns with coverage | 4.1 (P2) | [personal-patterns](../openspec/changes/add-source-backed-insights/specs/personal-patterns/spec.md) — Qualified associations |
| 32 | Gentle view preserves data and integrity warnings | 1, then every delivered surface | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — Gentle view |
| 33 | Independent clearing and source-deletion propagation | 1, then each derivative feature | [product-guardrails](../openspec/changes/build-offline-journal/specs/product-guardrails/spec.md) — Independent derived-data control |
| 34 | Selected private formats and idempotent round trip | 6 | [private-data-portability](../openspec/changes/ship-macos-and-approved-exports/specs/private-data-portability/spec.md) — Versioned identity-preserving round trip |
| 35 | Untrusted source instructions and opt-in payload retention | 3; questions in 4.1 | [llm-assistance](../openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md) — Untrusted source content |
| 36 | Supportive correction, calibrated disagreement, and self-correction | 3, then every affected assistant surface | [llm-assistance](../openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md) — Compassionate evidence-based challenge; Calibrated respectful disagreement; Shared stance instructions and evaluation |

## Coverage requiring more than one capability

- Completion integrity and score-range scenarios add validation beyond case 2; optional pride has its separate 1–10 range.
- Case 7 includes goal-counters — Transparent time and visibility when goals are delivered.
- Case 12 also uses local-persistence — Safe migrations and local-data-protection — Encrypted local backups before real use.
- Case 13 also uses local-persistence — Progressive autosave and errors.
- Case 20 combines llm-assistance consent, chatgpt-import source identity, conversation-analysis provenance, and approved-exports preview/approval.
- Case 22 also uses calendar-reading — Local search and filtering and chatgpt-import — Separate original-language store.
- Case 23 additionally uses llm-assistance — English adapter instructions; source-copy originality is covered by product-guardrails — Accessible original interface.

- Cases 24–35 consolidate the new/refined appendix behavior. The [appendix assessment](appendix-integration.md) maps all 22 original appendix TEST IDs without copying them into competing requirements.
- Case 30 additionally uses personal-memory — Verified dated evidence for Looking Back and pinned source cards.
- Case 34 also covers private-data-portability — Explicit private export selection and Portability does not widen sharing.
- Case 35 also uses llm-assistance — Explicit private-payload retention and English adapter instructions.

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

## Milestone 1 evidence

The isolated milestone-1 branch was checked on November 23, 2026 with synthetic data. `npm run check`, 416 interface tests, 147 Rust tests and 52 WebKit/Chromium tests pass. Clippy, frontend compilation and the macOS debug build pass. Three native launches verify writing/save, exact recovery after restart and English UI with French system-language settings. [Milestone 1 status](milestone-1-status.md) records commands, scope and remaining acceptance.

| Acceptance cases | Concrete evidence | Limits |
|---|---|---|
| 1–3, 7, 13 | `crates/journal-core/tests/journal.rs`, persistence/schema suites; autosave/clock/exit state tests; writing/editor browser suites. | Only acknowledged revisions are durable; native OS termination limits are documented. |
| 9–10, 12 | Core recovery/migration suites and native state tests cover coherent snapshots, wrong keys, corruption, partial writes, clean restore, daily/catch-up, recovery after failed open and managed erasure. Privacy guards exclude interface network APIs/remote assets. | OS networking disabled, actual Keychain/file dialogs and physical exFAT checks remain unexecuted. |
| 8, 21–22 | English-copy, privacy and Unicode guards; browser keyboard, reduced-motion, appearance, small-window and accessibility checks. | Automated scans do not establish VoiceOver or every native interaction. |
| 24–26, 32 | WritingDepth/GentleView/check-in/domain tests and browser writing scenarios verify the same entry survives depth/visibility changes, nullable progress and explicitly promoted wins without double counting. | Later reading-surface combinations belong to milestone 2. |
| 33 | Trash removes active source access; native erasure covers the journal, its companions, managed set-aside journals, device settings and credentials. Independent encrypted backups remain separate. | Full derivative-surface acceptance remains unchecked; future derivatives are not present here. |

The milestone-1 task file retains unfinished acceptance. Later-milestone rows in the ownership table remain plans. Verified main-spec sync is limited to entries, check-in, editor and persistence; the active change is not archived.

### November 23, 2026 audit

The active `through-the-days-reading` worktree passed 422 interface tests, 151 Rust tests, and 62 WebKit/Chromium end-to-end tests. TypeScript, Clippy, the frontend build, and the native debug bundle build pass. The native smoke check passed writing/save, exact recovery after restart, and French-system-language launches with English interface copy. See [commands and limits](development-status.md#verification-performed).

| Cases | Evidence available | Remaining scope |
|---|---|---|
| 1–3, 7, 9, 12–13, 24–26 | Core journal/persistence/migration/recovery suites; frontend state/check-in/writing-depth suites; writing/editor/protection browser suites; native writing/restart smoke. | Native disabled-network run and broader original milestone integration review. |
| 4–6, 14, 22 | Rust reading queries verify Unicode search invalidation, separate slots, scored drafts and metric denominators. Reading component/browser suites verify Calendar sources and complete Book text, selection, resize, keyboard navigation and return position. | Historical 7/14/30-day ranges, empty gaps, hidden-series persistence and Enter source navigation now pass in both engines. Cross-view edit combinations and native reading interactions remain. |
| 27–28, 32–33 | Weekly notes survive save retry/navigation/restart; source changes hide stale summaries; milestones support editing/deletion; notes/milestones survive encrypted backup/restore. Insight exclusions preserve original Calendar reading. | The explicit three-entry/two-date example now passes with separate metric denominators, canonical wins and authored notes outside entry counts. Full layer/context navigation, Gentle-view combinations and complete source-removal audit remain. |
| 8, 10, 21 | Automated keyboard, privacy/language guards and accessibility suites; six reading views have no serious/critical axe violations in either appearance; native smoke preserves multilingual text with English UI on French locale. | VoiceOver, real-key navigation, full screen, native dialogs/Keychain, networking disabled, and physical exFAT backup/restore. |

Later-milestone acceptance cases remain unimplemented. Passing tests above do not establish every scenario in a mapped case. The original changes remain active and their incomplete tasks stay unchecked; the [native checklist](../openspec/changes/confirm-native-macos-checks/tasks.md) records manual checks without transferring those obligations.
