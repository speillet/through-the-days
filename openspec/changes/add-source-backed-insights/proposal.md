# Add source-backed personal insights

## Why

A person should be able to find dated evidence in their own writing and ask exploratory questions without fabricated memories or causal claims. The appendix adds a coherent P2 exploration layer beyond the existing calendar, weekly reviews, keyword counts, and mini timeline.

## What Changes

- Add Looking Back retrieval and optional local pinned memories, with verified excerpts and visibility controls.
- Add Ask My Journal with dated evidence, coverage, limitations, and clear insufficient-evidence answers.
- Add Personal Patterns using shared deterministic metrics, explicit denominators, and descriptive associations.
- Reuse existing search/provenance and shared AI consent/retention boundaries rather than introducing another journal, metric engine, or autonomous agent.

## Capabilities

### New Capabilities

- personal-memory: Authorised source retrieval, verified excerpts, and user-pinned local memories.
- journal-questions: Read-only questions with evidence, coverage, limitations, and manual/local fallbacks.
- personal-patterns: Source-aware comparisons with versioned methods, uncertainty, and transparent sample sizes.

### Modified Capabilities

None. Existing capability requirements are owned by their original proposals; this change consumes their interfaces without duplicating them.

## Impact

Milestone: P2 follow-up after phase 4's manual exploration, before or independently of optional ChatGPT import. First-party journal search works without imported sources.

Dependencies: build-offline-journal, add-journal-reading, and relevant add-personal-exploration metrics. AI answer wording is optional and depends on add-cbt-companion's shared llm-assistance boundary. Additional CBT/import sources become available only when explicitly enabled and delivered.

Sources: appendix INT-04/07/08 (§§6, 9–10, 13.4); existing README §§8, 15–16, 18.5.

Out of scope: automated diagnosis, predictions of relapse or wellbeing, background insight generation, unrestricted model tools, persistent remote permission, and writes to journals, scores, goal events, or approved records from model output.

Decision gates: specify minimum-evidence/association display rules, retrieval normalization/offset conventions, and optional local-model support before dependent implementation. Embeddings are a later optional search adapter; their installation is not a journal dependency.

Status: proposed requirements and engineering approach; no application feature is implemented.
