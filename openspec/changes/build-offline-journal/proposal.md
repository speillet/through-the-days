# Build the first usable offline journal

## Why

A person needs to write, record a skippable check-in, and recover exactly what was saved after reopening the Mac app. The first delivery must be useful without connectivity or analytics.

## What Changes

- Deliver milestone 1 (product-roadmap phases 0–1, with backup/restore advanced by D-005).
- Launch a personal Mac app, complete or skip reflection, write in either slot, and recover data after restart. Make backup/restore usable before real-data use.
- Add optional perceived progress, data-preserving writing depths, and multiple user-owned wins without changing the two-slot or completion rules (appendix INT-01/02/10).
- Record verified implementation slices and retain unchecked acceptance work until its evidence exists.

## Capabilities

### New Capabilities

- desktop-shell: Mac navigation, a single running copy, themes, settings, and keyboard access.
- journal-entries: Dates, slots, draft/completion lifecycle, and conflict handling.
- daily-check-in: Writing depths, four independent dimensions, optional reflections, and user-approved small wins.
- journal-editor: Comfortable writing and portable document content.
- local-persistence: Atomic saves, migration, autosave, and restart recovery.
- local-data-protection: Thirty-day trash, accurate protection claims, encrypted backup and restore.
- product-guardrails: English copy, multilingual user text, accessibility, private defaults, and Gentle view.

### Modified Capabilities

None. This change introduces the first capabilities; verified entry, check-in, editor and persistence deltas are synchronised to main specs while broader native acceptance remains open.

## Impact

Dependencies: No product dependency; this is the first implementation milestone.

Sources: README_THROUGH_THE_DAYS.md §§0–5, 10–14, 19–22; decisions D-001–D-009.

Out of scope: Calendar, Book View, trends, tags, counters, CBT, AI, ChatGPT import, cloud accounts, and public release packaging.

Backup choices are resolved: D-006/D-007 settle portable recovery, daily frequency and catch-up; D-009 and `docs/backup-format.md` settle the chosen folder, 30 validated snapshots and future-only credential changes. No unresolved product choice blocks this implementation. Native acceptance still requires the evidence tracked in `tasks.md`.

Status: offline-journal implementation prepared for review. Automated and native-smoke evidence is recorded in `docs/milestone-1-status.md` and acceptance coverage. The change remains active, with unfinished acceptance tasks unchecked; it is not archived.
