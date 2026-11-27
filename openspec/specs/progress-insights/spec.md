# progress-insights Specification

## Purpose

Show descriptive, source-linked progress without converting missing observations or difficult feelings into performance judgments.

Sources: README_THROUGH_THE_DAYS.md §§8, 14.2–14.3, 16.3, 20 case 14.

## Requirements

### Requirement: Navigable progress timeline

The timeline SHALL offer 7/14/30-day ranges ending at the viewed journal date, default to 14 days, and allow pointer and keyboard navigation to a day.

#### Scenario: Viewed historical date

- **WHEN** the person selects a 14-day timeline for an earlier entry
- **THEN** the range includes that viewed date and the preceding 13 civil dates.

#### Scenario: Hidden series

- **WHEN** the person hides every metric series
- **THEN** the preference is retained and no score is forced into view.

#### Scenario: Ending date outside the journal dates

- **WHEN** the person types a Trends ending date after 31 December 9999, such as a year with a stray fifth digit
- **THEN** the timeline keeps its previous ending date and range, and every view remains usable.

#### Scenario: Ending on today past midnight

- **WHEN** Calendar's Today, Weekly Review's This week or End today on a preset range in The Path So Far last set the reading date, and the clock then passes midnight while the app stays open
- **THEN** Trends ends on the new date, as when no date was chosen.

### Requirement: Explicit observations and missing data

Progress views SHALL include nullable perceived progress when selected, preserve Morning/Evening observations, label any explicitly selected aggregation, show sample sizes and coverage, and treat missing values as gaps rather than zero.

#### Scenario: One recorded value

- **WHEN** one selected day has one recorded mood value and the other slot is missing
- **THEN** the display shows the observation and n=1 without adding a zero.

#### Scenario: Missing pride

- **WHEN** pride is absent on one day
- **THEN** the pride chart has a gap and keeps the documented 1–10 scale.

### Requirement: Transparent inclusion

The system SHALL include saved scored drafts and completed entries (D-010), omit missing values and excluded sources, and display each metric's observation count, distinct recorded days and civil-date coverage.

#### Scenario: Mixed entry statuses

- **WHEN** a selected range contains a draft and a completed entry
- **THEN** the statistic states its inclusion rule and count rather than silently changing the population.

#### Scenario: Different coverage per metric

- **WHEN** three saved drafts on two dates contain three mood values but pride only on one date
- **THEN** mood shows n=3 across two recorded days and pride shows n=1 across one recorded day, each within the same civil-date range.

#### Scenario: Only insight-visible wins affect filters

- **WHEN** one entry has only an excluded win and another has an included win
- **THEN** the insight filter With a small win selects only the latter, Without a small win selects only the former, and their denominators use the same eligible sources.

### Requirement: Consistent gentle visibility

Reading views SHALL honour Gentle view and score-display preferences by hiding numeric tracking and optional counts and suspending numeric filters without deleting stored data or filter choices. Writing, original sources, authored notes, permitted wins, save errors and backup prompts SHALL remain accessible.

#### Scenario: Hidden score filter

- **WHEN** Gentle view hides an active minimum-score filter
- **THEN** Calendar, My Journal, Book View, Trends and The Path So Far stop applying it; turning Gentle view off restores the person's unchanged filter choices.

#### Scenario: Weekly and timeline layers

- **WHEN** Gentle view is enabled with weekly notes and excluded wins present
- **THEN** notes and permitted sources remain accessible, numeric summaries stay hidden, and excluded wins do not reappear in any insight layer.

### Requirement: Multiple progress dimensions

Progress views SHALL distinguish experience, reported actions, coping, and explicitly reported follow-through, with links to their sources and descriptive rather than causal language.

#### Scenario: Useful action with low mood

- **WHEN** the person reports rest while mood remains low
- **THEN** the action can be recognised without claiming mood improvement.

#### Scenario: Intention without outcome

- **WHEN** an intention has no user-confirmed outcome
- **THEN** it is not counted as a completed action.
