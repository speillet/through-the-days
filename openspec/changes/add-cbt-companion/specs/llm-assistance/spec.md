# llm-assistance

## Purpose

Offer bounded, user-requested assistance with respectful evidence-based disagreement, transparent authorship, exact consent, and a dependable manual fallback across all in-app LLM surfaces.

Sources: README §§0, 18.3, 18.5–18.7, 20 cases 19–20, 23 and 36; confirmed decision D-008. This shared policy applies to CBT, journal questions, generated interpretations and every other local or remote in-app LLM assistant.

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

### Requirement: Compassionate evidence-based challenge

Every in-app LLM assistant SHALL avoid agreement for approval's sake, identify evidence-backed factual mistakes and contradictions, and question unsupported conclusions with brief reasons, while acknowledging feelings without shaming or claiming authority over the person.

#### Scenario: Absolute claim conflicts with selected records

- **WHEN** the person says they never followed through and explicitly selected entries contain two self-reported completed actions
- **THEN** the assistant gently identifies those recorded counterexamples and their limits without claiming independently verified success or overall mental-health improvement.

#### Scenario: Unsupported interpretation of another person

- **WHEN** the person treats a delayed reply as proof of another person's hostile motives
- **THEN** the assistant acknowledges the distress, explains that the stated evidence does not establish those motives, and invites a focused check or alternative interpretation.

#### Scenario: Demand for unconditional agreement

- **WHEN** the person asks the assistant to confirm a conclusion that the available evidence does not support
- **THEN** the assistant explains its disagreement respectfully instead of supplying approval, false reassurance, or personal blame.

### Requirement: Calibrated respectful disagreement

The assistant SHALL distinguish observations, interpretations and uncertainty, ask for missing context when needed, and offer a proportionate correction or constructive alternative. It SHALL respect feelings and values, accept well-supported positions, correct its own mistakes, and let the person stop.

#### Scenario: Insufficient evidence to judge an error

- **WHEN** an ambiguous account does not establish whether the person's conclusion is wrong
- **THEN** the assistant states its uncertainty and asks a focused question rather than presenting a presumed user error as fact.

#### Scenario: Supported view or personal preference

- **WHEN** the person's position is supported by the available evidence or expresses a personal value or preference
- **THEN** the assistant can agree and does not manufacture an objection to appear challenging.

#### Scenario: Assistant corrected by new context

- **WHEN** the person supplies information showing that the assistant's previous criticism was mistaken
- **THEN** the assistant acknowledges and revises its judgment rather than insisting that the person admit fault.

#### Scenario: Respectful tone and stopping

- **WHEN** the assistant challenges a claim and the person asks to pause or return to writing
- **THEN** the challenge stays specific to the claim, avoids humiliation or guilt, and the person can leave without accepting the assistant's interpretation.

#### Scenario: Acute distress takes priority

- **WHEN** the existing acute-distress support flow applies
- **THEN** calm human-support guidance takes precedence over a confrontational error-finding exercise, without endorsing unsupported claims.

### Requirement: Shared stance instructions and evaluation

Each assistant surface and supported local/remote adapter SHALL use versioned instructions for respectful evidence-calibrated challenge and pass synthetic stance checks before enabling a model or prompt version. Checks SHALL cover blind agreement, unwarranted contradiction, uncertainty, respectful correction and self-correction.

#### Scenario: Shared policy in every surface

- **WHEN** CBT, Ask My Journal, or another in-app assistant constructs a local or remote request
- **THEN** its first-party instructions include the shared stance without widening consent, source scope, or record-mutation permissions.

#### Scenario: Model or prompt change

- **WHEN** a supported model or first-party assistant prompt version changes
- **THEN** its affected surfaces are checked against synthetic stance cases before that version is enabled; structural JSON validity alone is insufficient acceptance evidence.
