# Development roadmap

Milestone 1 (phases 0–1, the offline journal) has application code and passing automated checks; native acceptance remains open. See [milestone 1 status](milestone-1-status.md) and [acceptance evidence](acceptance-coverage.md#milestone-1-evidence). Later milestones describe future work; dates are not implied. See the [user overview](../README.md), [detailed product requirements](../README_THROUGH_THE_DAYS.md), and [OpenSpec workflow](specification-workflow.md).

Original section numbering is retained for source references.

## 13. Prioritised development roadmap

### Phase 0 — macOS UX prototype

- [x] Initialise **Tauri 2 + React + TypeScript + Vite**.
- [x] Build the original design system inspired by How We Feel principles, with sidebar, themes and accessible navigation.
- [x] Prototype **Today** and the **short pre-writing check-in**: mood/energy, actions, pride `1..10`, editor and synthetic test records.
- [ ] Complete native keyboard entry, macOS reading, dark mode, small-window and **Skip** acceptance. Automated checks pass. A VoiceOver pass and real-key keyboard checks in the native window are tracked in the confirm-native-macos-checks change.
- [x] Verify **all UI strings and emotion labels are English**, including accessibility and empty states.

**Acceptance:** A macOS app opens with a complete clickable flow using fictional data.

### Phase 1 — Journal and daily reflection (first usable MVP)

- [x] SQLite, migrations, drafts and reliable autosave.
- [x] Create/edit at most two entries per date (Morning/Evening), with distinct mood/energy and free text.
- [x] Save activities, optional pride/progress `1..10`, approved small-win items, optional learning/helped answers, difficulties and a next small step.
- [x] Allow skipping reflection, switching writing depths without data loss, filling fields later, and selecting Gentle view.
- [x] Deliver 30-day trash, portable encrypted daily backups with next-launch catch-up, and tested restore before real personal use.
- [x] Test integrity, dates, app restarts and the **English-only interface**.

**Acceptance:** Journal text and check-in answers are exactly restored after restart without internet access; nothing is uploaded.

### Phase 2 — Calendar, book reader and progress timeline

- [ ] Calendar markers for both entries and optional pride/achievement markers.
- [ ] Book view with pagination, light/dark themes and keyboard navigation.
- [ ] **7/14/30-day timeline below each entry**, navigable by date with explicit missing-data gaps.
- [ ] Local full-text search and filters.
- [ ] Deterministic Weekly Review and The Path So Far with available layers, private milestones, source links and freshness; later-layer capabilities remain deferred.

**Acceptance:** Today, Calendar and Book View show the same saved data; selecting a timeline date opens the correct day.

### Phase 3 — Deterministic CBT, then optional LLM

- [ ] Seven-step **thought record** available without AI and saved after each step.
- [ ] Extend behavioural activation/action plans into optional experiments: prediction, feasible step, optional single review reminder, observed outcome and lesson. No AI is necessary.
- [ ] Optional local Ollama adapter, versioned prompts, schema-validated JSON, guardrails against diagnosis and reassurance loops.
- [ ] Remote LLM only with **per-request consent** and control of exactly what is transmitted.
- [ ] Test with synthetic material, including high-distress and repetitive-rumination scenarios.
- [ ] Validate **English CBT questions and English LLM responses**.

**Acceptance:** Worksheets work offline without an LLM; the LLM never rewrites journal entries or changes scores automatically.

### Phase 4 — Tags, keywords and goal counters

- [ ] Manual tags, aliases/synonyms, autocomplete, suggestion approval and filters.
- [ ] Selected-term analysis: exact matches, approved morphological variants, distinct days and normalised frequency; 7/30/90-day filters.
- [ ] Independent behaviour/goal counters, optional visibility, non-destructive history, milestones and manual confirmation of lapses.
- [ ] Non-judgmental pride, activity and multiple-indicator trends.

**Acceptance:** Counts match synthetic fixtures, time-zone changes do not corrupt counters, no automatic reset is triggered by text.

### Phase 4.1 — Source-backed exploration (P2)

- [ ] Looking Back with verified dated excerpts, coverage and optional local pinned memories.
- [ ] Ask My Journal with explicit scope, citations, limitations, insufficient-evidence answers and read-only behavior.
- [ ] Personal Patterns reusing shared metrics, denominators, versioned methods and qualified associations.
- [ ] Add the expanded offline CBT library after the original manual exercises work.
- [ ] Keep embeddings/model wording optional; verify source invalidation, untrusted-content handling, and per-request remote consent.

**Acceptance:** Every quote resolves to an authorised saved revision or the app reports insufficient evidence. No query changes a journal, score, goal event, win, or experiment. This phase is not a prerequisite for the first usable journal.

### Phase 5 — Optional ChatGPT analysis

- [ ] Official ZIP/JSON import, deduplication and provenance.
- [ ] Versioned classification of countdown requests, rumination mentions, topics, decisions and reported actions.
- [ ] Cross-source analysis with **journal versus ChatGPT clearly separated**.
- [ ] Incremental synchronisation only through an authorised, genuinely accessible data source.
- [ ] ChatGPT-derived user text retains its source language while **all app-generated reports remain in English**.

### Phase 6 — Mac distribution and Hugo

- [ ] Wider `.app` / `.dmg` distribution, supported-platform verification and signature/notarisation as needed. Personal launch and encrypted backup/restore are already required in phase 1.
- [ ] Selected private Markdown/JSON/PDF/CSV portability, versioned identity-preserving JSON import and conflict-safe repeated round trips.
- [ ] **Manual, approved** export of selected aggregate data to Hugo; never export private prose by default.
- [ ] Document methodological limitations and technical permissions in English.

**Top priority:** complete phases 0–2 before substantial ChatGPT analytics work. Never make the journal depend on LLM or ChatGPT API availability.

---
## OpenSpec change ownership

| Order | Change | Scope |
|---|---|---|
| 1 | [build-offline-journal](../openspec/changes/build-offline-journal/proposal.md) (implemented; acceptance open) | Phases 0–1: writing, check-in, durable storage, trash, backup and restore before real use |
| 1a | [confirm-native-macos-checks](../openspec/changes/confirm-native-macos-checks/proposal.md) | Manual native checks of milestone 1: VoiceOver, real-key keyboard navigation, full screen, native dialogs and Keychain, offline launch, exFAT drive |
| 2 | [add-journal-reading](../openspec/changes/add-journal-reading/proposal.md) | Phase 2: calendar, book, timeline, local search, Weekly Review and The Path So Far |
| 3 | [add-cbt-companion](../openspec/changes/add-cbt-companion/proposal.md) | Phase 3: manual worksheets and experiments, then optional AI; extended templates are P2 |
| 4 | [add-personal-exploration](../openspec/changes/add-personal-exploration/proposal.md) | Phase 4: tags, keyword statistics, independent goals |
| 4.1a | [add-source-backed-insights](../openspec/changes/add-source-backed-insights/proposal.md) | P2: Looking Back, Ask My Journal, descriptive Personal Patterns |
| 4.1b | [expand-cbt-exercise-library](../openspec/changes/expand-cbt-exercise-library/proposal.md) | P2: additional offline templates, independently archived from phase 3 |
| 5 | [add-chatgpt-analytics](../openspec/changes/add-chatgpt-analytics/proposal.md) | Phase 5: manual import and auditable analytics |
| 6 | [ship-macos-and-approved-exports](../openspec/changes/ship-macos-and-approved-exports/proposal.md) | Phase 6: wider distribution, private portability and separately approved Hugo aggregates |

Backup and restore have been advanced from phase 6 by the user's explicit decision. Initial personal launch remains in milestone 1; wider distribution remains later. Later changes are planning drafts, and their detailed choices are reopened when that milestone is approached.

The [appendix integration assessment](appendix-integration.md) records what is new, reused, deferred, or rejected. The original appendix is a historical proposal; the detailed product reference and OpenSpec use the consolidated behavior. Proposed SQL is conceptual, not executable migration code.
