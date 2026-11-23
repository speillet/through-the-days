# daily-check-in

## Purpose

Let the person briefly reflect before writing while keeping every optional answer skippable and independently meaningful.

Sources: README_THROUGH_THE_DAYS.md §§4.2, 5, 11.2, 14.1; core acceptance 13.

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

The system SHALL store multiple reported activities separately from prose and future intentions, each recorded as an optional preset category or as the person's own custom activity.

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

### Requirement: Writing depth preserves entry identity

The system SHALL offer Quick Check-in, Daily Journal, and progressively available Deep Reflection as optional presentation depths of the same entry, preserving all content and values when switching.

#### Scenario: Switch a partial draft

- **WHEN** the person switches a partial Morning draft between writing depths
- **THEN** the entry ID, chosen date/slot, writing, and recorded values are unchanged and no second entry is created.

#### Scenario: Suggested duration hidden

- **WHEN** the person disables suggested durations or skips mode selection
- **THEN** writing remains immediately available without a timer or mandatory questionnaire.

#### Scenario: Deeper worksheets not yet available

- **WHEN** Deep Reflection is selected before the CBT milestone is delivered
- **THEN** writing remains usable, unavailable worksheets are identified accurately, and no AI call starts.

#### Scenario: Low energy is not a preference

- **WHEN** energy is low or missing
- **THEN** the app does not infer consent to a deeper exercise or an extended flow.

### Requirement: Optional perceived progress

The system SHALL store optional perceived progress as a separate integer from 1 to 10 per entry, preserving missing values and leaving completion dependent only on writing, mood, and energy.

#### Scenario: Progress skipped

- **WHEN** the person saves valid writing, mood, and energy without a progress score
- **THEN** progress remains missing and the original completion rule is unchanged.

#### Scenario: Independent assessments

- **WHEN** the person reports low mood and high pride/progress on the same date
- **THEN** all four dimensions retain their independent values without a composite mental-health grade.

#### Scenario: Invalid progress value

- **WHEN** progress 0, 11, or a fraction is submitted
- **THEN** validation rejects it without changing other saved values.

### Requirement: User-owned small wins

The system SHALL support multiple dated, editable small-win items entered by the person or explicitly confirmed from a suggestion, with source links and an option to exclude them from insights.

#### Scenario: Promote an existing reflection

- **WHEN** the person explicitly promotes existing pride text into a small-win item
- **THEN** one linked item is counted; the source reflection is not independently counted as another win.

#### Scenario: Rest without reinterpretation

- **WHEN** the person records rest without calling it meaningful
- **THEN** the app does not automatically classify it as a win.

#### Scenario: Suggestion declined

- **WHEN** the person declines an AI-proposed win in a later optional feature
- **THEN** no approved win is stored or counted.

#### Scenario: Optional reflective prompts

- **WHEN** the person skips What helped or What did you learn
- **THEN** no answer is invented and writing and completion remain available.
