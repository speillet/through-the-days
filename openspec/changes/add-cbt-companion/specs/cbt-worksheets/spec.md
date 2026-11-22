# cbt-worksheets

## Purpose

Offer optional structured thought records and small-action reflection that remain fully usable without AI or connectivity.

Sources: README §§18.1–18.4, 18.6–18.7, 20 case 18.

## ADDED Requirements

### Requirement: Offline thought record

The system SHALL offer a seven-step manual thought record covering situation, emotions, automatic thought, supporting evidence, qualifying evidence, a balanced alternative, and feelings afterwards.

#### Scenario: No model installed

- **WHEN** the person starts a thought record offline without an LLM
- **THEN** all seven manual stages are available.

#### Scenario: No emotional improvement

- **WHEN** the person's final emotion intensity is unchanged
- **THEN** the exercise does not mark this as failure.

### Requirement: Resumable separate answers

Worksheets SHALL save after each step, support Skip, Pause, and Back to Journal, and keep session answers separate from journal prose.

#### Scenario: Interrupted exercise

- **WHEN** the person pauses or quits after a saved partial answer
- **THEN** the same worksheet resumes with the saved answer and the journal text is unchanged.

### Requirement: Feasible actions and outcomes

The system SHALL support behavioural activation and problem solving with manageable actions, optional review dates, obstacles/adaptations, and explicitly reported outcome states.

#### Scenario: Planned action

- **WHEN** the person schedules a small step without later confirmation
- **THEN** it remains planned rather than completed.

#### Scenario: Follow-up skipped

- **WHEN** the person declines the optional next-check-in follow-up
- **THEN** the app continues without a penalty or repeated mandatory question.

### Requirement: Optional supportive framing

The system SHALL present exercises as optional reflection tools, keep English first-party questions, and avoid diagnostic labels or claims of established clinical effectiveness.

#### Scenario: Return to journal

- **WHEN** the person declines or exits an exercise
- **THEN** normal journal editing remains available without completing the exercise.
