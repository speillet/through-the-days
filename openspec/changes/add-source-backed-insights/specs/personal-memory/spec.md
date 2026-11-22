# personal-memory

## Purpose

Retrieve dated, authorised passages and chosen memory cards so the person can revisit what they actually recorded without invented history.

Sources: appendix INT-04/07/08 (§§6, 9–10, 13.4); shared product-guardrails and llm-assistance apply.

## ADDED Requirements

### Requirement: Verified dated evidence

Looking Back SHALL retrieve only currently authorised saved sources, verify each quoted span against its source revision, and show dated links, coverage, and a clear distinction between quotation and interpretation.

#### Scenario: Supported recollection

- **WHEN** a query finds relevant authorised passages
- **THEN** up to five relevant dated excerpts link to real sources and the summary distinguishes You wrote from an interpretation.

#### Scenario: No evidence

- **WHEN** no credible authorised source supports the requested recollection
- **THEN** the app states insufficient evidence without inventing dates, quotes, motives, actions, or improvement.

#### Scenario: Edited source

- **WHEN** a source's content no longer matches the retrieved revision
- **THEN** the app marks Source changed and refreshes or removes the excerpt rather than presenting it as current.

### Requirement: Local controllable memories

The person SHALL be able to explicitly pin, edit the title of, hide, or remove a local memory card, and remove its derived excerpts independently of the original journal.

#### Scenario: Remove a pinned memory

- **WHEN** the person deletes a memory card
- **THEN** the card and its derived cached text disappear while the original entry remains unchanged.

#### Scenario: Source excluded

- **WHEN** a pinned card's source is deleted, trashed, or excluded from insights
- **THEN** the old excerpt is not available through that card or retrieval, and no permanent external model memory is created.

### Requirement: Individual interpretation feedback

Looking Back SHALL let the person reject or hide an individual generated interpretation, independently of pinning, source visibility, or the global Gentle view.

#### Scenario: Reject one interpretation

- **WHEN** the person chooses That's not how I see it or Hide this interpretation on one result
- **THEN** that interpretation is dismissed without deleting original evidence or requiring the entire Looking Back view to be hidden.

#### Scenario: Continue exploring

- **WHEN** the person rejects one interpretation and opens other results
- **THEN** source-linked exploration remains usable and the rejected wording is not presented as a user-endorsed belief or saved win.
