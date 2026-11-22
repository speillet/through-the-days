# goal-counters

## Purpose

Track independent personal goals with explicit units and preserved history, while leaving all behavior judgments to the person.

Sources: README §17, 19, 20 case 17.

## ADDED Requirements

### Requirement: Independent goal modes

The system SHALL support separately configured avoid, reduce, and build goals with titles, start context, targets/units, optional reminders, and independent visibility.

#### Scenario: Two goals

- **WHEN** the person creates two goals with different start dates
- **THEN** each retains its own dates, display choices, and progress.

#### Scenario: Reduce or build mode

- **WHEN** the person selects reduce or build
- **THEN** the display uses the selected target/activity logic rather than manufacturing an abstinence streak.

### Requirement: Explicit lapses and retained history

A lapse SHALL require explicit user confirmation, affect only its selected goal, and retain previous periods and milestones; corrections and undo SHALL remain auditable.

#### Scenario: Lapse on one goal

- **WHEN** the person confirms a lapse for only one of two goals
- **THEN** only that goal starts a new period and both histories remain intact.

#### Scenario: Correct mistaken lapse

- **WHEN** the person undoes an accidental lapse
- **THEN** displays are recomputed from corrected retained history.

### Requirement: Content cannot reset counters

The system SHALL never reset a goal from journal text, an urge, an intrusive thought, a countdown request, a tag, or imported/AI-interpreted content.

#### Scenario: Countdown import

- **WHEN** a conversation mentioning a countdown is imported repeatedly
- **THEN** no goal period or counter changes.

### Requirement: Transparent time and visibility

Elapsed goal displays SHALL state whether they use local calendar days or completed 24-hour intervals, handle DST/time zones consistently, and respect per-surface hiding and explicit export permission.

#### Scenario: DST boundary

- **WHEN** an avoid-mode period crosses a daylight-saving transition
- **THEN** the displayed result follows its labelled convention.

#### Scenario: Hidden counter

- **WHEN** the person hides a counter from Calendar and exports
- **THEN** those surfaces omit its data.
