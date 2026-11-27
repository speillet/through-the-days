# weekly-reviews Specification

## Purpose

Review a recorded week using transparent counts and source links, retaining the person's notes separately from optional generated summaries.

Sources: README_THROUGH_THE_DAYS.md §§8.4, 18.6; appendix INT-05 (§7), TEST-04/07/18.

## Requirements

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

#### Scenario: New week while writing notes

- **WHEN** no week is chosen and the clock passes midnight while the person writes the shown week's notes, or before those notes are saved
- **THEN** a new day in the same week keeps the review in place, and a new week waits until the notes are saved and no longer being edited, so they keep their text, focus and week.

#### Scenario: This week followed into a new week

- **WHEN** the person activates This week and the clock later passes into the next week while the app stays open
- **THEN** the review follows today into the new week, as when no week was chosen.

#### Scenario: This week while earlier notes are saving

- **WHEN** the review keeps an earlier week after midnight because its notes are still being saved, and the person activates This week
- **THEN** the review shows the current week, and those notes are still saved to their own week.

#### Scenario: Week that ends in year 10000

- **WHEN** the person reviews the week of Monday 27 December 9999, which ends on Sunday 2 January 10000
- **THEN** its counts, sources and notes load and save as in any other week.

#### Scenario: Source load failure

- **WHEN** weekly counts load but the source list fails or is still loading
- **THEN** the view shows its loading state or a recoverable error with retry instead of claiming that the week is empty; authored notes remain usable.

#### Scenario: First or last journal week

- **WHEN** moving one week from the selected date would pass 1 January 0001 or 31 December 9999
- **THEN** Previous week or Next week is unavailable and the review keeps its selected date.

### Requirement: Distinct reviewed evidence

The review SHALL count approved canonical wins separately from reported actions, link each highlight to its dated source, and identify unavailable exercise functionality without inventing counts. Exercise counts and experiment outcomes are added by the subsequent CBT change.

#### Scenario: Exercises not delivered

- **WHEN** the person opens a review before CBT exercises are available
- **THEN** the app states that exercises are unavailable and not counted rather than displaying zero as an observed result.

#### Scenario: No duplicate wins

- **WHEN** one canonical win links to an entry's pride reflection
- **THEN** the weekly count includes one win, not the reflection plus a duplicate item.

### Requirement: Authorship and source freshness

Weekly Review SHALL separate user notes from optional labelled deterministic local summaries, retain source dates/versions, and mark derived material stale after source changes while preserving user notes. Any later AI summary remains subject to the shared llm-assistance policy.

#### Scenario: Source edited

- **WHEN** an entry used by a review changes
- **THEN** the review offers recalculation and does not present stale quotations as current evidence.

#### Scenario: Source removed or hidden

- **WHEN** a source is deleted or excluded from insights
- **THEN** its text is removed from generated excerpts and results immediately, while authored review notes are preserved.

#### Scenario: Regenerate a review

- **WHEN** the person regenerates a review after editing their own notes
- **THEN** generated sections can change while those notes remain unchanged.

#### Scenario: Notes edited during generation

- **WHEN** the person edits notes while a local summary is being generated
- **THEN** the newer text remains editable and saves on the acknowledged notes revision without a permanent conflict, including after navigation.

#### Scenario: Summary generation fails during editing

- **WHEN** local summary generation fails while the person edits notes
- **THEN** the error is reported separately and current and subsequent authored notes can still be saved.

#### Scenario: Summary keeps the notes revision

- **WHEN** a local summary is generated or regenerated for a week whose notes are saved
- **THEN** the notes and their revision are unchanged, so a notes save based on the revision read before generation succeeds, and only the source fingerprint marks the summary stale.

#### Scenario: Failed weekly write

- **WHEN** the journal reports an error for a notes save or a local summary
- **THEN** nothing from that request is stored, and the notes can be saved again on their current revision.

#### Scenario: Reply lost after a weekly write

- **WHEN** a notes save or a local summary is stored but the interface receives a failure instead of its reply
- **THEN** the app does not treat that write as a change made elsewhere: the notes, including text typed or deleted since, reach Saved after at most one retry or with the next autosave, are not shown as Saved before then, and closing, quitting, restore and erasure then no longer wait for them.

#### Scenario: Notes changed elsewhere

- **WHEN** a notes save is refused because the stored notes changed since Weekly Review last saved or loaded them
- **THEN** the app reads the week again instead of resending: when the stored notes equal the text being saved, or the text of an earlier save that reported an error and so may have been stored with its reply lost, it adopts their revision and saves any newer text on it; when only the revision changed, it sends the text again once; otherwise it keeps the person's text unsaved and offers "Keep my text", which saves it over the stored notes, or "Load saved text", which replaces it with them.

#### Scenario: Restore authored weekly notes

- **WHEN** a validated encrypted journal backup is restored into a clean destination
- **THEN** authored weekly notes retain their week, text and revision independently of disposable generated summaries.
