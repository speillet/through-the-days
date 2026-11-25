# personal-timeline

## Purpose

Explore a long-range chronology of recorded experiences and chosen milestones while reusing the journal's existing date navigation and metric semantics.

Sources: Appendix INT-06 (§8), TEST-03/11/12/16; existing mini timeline remains in progress-insights.

## ADDED Requirements

### Requirement: Long-range source navigation

The Path So Far SHALL offer 7/30/90-day, one-year, and custom ranges with accessible zoom/pan, source filters, dated selections, and links back to the existing day and Book views.

#### Scenario: Open a dated source

- **WHEN** the person opens a day or Book entry from a filtered timeline
- **THEN** the correct journal date and slot open and returning preserves the prior range and filters.

#### Scenario: Mini timeline remains distinct

- **WHEN** the person uses the editor's existing 7/14/30-day mini timeline
- **THEN** it remains a view of the same saved observations, not a second chronology store.

#### Scenario: Independent custom range

- **WHEN** the person changes or pans a custom timeline range and later opens My Journal
- **THEN** the timeline keeps its own date bounds without replacing My Journal's date filters.

#### Scenario: One-year pages

- **WHEN** the person pages a one-year range with Earlier range or Later range, including across 29 February
- **THEN** each page covers the 365 dates ending on its end date, and consecutive pages neither repeat nor skip a date.

#### Scenario: Keyboard zoom from a custom range

- **WHEN** the person activates Zoom out for a 22-day custom range, then Zoom in
- **THEN** the range widens to 30 days and narrows to 7 days, preserving its end date and visible source links.

#### Scenario: Range at the journal date limits

- **WHEN** Earlier range or Later range would move a preset range's end date, or either date of a custom range, before 1 January 0001 or after 31 December 9999, or a typed From or To date lies outside those dates
- **THEN** that control is unavailable or the typed date is ignored, and the timeline keeps its current range.

### Requirement: Optional available layers

The timeline SHALL offer hideable layers for check-ins, approved wins and manual milestones, respect insight permissions in every available layer, and identify unavailable later layers without invented data. Later experiments, tags, goals and imports remain owned by their respective changes.

#### Scenario: Excluded entry or win

- **WHEN** an entry or an individual win is excluded from insights
- **THEN** it is absent from the relevant timeline layers, source cards and win-filter decisions, while original Calendar and Book reading retain the person's records.

#### Scenario: Later capability not delivered

- **WHEN** goal or experiment functionality is not yet implemented
- **THEN** the timeline remains useful with existing journal layers and does not imply those features work.

### Requirement: Honest independent measures

Timeline measures SHALL reuse the progress-insights inclusion rules, preserve separate scales/slot observations and missing-data gaps, and avoid a single improvement gauge or ranked best/worst periods.

#### Scenario: Win on a difficult day

- **WHEN** a saved day contains low mood, high optional progress, and an approved win
- **THEN** those records coexist without a failed-day label or an inferred mental-health improvement.

#### Scenario: Two entries and an empty week

- **WHEN** a range contains two check-ins on one day and a week with no entries
- **THEN** the view shows one recorded date with its observations and a gap for the unrecorded week.

### Requirement: User-owned milestones

The system SHALL allow editable, removable private dated milestones without deriving them from a model or implying a clinical outcome.

#### Scenario: Milestone without a title

- **WHEN** the person saves a milestone whose title is empty or blank
- **THEN** the dialog asks for a title and nothing is saved.

#### Scenario: Milestone removed

- **WHEN** the person deletes a manual milestone
- **THEN** it no longer appears in timeline layers or derived insight results.

#### Scenario: Deleted milestone text leaves the live journal files

- **WHEN** the person deletes a manual milestone
- **THEN** the live journal files in the application data folder no longer contain its title or notes once the deletion completes, without waiting for the application to quit.

#### Scenario: Restore private milestones

- **WHEN** a validated encrypted journal backup containing private milestones is restored
- **THEN** their identifiers, dates, titles, notes and revisions are preserved with the journal.
