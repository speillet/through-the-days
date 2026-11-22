# weekly-reviews

## Purpose

Review a recorded week using transparent counts and source links, retaining the person's notes separately from optional generated summaries.

Sources: README_THROUGH_THE_DAYS.md §§8.4, 18.6; appendix INT-05 (§7), TEST-04/07/18.

## ADDED Requirements

### Requirement: Local weekly reflection

Weekly Review SHALL be user-initiated, use Monday–Sunday ISO weeks in the configured time zone, and remain usable with AI disabled; optional reminders SHALL require opt-in.

#### Scenario: Three entries on two dates

- **WHEN** three in-scope saved entries fall on two journal dates in the selected week
- **THEN** days with entries is 2, not 3, and the exact week boundaries and inclusion rule are shown.

#### Scenario: Empty or sparse week

- **WHEN** the week has no entries or only one or two recorded days
- **THEN** the view reports actual coverage and avoids a bad-week label or broad trend claims.

#### Scenario: AI disabled

- **WHEN** the person opens a weekly review offline without AI
- **THEN** deterministic counts, source navigation, and manual reflection remain usable.

### Requirement: Distinct reviewed evidence

The review SHALL count approved win items and started/completed exercises separately, preserve explicit experiment outcomes, and link each highlight to its dated source.

#### Scenario: Not yet is unknown progress

- **WHEN** an experiment is marked Not yet or has no follow-up
- **THEN** the review preserves that status without a failure score or treating a missing outcome as unsuccessful.

#### Scenario: No duplicate wins

- **WHEN** one canonical win links to an entry's pride reflection
- **THEN** the weekly count includes one win, not the reflection plus a duplicate item.

### Requirement: Authorship and source freshness

Weekly Review SHALL separate user notes from generated text, label AI summaries, retain source dates/versions, and mark derived material stale after source changes while preserving user notes.

#### Scenario: Source edited

- **WHEN** an entry used by a review changes
- **THEN** the review offers recalculation and does not present stale quotations as current evidence.

#### Scenario: Source removed or hidden

- **WHEN** a source is deleted or excluded from insights
- **THEN** its text is removed from generated excerpts and results immediately, while authored review notes are preserved.

#### Scenario: Regenerate a review

- **WHEN** the person regenerates a review after editing their own notes
- **THEN** generated sections can change while those notes remain unchanged.
