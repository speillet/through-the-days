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

### Requirement: Optional available layers

The timeline SHALL offer hideable layers for check-ins, approved wins, manual milestones, and later available experiments, tags, goals, or imported data, respecting source permissions and explicit counter opt-in.

#### Scenario: Hidden counter or disabled source

- **WHEN** a goal is hidden or imported conversations are not enabled
- **THEN** its data is absent from the timeline as well as the other affected surfaces.

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

#### Scenario: Milestone removed

- **WHEN** the person deletes a manual milestone
- **THEN** it no longer appears in timeline layers or derived insight results.
