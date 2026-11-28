# Design for read and explore the saved journal

## Context

See proposal.md for product motivation and scope. Milestone: 2 (product-roadmap phase 2). build-offline-journal, including stable save and journal-date behavior.

Status: implemented development design; see `tasks.md` and `docs/development-status.md` for verified slices and outstanding acceptance. Later capabilities remain deferred. This change is not archived.

## Goals / Non-Goals

The design keeps behavior behind cohesive interfaces and tests the same observable interface that its callers use. Capability ownership follows the proposal; the existing journal remains authoritative across all later views and analytics.

This change reuses preceding capabilities rather than introducing an independently editable journal copy.

## Decisions

### Confirmed constraints

README_THROUGH_THE_DAYS.md §§6–8, 14.2–14.3, 16.3, 20–22. Read docs/product-decisions.md and the relevant ADRs before changing these constraints.

### Implementation approach

Query the existing journal authority; reading views do not create editable copies. Cache or index derived content with invalidation after edits. Preserve slot distinctions and selected journal dates. Keep timeline and statistical calculation behavior testable through a small query interface.

Use SQLite FTS5 for local journal text search as required by the brief. The current Rust query rebuilds a transient in-memory index from the whole of each active saved entry (D-017): its title, writing, six reflection answers, action and small-win text and the person's own emotion word, one per line. It uses the unicode61 tokenizer: Unicode case folding, Latin accent folding (Greek accents are kept) and literal tokens, without prefixes, stemming or query operators. Each space-separated part of a query must appear as consecutive words, so "l'amour" finds "l’amour" but not "amour de l'été". A part without an indexed word, such as "?", "«" or "🌿", is ignored; a query made only of such parts matches nothing. Emoji newer than the tokenizer's Unicode tables, such as 🫠, count as words. Chinese, Japanese, Korean and Thai do not separate words with spaces, and unicode61 would index a whole run as one word. Before indexing, and inside each quoted query part, search therefore puts a space around every Han, kana, Hangul and Thai letter, so each is a word of its own: a query part finds the same characters consecutive and in that order anywhere in a run. "散歩" finds "今日は公園を散歩した", while "公園散歩" does not. A Latin word or number written against these characters is a word of its own too, so "iphone" finds "iPhoneで". Thai vowel and tone marks written above or below a letter are declared token characters and stay with their letter, so "เดน" does not find "เดิน". Hangul is split by syllable as well, so "학교" finds "학교에" with its particle, and also "대학교": this is character matching, not word segmentation. These rules follow the fix proposed in issue #53; splitting Hangul is an engineering choice, not an interview decision. Lao, Khmer, Myanmar and other scripts written without spaces are not split. A query's space-separated parts may match in different parts of an entry. Because those parts are joined line by line, one query part with inner punctuation, such as "seine-pottery", can also match across the end of one part and the start of the next, as title and writing already could. Results do not show which part matched. Insight reports index only the wins included in insights, so the words of an excluded win cannot select its entry there. The browser preview approximates these rules for interface tests, but only the Rust suite runs the FTS5 query. Edits and trash cannot leave a stale persistent search index. This is not an alternative journal authority; larger-journal performance remains a future measurement.

The native Tauri adapter delegates search, reports, notes and milestone operations to the Rust journal authority. Browser tests use the explicit synthetic memory adapter. React reading state retains filters, selected sources and per-entry scroll positions; source mutations invalidate dependent queries. A refresh after a mutation, window activation or retry keeps the current result rendered until the new answer arrives, so focus, text selection and the browsed month survive; a failed refresh replaces the result with its error. A changed query shows no earlier result. Entry previews keep their identity across revisions. An insights toggle shows the requested value as busy and ignores further changes until the view shows its saved revision; a failed save restores the saved value with its error. Weekly authored-note autosave survives navigation and retries failures independently of summary generation.

Weekly note saves and summary generation share one ordered per-week operation stream. Only note saves check and advance the notes revision. Generation replaces the disposable summary and its source fingerprint, which alone marks it stale; a week without a stored review is created at revision 1, because stored revisions are positive. Both writes build their reply before committing, so an error means nothing was written. A failed summary does not stop authored-note saves. Source-list loading/errors are reported independently from successful weekly counts and never masquerade as an empty week.

A refused note save is never resent on the same revision. The stream reads the week again: when the stored notes already equal the text being saved, for example after a lost reply, it adopts their revision; when only the revision moved, it sends the text again once on that revision. Otherwise the person's text stays on screen, unsaved, and Weekly Review offers "Keep my text", which saves it over the stored notes, or "Load saved text", which replaces it with them. These two choices follow the fix proposed in issue #12; they are an engineering choice, not an interview decision.

