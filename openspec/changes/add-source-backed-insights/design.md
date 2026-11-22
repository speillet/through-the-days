# Design for source-backed insights

## Context

This is a P2 extension of existing local search, weekly reviews, and versioned metrics, not a prerequisite for the offline journal. See proposal.md for scope. No product implementation exists yet.

## Goals / Non-Goals

Keep retrieval, numerical calculation, and optional answer wording separable. The person controls source scope and saved derived material. This layer does not diagnose, predict relapse, run arbitrary tools, or update the journal and goals.

## Decisions

### Reuse the existing local search authority

Start with the journal's SQLite FTS5/search interface and approved source scopes. Store stable source type/ID, chunk ID, revision/content hash, offset convention, journal/source date, and visibility for excerpts. Optional embeddings can be introduced later as a derived local adapter, not a second journal.

Use personal-memory for retrieval and pins, journal-questions for read-only answer presentation, and personal-patterns for comparisons. Reuse existing keyword/action/goal calculations rather than asking a model to perform arithmetic. A review summary can lead to primary records but is not another observation in its own source statistics.

### Verify evidence before optional model wording

A deterministic retriever selects a bounded, authorised set of snippets. Validate every returned source ID, date, range, and quote against that set before displaying generated content. Preserve original-language excerpts; generated explanations are English. Scope begins with the journal and expands only to explicitly selected delivered source types.

Reuse llm-assistance's provider boundary, per-request remote preview/consent, prompt versions, opt-in payload retention, and untrusted-source protections. Give the model no mutation tool or unrestricted command execution. Failure returns source-linked local search/counts instead of invented reassurance.

### Preserve privacy while tracking freshness

Use source revisions/fingerprints and engine/prompt versions in insight_runs metadata. Store an answer or raw payload only when the person chooses to retain it. Metadata is not a raw-text archive. Delete or invalidate chunks, quotes, cached answers, embeddings, and pins when a source is removed or visibility is revoked. Reproducibility holds while authorised revisions exist; it cannot justify retaining deleted text indefinitely.

Pinned memories are local source-linked cards with editable titles and removable derived excerpts. User-authored notes stay separate from generated answers; neither automatically becomes an approved win or goal event.

## Risks / Trade-offs

- Search relevance is not factual verification: quote matching, modest wording, exact source dates, and visible uncertainty remain mandatory.
- Snapshot retention can undermine deletion: retain version metadata by default, invalidate sensitive projections, and make any content-retention choice explicit.
- Sparse or biased entries cannot support broad generalisations: select and document minimum-evidence rules before association displays; show actual coverage.
- Optional embeddings increase private derivative data: keep them local, rebuildable, source-scoped, and independently removable.

## Migration Plan

Add versioned derived indexes and source-linked pin/result metadata after the relevant authoritative records exist. Rebuild derivatives from authorised sources. Test edits, trash, permanent deletion, visibility changes, and method-version changes using synthetic data before enabling the views.

## Decision gates

Before implementation, document retrieval offsets/normalisation, bounded query/context sizes, minimum evidence for associations, and any optional model choice. These choices refine this P2 draft and must not widen default source scope or weaken per-request consent.
