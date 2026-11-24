# Development status

Audited on November 24, 2026. This records the development branch, not a published release or a completed OpenSpec archive.

## Working copies

These directories are Git worktrees of the same repository, sharing committed history but keeping separate branches and working files:

| Directory | Branch | Observed state |
|---|---|---|
| `through-the-days` | `feat/offline-journal` | Original journal/reading working files retained unchanged. |
| `through-the-days-milestone-1` | `feat/milestone-1` | Isolated journal scope merged into main through [PR #4](https://github.com/speillet/through-the-days/pull/4), native implementation `c4c0343`. |
| `through-the-days-reading` | `feat/reading-and-reviews` | Active milestone-2 implementation based on PR #4, including its native recovery, managed erasure and quit-safety corrections. |

Milestone 1 has separate native-fix, browser-isolation, specification and quit-regression commits. Reading changes follow that base; the original worktree is not overwritten. A local Git stash preserves the pre-integration reading snapshot as an additional recovery point.

## Implementation

| Milestone | Present in this branch | Remaining before completion |
|---|---|---|
| 1: offline journal | Tauri/React application, SQLite journal authority, independent Morning/Evening entries, optional check-in, editor and autosave, civil dates, writing depths, Gentle view, Trash, encrypted daily backups and restore, startup recovery. | Native manual acceptance, remaining privacy/integration evidence, and final specification reconciliation. |
| 2: reading and reviews | Calendar, My Journal search and filters, complete scrolling Book View, per-slot 7/14/30-day timelines, Trends, weekly notes and optional local summaries, The Path So Far with private milestones and source navigation. Reading records are included in schema-3 migrations and encrypted backup/restore. Cross-view edits, filters, privacy and return context have automated coverage; native authored-record recovery passes. | Manual native accessibility and physical input acceptance (task 5.1). The change remains active. |
| 3 and later | Planning artifacts only for CBT, optional AI, tags, goals, source-backed exploration, ChatGPT imports, portability, and wider distribution. | Implementation. Their navigation items remain unavailable. |

Saved scored drafts contribute to metrics with explicit observation and day coverage (D-010). Each metric reports its own distinct scored dates: mood n=3 across two dates does not imply that a single pride observation covers both dates. Morning/Evening markers remain separate, numeric 5 is neutral, and emotion labels stay independent (D-011). Book View renders one whole entry per page, with selectable scrolling text and retained position (D-012).

Weekly summaries are deterministic local text. No chatbot, model adapter, or remote request is implemented. Authored notes and milestones remain separate from generated summaries.

Weekly note saves and summary revisions are serialised per week. Editing and navigation during generation preserve the latest notes; a failed summary still permits saving current and subsequent edits. A source-list failure has a retry state instead of an empty-week message.

Book View retains its source selection without replacing the parent's filters. Timeline and weekly selections retain insight eligibility; original Calendar/Book reading still exposes the person's own records. Custom timeline dates are independent of My Journal dates. Gentle view suspends hidden numeric filters while preserving the saved choices, and an excluded win cannot affect insight win filters or denominators.

## Verification performed

All checks use synthetic data. The audit ran against the reading implementation in `through-the-days-reading`; its backend, views and verification are kept in separate commits.

| Command | Actual result |
|---|---|
| `npm run check` | TypeScript passes. |
| `npm test` | 435 tests pass across 39 files. |
| `CI=true npm test -- --maxWorkers=2 --testTimeout=15000` | The same 435 tests pass with the CI resource limits. |
| `TTD_E2E_PORT=1435 npm run test:e2e -- --workers=2` | 70 tests pass across WebKit and Chromium, using a separate server to avoid another worktree's preview. |
| `cargo test --workspace --locked -- --test-threads=2` | 152 Rust tests pass. |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passes. |
| `npm run build` | Frontend build passes; Vite reports a large-chunk advisory. |
| `npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app` | macOS debug application bundle builds. |
| `npm run smoke:native` | Five native launches pass: write/save; recover exact text and scores; recover on French system-language settings with English UI; Calendar/Book/reports, weekly notes and private milestones; recover authored reading records after restart. |

The native smoke runner creates and removes a temporary development journal. It does not access a personal journal. Its scenarios exercise Tauri/SQLite writing and reading recovery, but do not establish VoiceOver usability, physical trackpad interaction or a disabled-network Mac.

All ten implementation slices have evidence. A separate manual native acceptance task stays unchecked (10/11 tasks complete). Coverage includes 200-paragraph rendered text, selection and scroll retention, keyboard and horizontal-wheel navigation, Unicode search invalidation, late-query rejection, cross-view edits and denominators, 7/30/90-day/year/custom timeline context, Gentle-view combinations, source/win permissions, weekly-note retry/restart, summary staleness, milestones, and encrypted backup/restore of authored reading data. Accessibility scans found no serious or critical violations on the six reading views in both appearances; they do not establish VoiceOver usability.

Local command logs are kept in the ignored `.reference/verification/` directory. Reproducible tests live in `apps/desktop/e2e/reading*.spec.ts`, `apps/desktop/src/features/reading/Reading*.test.tsx`, `crates/journal-core/tests/reading.rs`, `apps/desktop/native-smoke/`, and the existing journal/native suites.

The first PR #5 interface run reached the default five-second timeout in three multi-step check-in/Gentle-view tests; 432 tests passed and no assertion failure was reported. A follow-up showed that nested npm scripts consumed the new CLI options, so the root test script now explicitly forwards them. CI runs at most two Vitest workers with a bounded 15-second test timeout; its invoked Vitest command is checked in the log. The same assertions, synthetic data and real autosave waits remain in place. This changes verification scheduling only, with no application or product-requirement change.

Independent standards and specification reviews were repeated after corrections. The notes/summary revision race, false empty-week error state and duplicated source-eligibility logic were addressed; neither review reports a remaining concrete finding. This does not replace the outstanding native manual checks.

## Open acceptance and delivery work

- Keep the original worktree intact. Its native cleanup is integrated through the milestone-1 base; neither this branch nor PR #4 includes the original worktree's uncommitted files indiscriminately.
- Complete the original milestones' unchecked acceptance tasks. The [native checklist](../openspec/changes/confirm-native-macos-checks/tasks.md) tracks VoiceOver, real-key navigation, full screen, dialogs/Keychain, networking disabled, and an actual exFAT backup drive. These checks have not been performed by this audit.
- Review native termination behaviour: window close and the app's quit flow flush pending work; macOS termination paths outside that flow remain a documented platform limitation in [technical design](technical-design.md).
- Four verified milestone-1 capabilities and five verified reading capabilities are synchronised in `openspec/specs/`. Both changes remain active and archives remain empty. Exercise/experiment Weekly Review integration is an unchecked milestone-3 task, not delivered reading functionality.
- PR #4 is merged into main after all four GitHub checks passed. The reading branch includes that main merge. Its separate PR must retain the manual acceptance limits and follow the [PR specification checklist](specification-workflow.md#pull-request-completion); a PR merge does not complete the native checks or archive a milestone.

Use the [roadmap](roadmap.md) for intended order and the [acceptance map](acceptance-coverage.md) for requirement ownership. Source code, passing tests, and remaining checks are deliberately recorded separately.