A note save that fails with any other error may still have been stored with only its reply lost. The stream therefore remembers each text sent on the current revision until a save or a re-read confirms the outcome: stored notes equal to one of those texts are adopted as its own write, and newer text is then saved on their revision. Until that confirmation the notes count as unsaved, even when the text on screen equals the last confirmed notes.

Book selections snapshot the originating query independently from shared filters. Weekly sources use their own ISO-week bounds and return to Weekly Review; timeline sources retain range and layers. Custom timeline bounds are separate from My Journal's date filters. Losing a selected source shows an explicit recovery action instead of silently widening the selection.

All reading views derive an effective selection from shared display preferences: hidden numeric controls suspend score filters while retaining the original choices. The report authority applies win filters, and search text in wins, only to insight-included wins; original search still finds all owned records. Timeline source cards use report eligibility, and insight cards omit excluded wins while original Calendar/Book reading remains intact.

Each derived metric carries its own observation count and distinct scored-date count, displayed against the shared civil-date span. Two slots on one day add two observations and one recorded date. An absent pride value contributes to neither denominator. This query contract does not alter the authoritative schema-3 backup format.

### Weekly reviews and The Path So Far

These are views over shared journal queries and provenance, not another editable journal or another metric engine. Reuse progress-insights aggregation rules and extend selectable measures with nullable perceived progress. Calendar/Book links carry the current range/filter context.

Store one weekly_reviews record per ISO week in the current single-user context, with exact boundaries, snapshot fingerprint/version metadata, deterministic statistics, separate user_notes, and an optionally retained labelled summary. Count distinct in-scope journal dates, canonical win IDs and reported actions separately. A generated review never becomes an extra original entry in its own denominators. The subsequent add-cbt-companion change owns started/completed worksheet counts and experiment outcomes; until then they are explicitly unavailable and not counted.

Invalidate derived material on source edits, trash/deletion, or insight-visibility changes. Old excerpts must not remain visible as current evidence. Recalculation preserves authored notes. Snapshot metadata supports freshness checks; it does not authorise retaining copies of deleted text.

The long-range personal-timeline composes available layers and timeline_milestones with the existing mini timeline and date navigation. Add later CBT/goal/import layers only when those capabilities exist. New range controls do not duplicate the 7/14/30-day mini timeline or introduce interpolation by default.

### Verification interfaces

Use synthetic empty days, two-slot days, Unicode text, long documents, neutral scores, score-bearing drafts, and DST transitions. Compare all views after an edit and verify exact source links.

Relevant acceptance cases are mapped in docs/acceptance-coverage.md. Each implementation slice carries its own tests and user/developer documentation.

## Risks / Trade-offs

Pagination can hide or duplicate text; rendered coverage and selection need a prototype. D-010–D-012 fix inclusion and neutral markers. Morning mood 2 and Evening mood 7 yield two observations, mean 4.5 and one recorded date. Missing pride adds no observation. A 5 on either numeric axis has a neutral marker even when the chosen emotion is Anxious.

## Migration Plan

Schema 3 adds authoritative weekly-review and timeline-milestone tables. Protected migrations support schema-1/2 images, and encrypted backups validate and restore the authored reading records. Reading-source exclusion defaults to enabled for older entries. Search indexes are transient and rebuilt. The Rust suites upgrade and restore frozen journals stored exactly as versions 1 and 2 did (`crates/journal-core/tests/common/fixtures.rs`), including the desktop launch that reports version 2 and upgrades it, and cover clean restore and reading-data round trips; a journal holding only weekly notes or a milestone gets a safety backup before a restore replaces it. Manual native acceptance remains outstanding.

## Decision gates

D-010–D-012 resolve this milestone's product gates; D-017 sets the scope of search. Book navigation pages by entry, renders all text once and scrolls long content; resizing preserves its position. The canonical JSON document is shared with the editor. SQLite FTS5 provides rebuildable literal-token search; weekly notes and private milestones are authoritative authored records included in encrypted snapshots. Optional local summaries are labelled and invalidated by source-revision fingerprints; generated content can be cleared independently of notes.

These product gates were resolved before their dependent implementation. Reopen them only if the proposed behaviour changes. Keep acceptance combinations that have not been verified unchecked, including native reading interactions and the outstanding tasks in `tasks.md`.
