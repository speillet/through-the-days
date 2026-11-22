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

### Requirement: Prediction-to-learning experiments

The system SHALL let a person explicitly create an optional behavioural experiment from an action plan or manually, recording a prediction, feasible step, effort, optional review time, observed outcome, and lesson without requiring emotional improvement.

#### Scenario: No AI required

- **WHEN** the person creates an experiment with no model installed
- **THEN** prediction, step, optional schedule, observation, and lesson can all be recorded manually.

#### Scenario: Declined suggestion

- **WHEN** the person declines a suggested action
- **THEN** no approved experiment or decision is stored.

#### Scenario: Neutral follow-up

- **WHEN** the person reviews an experiment as Done, Partly, Not yet, or No longer relevant, or chooses Skip
- **THEN** only an explicitly chosen outcome is recorded; Skip invents neither completion nor failure.

#### Scenario: Retrospective correction

- **WHEN** the person edits a prediction or outcome later
- **THEN** the edit is auditable without replacing the original recorded timestamps.

#### Scenario: Deleted experiment

- **WHEN** the person deletes an experiment
- **THEN** it is removed from active timeline layers and derived results, and stale cached excerpts are invalidated.

### Requirement: Bounded action review

Experiment reminders SHALL be off by default, offer at most one optional review reminder per plan unless explicitly configured otherwise, and respect Gentle view and the person's ability to pause.

#### Scenario: No reminder consent

- **WHEN** the person creates a plan without enabling a review reminder
- **THEN** no automatic review notification is scheduled.

#### Scenario: Topic repeated without new evidence

- **WHEN** the person repeatedly revisits the same topic without new information
- **THEN** the flow offers Pause this topic, Try one small action, or Return to writing without marking any action complete.
