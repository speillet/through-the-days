# progress-insights

## Purpose

Show descriptive, source-linked progress without converting missing observations or difficult feelings into performance judgments.

Sources: README_THROUGH_THE_DAYS.md §§8, 14.2–14.3, 16.3, 20 case 14.

## ADDED Requirements

### Requirement: Navigable progress timeline

The timeline SHALL offer 7/14/30-day ranges ending at the viewed journal date, default to 14 days, and allow pointer and keyboard navigation to a day.

#### Scenario: Viewed historical date

- **WHEN** the person selects a 14-day timeline for an earlier entry
- **THEN** the range includes that viewed date and the preceding 13 civil dates.

#### Scenario: Hidden series

- **WHEN** the person hides every metric series
- **THEN** the preference is retained and no score is forced into view.

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

### Requirement: Multiple progress dimensions

Progress views SHALL distinguish experience, reported actions, coping, and explicitly reported follow-through, with links to their sources and descriptive rather than causal language.

#### Scenario: Useful action with low mood

- **WHEN** the person reports rest while mood remains low
- **THEN** the action can be recognised without claiming mood improvement.

#### Scenario: Intention without outcome

- **WHEN** an intention has no user-confirmed outcome
- **THEN** it is not counted as a completed action.
