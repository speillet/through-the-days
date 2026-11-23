# Read and explore the saved journal

## Why

Saved writing becomes useful to revisit through calendar dates, comfortable long-form reading, and transparent progress views.

## What Changes

- Deliver milestone 2 (product-roadmap phase 2), extending the existing timeline and optional weekly-review ideas using appendix INT-05/06.
- Present the same saved records through Today, Calendar, Book View, search, and a 7/14/30-day timeline.
- Track implemented slices and their verification evidence while keeping unfinished acceptance work visible.

## Capabilities

### New Capabilities

- calendar-reading: Month navigation, per-slot markers, previews, and local search.
- book-reading: Chronological, complete, accessible reading of long entries.
- progress-insights: Shared timeline and descriptive, source-linked progress statistics.
- weekly-reviews: Offline weekly counts, authored notes, optional labelled summaries, and freshness.
- personal-timeline: The Path So Far, a long-range filtered view of existing saved sources and private milestones.

### Modified Capabilities

The existing journal remains the authority; its protection and recovery contracts apply to the added reading data.

## Impact

Dependencies: build-offline-journal, including stable save and journal-date behavior.

Sources: README_THROUGH_THE_DAYS.md §§6–8, 14.2–14.3, 16.3, 20–22.

Out of scope: AI interpretations, inferred mental-health scores, ChatGPT data, and public sharing.

Decisions D-010–D-012 resolve O-002–O-004: scored saved drafts contribute with explicit denominators; slot markers remain separate and numerically neutral at 5; Book View displays one entire entry per page with scrolling and preserved position. Summaries are optional local deterministic text; model adapters remain in their own milestone. Chart rendering is an engineering choice.

Status: implemented in the development worktree, with automated evidence recorded in `docs/development-status.md` and `tasks.md`. Remaining acceptance tasks are unchecked. This change has not been archived or synchronised into main specifications.
