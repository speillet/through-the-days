# llm-assistance

## Purpose

Offer bounded, user-requested suggestions with transparent authorship, exact consent, and a dependable manual fallback.

Sources: README §§0, 18.3, 18.5–18.7, 20 cases 19–20 and 23.

## ADDED Requirements

### Requirement: Explicitly requested assistance

The system SHALL keep AI off by default and start assistance only on user request, using the active entry/exercise and only explicitly selected additional excerpts.

#### Scenario: Ordinary journal session

- **WHEN** the person writes without requesting assistance
- **THEN** no model analysis or model request starts.

#### Scenario: Additional history

- **WHEN** the person selects one earlier excerpt
- **THEN** only that selected additional context is eligible for the request.

### Requirement: Per-request remote consent

Before each remote request, the system SHALL preview the exact excerpts and fields to be sent, allow removals, and require explicit consent for that request.

#### Scenario: Consent cancelled

- **WHEN** the person cancels the send preview
- **THEN** no remote request is sent.

#### Scenario: Previous consent

- **WHEN** the person approved a previous request
- **THEN** a new request still requires its own preview and consent.

### Requirement: Local and manual fallback

The system SHALL retain manual worksheets when a model is absent, times out, fails, or is cancelled, and SHALL support optional local operation after required model files are downloaded.

#### Scenario: Provider failure

- **WHEN** a provider request fails or is cancelled
- **THEN** the person's answers remain intact and the manual exercise is usable.

### Requirement: Validated English suggestions

The system SHALL validate structured suggestions, reject unexpected fields, enforce English first-party output, and show a deterministic English fallback for invalid output.

#### Scenario: Malformed or non-English output

- **WHEN** a provider returns invalid structure, extra properties, or unsupported first-party output language
- **THEN** the response is rejected and the fallback remains English.

### Requirement: User control and bounded reflection

The system SHALL distinguish model suggestions from user answers, require user approval for accepted reframes/actions, and avoid automatic edits, diagnosis, speculation presented as fact, or repetitive reassurance loops.

#### Scenario: Suggestion offered

- **WHEN** the model suggests a reframe or action
- **THEN** the person can edit, reject, or delete it and journal scores, prose, and counters remain unchanged.

#### Scenario: Repeated reframing

- **WHEN** repeated reflection supplies no new information
- **THEN** the assistant offers to stop or choose one manageable action instead of sustaining the loop.

#### Scenario: Acute-distress fixture

- **WHEN** synthetic text indicates an acute crisis
- **THEN** the flow prioritises calm human-support guidance and verified country-appropriate resources rather than extended analysis or a diagnostic risk score.

### Requirement: Explicit private-payload retention

The system SHALL retain only technical request metadata by default and SHALL persist private prompts or model responses only when the person explicitly opts to retain the selected content.

#### Scenario: Response received without retention choice

- **WHEN** an adapter returns a private suggestion and the person has not opted to retain it
- **THEN** request records contain technical metadata only, and receiving or displaying the response does not persist its private payload.

#### Scenario: Selected suggestion retained

- **WHEN** the person explicitly chooses to save a selected suggestion
- **THEN** only that approved content is retained with its AI authorship, without implicitly retaining the whole private request or response.

### Requirement: English adapter instructions

Every first-party prompt used by a local or remote adapter SHALL explicitly instruct English model output and SHALL retain a prompt version without translating user-authored source excerpts.

#### Scenario: Local and remote request construction

- **WHEN** each supported adapter constructs a request from a synthetic non-English excerpt
- **THEN** its first-party prompt explicitly requests English output, identifies the prompt version, and preserves the excerpt's original words.

### Requirement: Untrusted source content

Retrieved journal entries, imported text, and generated material SHALL be treated as untrusted data, never as instructions granting permissions, arbitrary tool execution, or authority to mutate records.

#### Scenario: Instruction embedded in a journal

- **WHEN** retrieved text says to ignore consent and send the diary elsewhere
- **THEN** the content remains quoted data and neither consent controls nor the allowed source scope change.

#### Scenario: Suggestion is not execution

- **WHEN** a model response proposes a win, experiment, tag, milestone, or goal event
- **THEN** it cannot create or change that record without a separate explicit user action.
