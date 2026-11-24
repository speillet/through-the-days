# Milestone 1 implementation status

Audited November 23, 2026 on `feat/milestone-1`. This is an offline-journal development preview, not a signed release or a completed product-change archive.

## Scope

The branch includes the Rust journal authority and Tauri/React application: two independent slots per chosen civil date, optional reflection, rich writing, explicit and automatic saves, writing depths, Gentle view, thirty-day Trash, encrypted daily backups with next-launch catch-up, and validated restore. It uses schema 2; reading/reviews and their schema-3 additions are not part of this PR.

Native refinements keep Keychain/folder waits outside the journal lock, finalise startup before reporting its state, preserve damaged journals before replacement, retain pending writing on quit timeout or renderer failure and include managed set-aside journals in explicit application-data erasure. Debug builds use a separate development data folder and Keychain identity.

## Actual verification

All fixtures and journals are synthetic. The isolated branch passed:

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | Lockfile installation passes. |
| `npm run check` | TypeScript passes. |
| `npm test` | 416 tests across 35 files pass. |
| `TTD_E2E_PORT=1433 npm run test:e2e -- --workers=2` | 52 WebKit/Chromium tests pass on this worktree's own server. |
| `cargo test --workspace --locked -- --test-threads=2` | 147 tests pass: 74 journal-core and 73 native-shell tests. |
| `npm run build` | Frontend builds; Vite reports a large-chunk advisory. |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passes. |
| `npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app` | macOS debug bundle builds. |
| `npm run smoke:native` | Three native launches pass: write/save, exact recovery, and recovery with French system-language settings and English UI. |

The smoke runner uses and removes a temporary development journal rather than opening personal data. It does not exercise VoiceOver or a disabled-network Mac. Local raw logs live in ignored `.reference/verification/`.

The quit regression first reproduced an unanswered flush approving exit; it now verifies the app stays open and a later quit retries. Emission/timer failures follow the same safe path. The review finding was rechecked after the fix.

### GitHub CI

The first [Application run](https://github.com/speillet/through-the-days/actions/runs/45264362275) passed the Linux journal-core job. Both macOS jobs were cancelled before execution because GitHub could not allocate ARM runners after repeated attempts. The specification workflow passed.

CI now uses the [standard macOS 15 Intel runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) for the same native/interface checks. Local native verification above ran on Apple Silicon. Rust test concurrency is bounded to two because password-derived encryption uses substantial memory per test. This changes verification infrastructure only; product requirements and delivered behaviour are unchanged. The rerun must establish its own result and is not implied to pass by these configuration changes.

The [Application rerun](https://github.com/speillet/through-the-days/actions/runs/45267866641) and [specification checks](https://github.com/speillet/through-the-days/actions/runs/45267866525) subsequently passed. [PR #4](https://github.com/speillet/through-the-days/pull/4) was merged into main on November 23, 2026, preserving its separate commits. This GitHub merge does not archive the active OpenSpec change or complete the manual checks below.

## Specification reconciliation

The verified `journal-entries`, `daily-check-in`, `journal-editor` and `local-persistence` deltas are synchronised into `openspec/specs/`. The complete intended contracts remain in the active `build-offline-journal` change. `desktop-shell`, `local-data-protection` and `product-guardrails` remain there pending broader platform/acceptance verification; their existing code and automated coverage are not a substitute for all their native scenarios.

Twelve of sixteen original tasks have recorded evidence. Tasks 1.2, 5.1, 5.2 and 7.1 remain unchecked. No change is archived. The supplementary [native checklist](../openspec/changes/confirm-native-macos-checks/tasks.md) preserves, rather than replaces, those obligations.

## Remaining acceptance and limits

- Native Skip/focus walkthrough, VoiceOver, real-key navigation, full screen and a disabled-network Mac run.
- Actual system folder/file dialogs and Keychain prompts, plus backup/restore using a physical exFAT drive.
- The original full acceptance review, including every delivered derivative/erasure surface. No reading index, generated summary or model feature ships in this branch.
- macOS-initiated termination from Dock/app switcher/logout/shutdown can bypass the supported flush-before-quit flow. Last acknowledged revisions remain durable; unacknowledged input is not guaranteed after forced termination. See [engineering limits](product-decisions.md#engineering-proposals).

Reading work is retained separately in `through-the-days-reading` on `feat/reading-and-reviews`. It will be based on this milestone-1 branch after the PR is published, with its own specs and tests.
