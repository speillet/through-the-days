# daily-check-in

## Purpose

Let the person briefly reflect before writing while keeping every optional answer skippable and independently meaningful.

Sources: README §§4.2, 5, 11.2, 14.1; core acceptance 13.

## ADDED Requirements

### Requirement: Skippable reflection

The system SHALL offer Skip at every guided stage and Write directly, allowing later completion without blocking journal writing.

#### Scenario: Tired person skips

- **WHEN** the person skips every check-in stage and opens the editor
- **THEN** writing is immediately available and no answers are invented.

### Requirement: Independent momentary scores

The system SHALL accept integer mood and energy scores from 0 to 10 independently and SHALL reject invalid values without altering other answers.

#### Scenario: Range boundaries

- **WHEN** mood 0 and energy 10 are submitted
- **THEN** both are stored as valid distinct values.

#### Scenario: Invalid score

- **WHEN** a fractional score or a value outside 0–10 is submitted
- **THEN** validation reports the invalid input and the prior saved answers remain unchanged.

### Requirement: Optional pride and reflection

The system SHALL accept optional pride from 1 to 10, pride text, small wins, difficulty, and next small step as distinct answers; unanswered pride SHALL remain missing.

#### Scenario: Pride omitted

- **WHEN** the person skips pride but writes about a difficulty
- **THEN** the difficulty is retained and pride is missing.

#### Scenario: Invalid pride

- **WHEN** pride 0 or 11 is submitted
- **THEN** the value is rejected without losing the person's other answers.

### Requirement: Reported actions and intentions

The system SHALL store multiple reported activities separately from prose and future intentions, with optional preset or custom categories.

#### Scenario: Rest and reading

- **WHEN** the person records rest and reading and proposes a walk tomorrow
- **THEN** rest and reading are reported actions; the proposed walk is not counted as completed.

#### Scenario: Morning reflection

- **WHEN** the person starts a Morning check-in
- **THEN** intention-oriented questions are available without assuming that any intended action occurred.

### Requirement: Nuanced emotion labels

The system SHALL present an original, versioned English emotion vocabulary with descriptions and another-emotion option, preserving chosen labels without changing numeric scores.

#### Scenario: Label differs from quadrant

- **WHEN** the person selects Anxious with low energy
- **THEN** the chosen label and numeric score coexist without an automatic correction.

#### Scenario: Neutral score

- **WHEN** either numeric axis equals 5
- **THEN** the interface identifies the neutral value without assigning a strong quadrant implication.
