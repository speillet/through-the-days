# Import and analyse explicitly supplied ChatGPT exports

## Why

The person can optionally inspect their own exported conversations with provenance and uncertainty while the journal remains useful on its own.

## What Changes

- Deliver milestone 5 (README phase 5).
- Build an independent local Python CLI for manual imports and auditable reports. Keep original text and journal/ChatGPT observations distinct.
- Keep the proposal and its tasks visibly unimplemented until verification.

## Capabilities

### New Capabilities

- chatgpt-import: Manual ZIP/JSON ingestion, stable identifiers, deduplication, and provenance.
- conversation-analysis: Versioned extractions and descriptive cross-source reports.

### Modified Capabilities

None. The delivered capability inventory is currently empty.

## Impact

Dependencies: Stable journal and source-aware exploration; analytics remains optional and independent.

Sources: README §§8.2–9, 10, 16, 19–20.

Out of scope: Consumer-account scraping, bypassing authentication, promising access to every conversation, bundled Python as an MVP dependency, or automatic cloud uploads.

Open decisions: Resolve O-008 and supported export branching/timestamp rules before implementation. An opt-in collector is a separate later investigation, not an assumed data source.

Status: draft planning baseline derived from the README and recorded user decisions; no application implementation is claimed.
