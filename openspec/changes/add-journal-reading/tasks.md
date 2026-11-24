# Tasks for read and explore the saved journal

Status: ten implementation slices have automated and native smoke evidence below. Manual native accessibility and input acceptance remains unchecked in section 5. D-010–D-012 resolve the product gates. The change is not archived.

## 1. Scope and first usable slice

- [x] 1.1 Settle draft inclusion, neutral marker treatment, and document-reading acceptance examples. Verify with recorded draft/neutral-marker decisions with example expected values; include the slice's tests and relevant documentation.
- [x] 1.2 Deliver calendar date selection and an exact entry preview from the existing store. Verify with calendar selection and source-entry tests; include the slice's tests and relevant documentation.

## 2. Core behavior

- [x] 2.1 Deliver chronological Book View with complete long text, keyboard navigation, and stable return position. Verify with long-document rendered-coverage and keyboard/resize checks; include the slice's tests and relevant documentation.
- [x] 2.2 Add local search and filters with edit invalidation and original-language excerpts. Verify with Unicode search and stale-index invalidation tests; include the slice's tests and relevant documentation.

## 3. Derived behavior and resilience

- [x] 3.1 Deliver timeline ranges, per-slot values, visible gaps, and keyboard activation. Verify with 7/14/30-day, slot, missing-data, and keyboard tests; include the slice's tests and relevant documentation.
- [x] 3.2 Verify cross-view consistency, coverage/denominators, reduced motion, and source links. Verify with cross-view edit consistency and denominator/source-link checks; include the slice's tests and relevant documentation.

## 4. Weekly review and long-range chronology

- [x] 4.1 Deliver deterministic Monday–Sunday weekly counts and manual notes without AI; verify three in-scope entries on two dates report two recorded days, sparse weeks stay qualified, and win/exercise denominators remain distinct.
- [x] 4.2 Add optional labelled summaries and source-version freshness; verify editing/removing/hiding a source invalidates generated material without losing authored notes or retaining deleted excerpts.
- [x] 4.3 Deliver The Path So Far from shared journal queries with private milestones, ranges, available layers, and source/date navigation; verify missing gaps, two slots, keyboard zoom, and Book return context.
- [x] 4.4 Apply Gentle view and per-surface permissions to long-range and weekly views; verify hidden counters and excluded sources never reappear in another layer. Include slice tests and documentation.

## 5. Native acceptance

- [ ] 5.1 Complete the reading scenarios from confirm-native-macos-checks on a supported Mac: VoiceOver names/focus, real keyboard and trackpad navigation, long Book text, resize/full screen and reduced motion in both appearances. Record the environment, results and any failures in acceptance coverage; automated browser and native smoke results do not complete this task.

## Verification evidence

Audit: November 24, 2026; see [development status](../../../docs/development-status.md) and [acceptance coverage](../../../docs/acceptance-coverage.md#november-24-2026-reading-verification). The full interface/Rust/browser suites and five native smoke launches pass. The manual native task remains open; this change is not ready to archive.

- 1.1: D-010–D-012 are recorded in the decision register and reflected in the specs. Rust reading tests verify scored drafts, two slots, missing metrics and separate observation/day denominators; the Calendar component test verifies neutral 5 independently of slot.
- 1.2 and 2.1: `Reading.test.tsx` and `e2e/reading.spec.ts` verify exact Calendar sources, chronological Morning/Evening reading, full long text once, selection, arrow navigation and scroll retention across resize/return.
- 2.2: `crates/journal-core/tests/reading.rs` verifies Unicode/accent-folded local search and edit/trash invalidation. The component suite combines a text query with slot filters and opens the exact saved source for editing.
- 4.2: Rust and browser tests verify source edit/removal/exclusion invalidates visible summaries while preserving authored notes. Reading tests also cover note-save failure/retry, restart, clearing summaries and authored reading-data backup/restore.
- Review follow-up: `ReadingQueries.test.tsx` defers summary success/failure while editing notes and verifies that the latest text and subsequent edits persist. It also injects a source-list failure and verifies visible error/retry without an empty-week claim. The shared per-week stream serialises summary revisions with note saves.
- 3.1: the component and WebKit/Chromium reading suites verify the historical 14-day default, 7/30-day changes, distinct Morning/Evening values, missing pride and empty-day gaps, all-series-hidden persistence across reload, and Enter opening the exact historical date/source.
- 4.1: the public Rust journal interface and Weekly Review component verify three scored drafts on two civil dates count as 3 entries and 2 recorded days within a Monday–Sunday week. Each metric has its own denominator, a promoted pride win counts once, authored notes add no entry, an outside-week entry is excluded and an empty week stays neutral. The UI explicitly states CBT exercises are unavailable and not counted.
- 3.2: `e2e/reading-consistency.spec.ts` verifies a saved text/energy edit across Calendar, Book, search, Trends, Weekly Review and The Path So Far, with independent means, observation/day coverage, retained notes and stale-summary handling. Reduced motion and horizontal versus vertical scrolling pass in WebKit and Chromium. `ReadingQueries.test.tsx` verifies a delayed old query cannot overwrite a newer result.
- Refresh stability ([issue #8](https://github.com/speillet/through-the-days/issues/8)): `ReadingQueries.test.tsx` holds every reading answer, as native IPC does, and checks each refresh while it is pending. The refreshes are an autosave under Today's timeline; window activation in Calendar, Weekly Review and Book View; a weekly summary recalculation; an insights toggle in My Journal; and a milestone save in The Path So Far. None shows a loading placeholder, and the same elements keep focus, the notes caret, Book text selection and the browsed month. Until the view shows the saved revision, the insights checkbox shows the requested value as busy and ignores a second change (`saveEntry` is called once). A failed insights save shows its error, restores the saved value and accepts the next change. A failed My Journal refresh replaces earlier text with its error. Native IPC timing and VoiceOver remain part of task 5.1.
- Per-metric coverage: the public Rust weekly query and `Reading.test.tsx` verify mood n=3 across two dates while pride n=1 covers one date; each metric displays its own recorded-day coverage rather than the overall entry-date count.
- 4.3: `ReadingNavigation.test.tsx` and `e2e/reading-navigation.spec.ts` verify 7/30/90-day/year/custom ranges, keyboard zoom/pan and gaps, separate slots, hidden milestone layers, exact source selection and retained Book return context. Weekly Book navigation and custom timeline bounds preserve shared filters. Removed sources have explicit empty-selection recovery.
- Resuming a Book selection after changing My Journal filters elsewhere retains its original query without undoing the new shared filters; `ReadingNavigation.test.tsx` verifies this independently of timeline/weekly selection.
- 4.4: `ReadingPrivacy.test.tsx`, `e2e/reading-privacy.spec.ts` and the Rust insight-win-filter test verify hidden score filters are suspended and restored, every available insight layer omits excluded records/wins, denominators match filter eligibility, and original Calendar/Book reading retains owned data. Weekly notes and backup prompts remain accessible in Gentle view.
- Native reading: `native-smoke/reading.js` exercises real Tauri/SQLite Calendar, Book, report, weekly-note/summary and private-milestone operations; `reading-recover.js` verifies authored reading records after a fresh process launch. Both use the runner's disposable development journal. VoiceOver and physical input remain unverified.

## Workflow follow-up

- Archive only after all tracked work is delivered and its verification evidence is recorded.
- Confirm the archived main specifications describe the delivered behavior; keep later milestones as separate changes.
- Exercise counts and experiment outcomes remain unchecked in add-cbt-companion, which now owns their Weekly Review integration. No CBT or model behavior is claimed by this change.
