---
status: accepted
date: 2026-11-22
---

# Store each journal entry as one validated aggregate

The first journal saves an entry's writing, check-in answers, reported actions, small wins and reflections together, and promises that a "Saved" revision is restored exactly. The technical design sketched one column per answer plus separate action, reflection and win tables. Milestone 1 instead stores each entry as a single JSON document beside indexed identity columns: id, journal date, slot, revision and trash time. `journal-core` validates the whole document in Rust before every commit and again before a backup can be restored.

This keeps one transaction and one optimistic revision per entry. It also makes an acknowledged save all-or-nothing and lets new optional fields default to missing without schema churn. The database still enforces what must never break: one active entry per date and slot, positive revisions, a valid slot and well-formed JSON.

The trade-off is that SQL constraints no longer guard each score range, and later milestones that aggregate scores or search text must read the document with SQLite's JSON functions or maintain a derived index. Such indexes are derivatives, rebuildable from the entries and subject to the product's derived-data rules. A schema change still needs a versioned migration that rewrites stored documents, guarded by the pre-migration backup and by frozen fixtures of every earlier document version.
