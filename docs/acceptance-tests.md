# Product acceptance tests

Observable acceptance cases for the planned application, using synthetic data. These are requirements to verify during implementation, not evidence that application tests have already run.

Section 20 belongs to the [detailed product reference](../README_THROUGH_THE_DAYS.md). The [coverage matrix](acceptance-coverage.md) maps each case to its OpenSpec owner and milestone; the first MVP definition remains in [section 22](../README_THROUGH_THE_DAYS.md#22-definition-of-done-first-mvp).

## 20. Core acceptance tests

1. **Morning + Evening:** two entries on the same date with **independent mood and energy**; neither overwrites the other.
2. **Single entry:** keep just Morning or Evening without pressure, warning or fabricated score.
3. **Interrupted draft:** type a partial entry, close the app, reopen it and recover the draft.
4. **Editing:** change an energy score; Calendar and Trends update consistently.
5. **Calendar:** choose an older date and retrieve the exact entries for that date.
6. **Book View:** read chronologically, skip empty dates by default, use keyboard navigation and display all long-form text.
7. **Time zones:** handle midnight and daylight-saving changes without shifting entries into the wrong dates.
8. **Accessibility:** information is readable without colour alone; VoiceOver and reduced motion work.
9. **Offline:** create, read and edit entries with no internet connection.
10. **Privacy:** no private content is uploaded to GitHub, Hugo or a third-party API by default.
11. **ChatGPT import:** repeating an import does not create duplicates; self-reports and extracted classifications remain distinct.
12. **Data integrity:** schema migration, backup and restore pass tests on fictional data.
13. **Guided check-in:** enter activities, optional pride `1..10` and **“What am I proud of?”**; quit/reopen without losing partial inputs or being forced to finish.
14. **Timeline:** test 7/14/30-day views, both slots, neutral missing values, hover, click and keyboard navigation.
15. **Tags:** create, rename, merge and filter; suggested tags are only stored when approved.
16. **Keyword counts:** selected-term occurrences, entries, distinct dates, matches/1,000 words and separate exact/semantic metrics; reindex on edit without duplication.
17. **Counters:** create two goals, confirm a lapse on one only, preserve history, hide counters in Calendar, and validate units/time-zone changes.
18. **Manual CBT:** complete and resume a seven-step thought record entirely without AI.
19. **CBT with LLM:** user-initiated only, no diagnosis, interruption of repetitive loops, no silent journal rewriting and no remote send without per-request consent.
20. **Sources and consent:** imported ChatGPT and LLM-derived content clearly distinguished; exports require approval.
21. **English-only UI:** every navigational item, emotion name, modal, button, tooltip, validation message, setting, chart title, calendar month/day, CBT question, goal notification, on-boarding step and generated insight is **English**, even with the Mac system language set to French.
22. **Multilingual text preservation:** a user may write a French journal entry or import non-English ChatGPT data without the app translating it, breaking Unicode searches or changing its content. Generated UI explanations still use English.
23. **English output policy:** local and remote LLM adapters include language instructions, English structured prompts and an English-language error/fallback state. No copied third-party product text appears in first-party UI.
24. **Writing depths:** switching Quick/Daily/Deep preserves the same entry ID, date/slot, text and answers without creating a gate or implying unavailable CBT works.
25. **Perceived progress:** optional progress is independent, nullable, range-checked and never part of a composite grade or required completion rule.
26. **Approved wins:** multiple user-owned wins, idempotent promotion from pride text, no invented positive interpretation and no double counting.
27. **Weekly Review:** exact Monday–Sunday counts/coverage, neutral outcomes, source links, stale derived sections and preserved authored notes.
28. **The Path So Far:** honest gaps, separate observations, optional available layers, private milestones and context-preserving Calendar/Book navigation.
29. **Experiments:** manual prediction/step/observation/lesson, neutral Skip/Not yet, explicit approval, optional reminder and auditable corrections.
30. **Personal evidence:** Looking Back/Ask My Journal quote real authorised passages or state insufficient evidence, with coverage and no read-to-write side effects.
31. **Personal Patterns:** explicit variables, dates, denominators, method versions, confounding and sparse-data limits; no causal, diagnostic or forecast claim.
32. **Gentle view:** optional tracking/prompts disappear without deleting data, hiding save failures or disabling daily backups.
33. **Derived-data control:** clearing summaries/pins/embeddings preserves original writing; source deletion/exclusion immediately invalidates their excerpts.
34. **Private portability:** selected Markdown/PDF/CSV and JSON export/import/import preserve IDs, timestamps, missing values and confirmed outcomes without duplicate records, revived trash or invented counters.
35. **Untrusted AI input:** instructions inside journal/imported text never override consent or permissions; unsupported sources/quotes are rejected and private payload retention remains opt-in.
36. **Compassionate challenge:** local/remote assistants, including CBT and Ask My Journal, challenge evidenced errors and unsupported conclusions respectfully, distinguish empathy from agreement, accept justified views, acknowledge uncertainty and their own mistakes, and preserve consent, stopping, and acute-distress safeguards.

---
