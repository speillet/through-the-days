# Development status

Audited on November 23, 2026. This records the development branch, not a published release or a completed OpenSpec archive.

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
| 2: reading and reviews | Calendar, My Journal search and filters, complete scrolling Book View, per-slot 7/14/30-day timelines, Trends, weekly notes and optional local summaries, The Path So Far with private milestones and source navigation. Reading records are included in schema-3 migrations and encrypted backup/restore. | Remaining cross-view edit, timeline layer/context, Gentle-view/privacy combinations and native reading checks; see the change's unchecked tasks. |
| 3 and later | Planning artifacts only for CBT, optional AI, tags, goals, source-backed exploration, ChatGPT imports, portability, and wider distribution. | Implementation. Their navigation items remain unavailable. |

Saved scored drafts contribute to metrics with explicit observation and day coverage (D-010). Morning/Evening markers remain separate, numeric 5 is neutral, and emotion labels stay independent (D-011). Book View renders one whole entry per page, with selectable scrolling text and retained position (D-012).

Weekly summaries are deterministic local text. No chatbot, model adapter, or remote request is implemented. Authored notes and milestones remain separate from generated summaries.

## Verification performed

All checks use synthetic data. The audit ran against the reading implementation in `through-the-days-reading`; its backend, views and verification are kept in separate commits.

| Command | Actual result |
|---|---|
| `npm run check` | TypeScript passes. |
| `npm test` | 422 tests pass across 36 files. |
| `TTD_E2E_PORT=1434 npm run test:e2e -- --workers=2` | 62 tests pass across WebKit and Chromium. |
| `TTD_E2E_PORT=1434 npm run test:e2e -- reading.spec.ts --workers=2` | Ten reading checks pass across both engines on a separate server, avoiding another worktree's preview. |
| `cargo test --workspace --locked -- --test-threads=2` | 151 Rust tests pass. |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passes. |
| `npm run build` | Frontend build passes; Vite reports a large-chunk advisory. |
| `npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app` | macOS debug application bundle builds. |
| `npm run smoke:native` | Three native launches pass: write/save, restart/recover exact text and scores, and recover with French system-language settings while keeping English UI. |

The native smoke runner creates and removes a temporary development journal. It does not access a personal journal. Its current scenarios exercise writing/recovery, not every reading screen or a disabled-network Mac.

Seven of ten reading tasks now have evidence, including historical 7/14/30-day navigation, retained hidden series and the three-entry/two-date ISO-week example. Reading coverage includes 200-paragraph rendered text, selection and scroll retention after resize/return, arrow navigation, Unicode search invalidation, per-metric denominators, exclusion of sources from insights, weekly-note restart/retry, summary staleness, milestone editing, and backup/restore of authored reading data. Accessibility scans found no serious or critical violations on the six reading views in light and dark modes. These scans do not establish VoiceOver usability.

Local command logs are kept in the ignored `.reference/verification/` directory. Reproducible tests live in `apps/desktop/e2e/reading.spec.ts`, `apps/desktop/src/features/reading/Reading.test.tsx`, `crates/journal-core/tests/reading.rs`, and the existing journal/native test suites.

## Open acceptance and delivery work

- Keep the original worktree intact. Its native cleanup is integrated through the milestone-1 base; neither this branch nor PR #4 includes the original worktree's uncommitted files indiscriminately.
- Complete the original milestones' unchecked acceptance tasks. The [native checklist](../openspec/changes/confirm-native-macos-checks/tasks.md) tracks VoiceOver, real-key navigation, full screen, dialogs/Keychain, networking disabled, and an actual exFAT backup drive. These checks have not been performed by this audit.
- Review native termination behaviour: window close and the app's quit flow flush pending work; macOS termination paths outside that flow remain a documented platform limitation in [technical design](technical-design.md).
- Reconcile the final implementation with requirements and acceptance evidence before a PR merge. The journal and reading changes remain active. Four verified milestone-1 capabilities are in `openspec/specs/`; reading deltas are not yet synchronised, and archives remain empty.
- PR #4 is merged into main after all four GitHub checks passed, with native/manual limits still explicit. The reading branch includes that main merge. Reading is a separate implementation branch; finish its remaining acceptance before finalising a reading PR. Follow the [PR specification checklist](specification-workflow.md#pull-request-completion).

Use the [roadmap](roadmap.md) for intended order and the [acceptance map](acceptance-coverage.md) for requirement ownership. Source code, passing tests, and remaining checks are deliberately recorded separately.
