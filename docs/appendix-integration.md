# Appendix integration assessment

Appendix v0.1 is a proposal source for the [detailed product requirements v0.7](../README_THROUGH_THE_DAYS.md) and the OpenSpec changes. The retained ideas support optional reflection, trustworthy rereading, or data control without changing the first journal's identity/completion rules. This records product relevance and ownership, not clinical efficacy or implemented behavior.

## Ideas and canonical owners

| Idea | Assessment | Canonical owner and delivery |
|---|---|---|
| INT-01 — Three depths | Useful presentation refinement of the existing skippable flow; no separate entry model. Deep worksheets wait for phase 3. | build-offline-journal / daily-check-in |
| INT-02 — Four dimensions | Perceived progress is new, optional 1–10. Mood/energy/pride already exist. Multiple approved wins refine the existing pride/small-win flow rather than counting it twice. | daily-check-in; shared progress-insights calculations |
| INT-03 — CBT experiments | Prediction, observation, lesson, and auditable corrections add value to existing action plans; approval, neutral outcomes, and anti-loop rules already exist. | add-cbt-companion / cbt-worksheets, extending cbt_action_plans |
| INT-04 — Personal memory | New explicit evidence-retrieval/pinning experience built over existing local search and source links. | add-source-backed-insights / personal-memory, P2 |
| INT-05 — Weekly review | Already proposed briefly in the README; now precise about ISO weeks, distinct days, denominators, notes, and staleness. | add-journal-reading / weekly-reviews |
| INT-06 — The Path So Far | New long-range view and private milestones, distinct from the existing mini timeline. Reuse its queries and date navigation. | add-journal-reading / personal-timeline; later layers added when their features exist |
| INT-07 — Ask My Journal | New read-only question interface; retrieval, citation checks, and existing consent boundaries precede optional model wording. | add-source-backed-insights / journal-questions, P2 |
| INT-08 — Personal Patterns | Refines existing descriptive metrics; adds explicit association/coverage presentation without inventing another counting engine. | personal-patterns plus existing keyword-analysis/versioned runs |
| INT-09 — Exercise library | Existing three exercises remain first. Additional bounded offline templates are a separately archived P2 change, with manual experiments remaining in phase 3. | expand-cbt-exercise-library / cbt-exercise-library; cbt-worksheets retains manual experiments |
| INT-10 — Privacy and portability | Existing privacy/backup rules remain; new Gentle view, derivative clearing, and selected private export/import fill genuine gaps. | product-guardrails, local-data-protection, private-data-portability; approved-exports still owns public aggregates |

Looking Back also preserves the appendix’s individual “That's not how I see it” / “Hide this interpretation” control independently of pins and Gentle view.

## Conflicts and duplication resolved

- **Remote permission:** reject the appendix §9 persistent-permission exception. Every remote inference still needs an exact preview and explicit consent for that request.
- **Experiments:** extend existing cbt_action_plans instead of introducing a competing behavioural_experiments table or a second set of action outcomes. A plan never becomes a goal/counter reset.
- **Wins:** retain proud_of as authored reflection; promotion creates one canonical linked personal_wins item. Do not automatically count both the reflection and its promoted item or label rest as success.
- **Modes:** keep the chosen date/slot and entry ID. Depth is a presentation preference, not another daily-entry silo or a requirement to finish a questionnaire.
- **Source snapshots:** use versions/fingerprints for freshness. Do not preserve private raw snapshots indefinitely merely to reproduce old answers after source deletion or exclusion; remove/invalidate their derived excerpts.
- **Deletion:** do not copy the illustrative ON DELETE SET NULL patterns if they leave sensitive copied excerpts accessible after their source is removed. Source-linked projections must follow source visibility/retention.
- **Uniqueness:** preserve the two-active-slots rule. With 30-day trash, a global uniqueness constraint covering deleted records would wrongly reserve an active slot; enforce active-entry uniqueness and conflict-safe restore instead.
- **Private versus public export:** JSON/Markdown/PDF can intentionally include private content after selection. They are separate from the existing Hugo aggregate allowlist and from encrypted backups. A plaintext export is described as plaintext.
- **Priorities:** P0/P1/P2 are relative, not dates or permission to expand the initial release. Manual journaling and encrypted recovery remain first; ChatGPT, embeddings, conversational answers, and extended exercises remain later.
- **Navigation and statistics:** reuse the existing Calendar/Book/Trends routes, query interfaces, denominator rules and visibility controls; do not replace the sidebar with every proposed tab at once.
- **Backup decisions:** keep daily backups, next-opening catch-up, portable passphrase and optional Keychain storage. The appendix's illustrative data model is not an executable migration plan; backup retention is still separate from confirmed 30-day trash.

## Appendix acceptance coverage

The original TEST IDs are preserved here; README_THROUGH_THE_DAYS.md §20 adds consolidated cases 24–35. Requirement names below identify the owning OpenSpec spec rather than duplicating the same requirement in several places.

| Appendix test | Canonical behavior and spec |
|---|---|
| TEST-01 | daily-check-in — Writing depth preserves entry identity |
| TEST-02 | daily-check-in — Optional perceived progress |
| TEST-03 | personal-timeline — Honest independent measures |
| TEST-04 | weekly-reviews — Local weekly reflection |
| TEST-05 | cbt-worksheets — Prediction-to-learning experiments |
| TEST-06 | weekly-reviews — Distinct reviewed evidence |
| TEST-07 | weekly-reviews — Authorship and source freshness |
| TEST-08 | personal-memory — Verified dated evidence |
| TEST-09 | personal-memory — Verified dated evidence / No evidence |
| TEST-10 | product-guardrails — Independent derived-data control |
| TEST-11 | progress-insights — Explicit observations and missing data; personal-timeline — Honest independent measures |
| TEST-12 | personal-timeline — Honest independent measures |
| TEST-13 | personal-patterns — Shared definitions and denominators |
| TEST-14 | llm-assistance — Per-request remote consent; journal-questions — Read-only optional inference |
| TEST-15 | approved-exports — Private content exclusions |
| TEST-16 | goal-counters — Transparent time and visibility; personal-timeline — Optional available layers |
| TEST-17 | product-guardrails — Gentle view |
| TEST-18 | cbt-worksheets — Offline thought record |
| TEST-19 | llm-assistance — Untrusted source content |
| TEST-20 | product-guardrails — English first-party content |
| TEST-21 | product-guardrails — Independent derived-data control |
| TEST-22 | private-data-portability — Versioned identity-preserving round trip |

These are planned behavioral checks on synthetic data. OpenSpec validation verifies document structure; execution evidence will be collected when the corresponding application slices exist.
