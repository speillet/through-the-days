# tags-and-search

## Purpose

Organise journal dates and entries using intentional annotations that remain distinct from automatically detected text or events.

Sources: README_THROUGH_THE_DAYS.md §15 and 20 case 15.

## ADDED Requirements

### Requirement: Manual taxonomy

The system SHALL allow editable tags on entries or journal dates, optional tag types, aliases, autocomplete/favourites, and source-linked filtering.

#### Scenario: Manual annotation

- **WHEN** the person tags an entry and then filters by that tag
- **THEN** the exact annotated entry can be opened.

### Requirement: Non-destructive rename and merge

The system SHALL rename or merge tags without losing their annotations or source history.

#### Scenario: Merge aliases

- **WHEN** the person merges two tags used on different dates
- **THEN** both sets of dates remain discoverable under the surviving tag.

### Requirement: Approved suggestions

Suggested tags SHALL remain separate from approved annotations until explicit user approval and SHALL retain their origin and explanation.

#### Scenario: Suggestion ignored

- **WHEN** a lexical rule or model proposes a tag
- **THEN** it is not counted as an approved annotation unless the person accepts it.

### Requirement: Distinct source meanings

The system SHALL distinguish tags, text matches, and interpreted events and SHALL identify journal versus imported-conversation sources during thematic exploration.

#### Scenario: Multiple evidence kinds

- **WHEN** a topic has an annotation, a word match, and an interpreted event
- **THEN** the interface does not add them into a single undifferentiated count.
