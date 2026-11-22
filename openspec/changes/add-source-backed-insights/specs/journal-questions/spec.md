# journal-questions

## Purpose

Answer read-only questions about an explicitly selected journal scope with verifiable evidence, coverage, and visible limits rather than unsupported reassurance.

Sources: appendix INT-04/07/08 (§§6, 9–10, 13.4); shared product-guardrails and llm-assistance apply.

## ADDED Requirements

### Requirement: Explicit source scope and answer evidence

Ask My Journal SHALL default to journal-only scope and show an English qualified answer with dated evidence, exact or traceably normalised excerpts, coverage dates/counts, limitations, and descriptive or exploratory inference level.

#### Scenario: Ask about a period

- **WHEN** the person asks what they recorded during a date range
- **THEN** the answer identifies its scope, original dated sources, actual recorded coverage, and distinctions among counts, quotes, and interpretations.

#### Scenario: Other sources not enabled

- **WHEN** CBT or imported conversations are not selected
- **THEN** their text is neither retrieved nor included in the answer.

#### Scenario: Summaries are not independent evidence

- **WHEN** an answer includes a weekly-review source
- **THEN** it traces claims to underlying authorised sources and does not count the summary as an extra original observation.

### Requirement: Read-only optional inference

Question answering SHALL leave journal text, scores, goals, wins, experiments, and saved history unchanged and reuse llm-assistance consent, English prompts, compassionate evidence-based challenge, calibrated disagreement, untrusted-content handling, and private-payload retention rules.

#### Scenario: Remote request refused

- **WHEN** the person does not approve a new request's exact snippet preview
- **THEN** nothing is sent, regardless of an earlier permission or model instruction.

#### Scenario: Model unavailable

- **WHEN** AI is disabled, fails, or is cancelled
- **THEN** local search/counts and original writing remain available without fabricated prose.

#### Scenario: Unsupported evidence in output

- **WHEN** a response includes a source ID, date, or quotation outside the authorised verified set
- **THEN** the unsupported answer is rejected rather than displayed as sourced evidence.

### Requirement: Versioned answers without hidden retention

Saved answers SHALL identify source versions and analysis/prompt versions and SHALL become stale when their sources change; reproducibility SHALL not authorise retaining deleted or excluded source text.

#### Scenario: Saved answer becomes stale

- **WHEN** a source is edited or deleted after an explicitly saved answer
- **THEN** the answer loses its current-evidence status and removed text is invalidated rather than retained solely to reproduce the old answer.
