# Through the Days — A Personal Journal, Progress Tracker, and CBT Companion for macOS

> **Status:** Consolidated product requirements v0.7 — implementation specification. Milestones 1–2 have code in the development branch; acceptance and specification closure remain in progress. See [development status](docs/development-status.md).
> **Updated:** November 23, 2026
> **Product name:** Through the Days
> **GitHub repository:** `through-the-days`
> **Proposed macOS bundle identifier:** `com.throughthedays.app`
> **Python analytics module:** `through_the_days_analytics`
> **Tagline:** *Every day you make it through becomes another page.*
> **Primary platform:** macOS (Apple Silicon; Intel where feasible).
> **Product language:** **English only — all first-party UI copy, prompts, exercises, notifications, reports, seeded labels, and generated insights must be written in English.**
> **UX inspirations:** [How We Feel](https://play.google.com/store/apps/details?id=org.howwefeel.moodmeter&hl=en) (emotion check-ins) and [I Am Sober](https://play.google.com/store/apps/details?id=com.thehungrywasp.iamsober&hl=en) (independent counters, milestones, reflections). All Through the Days branding, visual assets, interface layouts, and wording must be original.
> **Differentiators:** A short guided reflection before writing, recognition of daily actions and small wins, optional LLM-assisted cognitive behavioural therapy (CBT) exercises, a progress timeline, thematic exploration, calendar and book-style reading, and optional local ChatGPT analytics.
> **Privacy:** Local-first; no automatic uploads of private data and no automatic publication.

Detailed development planning lives in [the OpenSpec workflow](docs/specification-workflow.md), with [recorded product decisions](docs/product-decisions.md), a [domain glossary](GLOSSARY.md), and [acceptance coverage](docs/acceptance-coverage.md). The journal and reading changes have application code but remain active pending acceptance; four verified journal capabilities and five verified reading capabilities are synchronised to main specs, and archives remain empty. Manual native reading acceptance stays open; worksheet counts and experiment outcomes in Weekly Review follow in milestone 3. The other product changes remain plans. See [development status](docs/development-status.md) for actual evidence. Explicit decisions refine this brief, including 30-day trash and daily encrypted backups with next-launch catch-up before real personal use; the live database initially relies on macOS protections. [Appendix v0.1](appendix.md) is a proposal source; its useful additions are consolidated here and in OpenSpec, with duplicates, deferrals, and conflict resolutions recorded in [the integration assessment](docs/appendix-integration.md). This reference, its thematic documents, and recorded decisions govern development. The [main README](README.md) is the short user-facing overview.

---

## Reading map

| Topic | Where to read |
|---|---|
| What the app is and the intended daily flow | [User overview](README.md) |
| Product rules, UX, privacy, and assistant behavior | This reference |
| Architecture, schema, repository layout, and contracts | [Technical design](docs/technical-design.md) |
| Priorities and OpenSpec change ownership | [Roadmap](docs/roadmap.md) |
| Product acceptance scenarios | [Acceptance tests](docs/acceptance-tests.md) and [coverage](docs/acceptance-coverage.md) |
| Implementation planning and PR completion | [OpenSpec workflow](docs/specification-workflow.md) |

## 0. English-only product and implementation policy

**This requirement applies to every feature, including future features and AI output.**

- The complete application interface **must be in English**: sidebar, navigation, buttons, labels, dialogs, placeholders, tooltips, error messages, empty states, menus, onboarding, accessibility labels, settings, export screens, and help content.
- The daily check-in, emotion names and definitions, pride questions, goal tracking, milestone copy, calendar and book view, trend charts, keyword explorer, CBT worksheets, and LLM assistant all use English.
- **Every first-party LLM prompt must instruct the model to respond in English**. Validate structured outputs and provide English-language deterministic fallback messages. User-written or imported text is **never silently translated or rewritten**.
- Seed data, sample records, test fixtures, screenshots, documentation, notifications, and release notes should be written in English. If testing multilingual imports, clearly label any non-English text as a deliberate test fixture.
- Use stable language-neutral identifiers in storage (`emotion_id`, `slot`, `tag_id`) and English display fields such as `name_en` and `description_en`, instead of the earlier `name_fr`/`description_fr` design. Keep language tagging on imported or user-authored text when useful for analytics.
- Default UI locale is `en-GB` (e.g. **22 November 2026**), using **Monday** as the first calendar weekday. Follow a user's chosen time zone for data calculations; **language and time zone are independent preferences**. The initial suggested time zone may be `Europe/Paris` but must be user-configurable.
- English wording is the product's only supported UI language for this version; design with future localisation in mind, but do not expose an unfinished language selector. Never mix French and English labels in the interface.
- Journal entries themselves may be written in **any language chosen by the user**. Imported ChatGPT discussions remain in their original language. Keyword processing should not mistake English-only UI for an English-only corpus.
- A language-consistency acceptance test must inspect all user-facing strings, notification templates, CBT prompts, and AI-generated reports and reject unintended non-English UI copy.

---

## 1. Product vision

**Through the Days** is a local-first macOS personal journal designed to preserve the memory of everyday life, make personal progress visible, and offer optional guided CBT exercises. Its public-facing name is **Through the Days**; its repository is **`through-the-days`**. Technical identifiers follow platform conventions (`through_the_days_analytics` for Python and `com.throughthedays.app` for macOS).

Build a **real desktop app for macOS** that lets people:

1. **Write one or two journal entries a day**, typically **Morning** and **Evening**.
2. Record **separate mood and energy scores for each entry**.
3. Name emotions precisely with a visual vocabulary informed by the principles of *How We Feel*.
4. Revisit dates through a **calendar** or **page-turning journal/book reader**.
5. Explore mood, energy and recurring-topic trends over time.
6. Optionally **import ChatGPT conversations** for private analysis of rumination mentions, countdown requests, topics, decisions and proposed actions.
7. **Reflect on the day before free-form writing**: activities, small wins, a `1–10` pride score, difficulties and helpful steps.
8. **See progress over time** with a bottom-of-page timeline, tags, and transparent comparisons.
9. Track **multiple independent personal goals and counters**, optionally shown on calendar dates.
10. Complete **structured cognitive behavioural therapy (CBT) exercises**, optionally supported by an LLM, without positioning the app as a therapist.
11. Optionally export **explicitly approved aggregated statistics** to a Hugo blog without exposing journal contents.
12. Choose an optional writing depth and record **perceived progress** independently of mood, energy, and pride.
13. Revisit **Weekly Review** and **The Path So Far**, with source links and optional private milestones.
14. Later, use **Looking Back**, **Ask My Journal**, and **Personal Patterns** for evidence-qualified exploration.
15. Deliberately export selected private content in portable formats, separately from public aggregate sharing.

The product must remain useful **without any ChatGPT import, internet connection, or LLM**. Journaling and emotional check-ins are its standalone core.

### Design principles

- **Tangible progress:** acknowledge useful actions even if mood stays low; do not equate progress with feeling good.
- **Writing first:** begin an entry quickly; the short guided check-in must always be skippable and revisitable.
- **Nuanced emotions:** distinguish pleasant/unpleasant feeling from high/low energy rather than collapsing them into a single good/bad label.
- **Two opportunities, no obligation:** Morning and Evening are suggested slots, not an attendance requirement. Missing dates are neutral.
- **Pleasurable reading:** careful typography and fluid navigation should make revisiting older entries satisfying.
- **Transparent metrics:** keep self-reports separate from probabilistic interpretations of ChatGPT messages.
- **Private by default:** never push journal text or imported conversations to GitHub by default.
- **Autonomy and safety:** no automatic psychiatric labels, forced exercises, penalties for missing a day, or shame around a restarted counter.
- **Auditable CBT:** the model can suggest questions and optional reframes but must not present its inferences as established facts.
- **Compassionate honesty:** every in-app LLM assistant supports the person without automatically endorsing their conclusions; it challenges evidenced errors respectfully and acknowledges its own uncertainty or mistakes.

---

## 2. UX inspiration: How We Feel

### Principles worth adopting

How We Feel popularises emotional tracking along **two dimensions**:

- **Valence:** unpleasant ↔ pleasant.
- **Energy / arousal:** low ↔ high.

This creates four visual families:

| Family | Proposed design token | Valence | Energy | Example English emotions |
|---|---|---|---|---|
| Red / coral | `#EF6863` | Unpleasant | High | Anxious, tense, irritated, angry, worried |
| Yellow / amber | `#F4BC59` | Pleasant | High | Excited, motivated, joyful, inspired, confident |
| Blue | `#74A8D9` | Unpleasant | Low | Sad, discouraged, exhausted, melancholy, down |
| Green / mint | `#74C7A4` | Pleasant | Low | Serene, calm, peaceful, grateful, relaxed |

**These hex values are proposals for an original Through the Days design system, not official How We Feel colours.** Verify contrast and accessibility in both light and dark themes.

Desired UX characteristics: large and legible coloured choices, a nuanced emotion vocabulary, fast check-ins, optional contextual notes, an expressive calendar, non-judgmental summaries and time-series visualisations.

### What not to copy

- Do not duplicate How We Feel's branding, illustrations, proprietary shapes, exact screen sequence, wording, or assets.
- Create an **original visual identity**. This is functional and stylistic inspiration, not a clone.
- Preserve a contemplative personal-journal feel that works on a **Mac display**, especially for long writing sessions.

---

## 3. macOS navigation

A genuine distributable `.app` / `.dmg` with a collapsible **sidebar** and full keyboard, mouse and trackpad support.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Through the Days                                        Search       ⚙ │
├────────────────────┬────────────────────────────────────────────────────┤
│  ◉ Today           │                                                    │
│  ▦ Calendar        │         Active view: write / read / analyse       │
│  ▤ My Journal      │                                                    │
│  ◧ Book View       │                                                    │
│  ◷ Trends          │                                                    │
│  ⌁ Keywords        │                                                    │
│  ◇ Goals           │                                                    │
│  ♧ CBT Exercises   │                                                    │
│  ◇ ChatGPT         │                                                    │
│                    │                                                    │
│  Settings          │                                                    │
└────────────────────┴────────────────────────────────────────────────────┘
```

**Main screens:**

1. **Today:** Morning/Evening entries, daily summary, check-in and writing shortcuts.
2. **Calendar:** full-month view with emotion markers and direct date access.
3. **My Journal:** chronological list, search and filters.
4. **Book View:** page-by-page, immersive chronological reading.
5. **Trends:** mood/energy charts, journal activity and thematic analysis.
6. **Keywords & Tags:** personal index, occurrences, recurrence and topic exploration.
7. **Goals & Counters:** configurable counters, milestones, history and calendar visibility.
8. **CBT Exercises:** thought records, guided exercises, action plans and follow-up reviews.
9. **ChatGPT:** manual import, import status, classifications and private summaries.

Sidebar collapse, a reasonable minimum window width, standard macOS full-screen behaviour, system-matched light/dark mode and manual theme override are required. Weekly Review and The Path So Far may begin as Trends subviews; Looking Back, Ask My Journal, and Personal Patterns are later exploration views. Preserve source/filter context when navigating to Calendar or Book View. Unimplemented later views must be identified accurately.

---

## 4. Daily writing: one or two entries

### 4.1. Day model

Each date has at most **two default slots**:

- **Morning:** intentions, opening thoughts, starting energy and mood.
- **Evening:** reflections, what happened, current energy and mood.

One entry per day is enough: unfilled slots must not be treated as failures. Each entry stores **its own** mood and energy, and the app must explain any day-level aggregation of the two.

### 4.2. Entry flow: check-in → progress → writing

The creation flow is **short, modular and progressively saved**. Guided screens precede free-form writing but must not block it if the person skips answers.

1. **Time slot:** Morning or Evening; editable; at most one entry per slot and date.
2. **Current state:** valence/mood `0..10`, energy `0..10`, optional emotion labels and the four-family picker.
3. **What I did:** quick categories (`work`, `walking`, `exercise`, `reading`, `social`, `rest`, `creative`, `self-care`, `other`) and/or free-text actions. Multiple actions, none mandatory; resting can be a valuable action.
4. **Small wins:** optional text prompt **“What did I manage to do, even if it felt small?”** with **“Nothing to add today”** shortcut.
5. **Pride and perceived progress:** distinct optional scores `1..10`, with **“What am I proud of?”** and **“How much do I feel I moved forward?”**. Missing answers are `NULL`, not zero; neither optional score changes completion.
6. **Main difficulty and next small step:** two optional fields, kept separate from positive reflections.
7. **Free-form journal:** rich-text/Markdown editor, unrestricted length, optional tags.
8. **Only after writing:** a quiet **“Explore with CBT”** action or **“Finish without analysis.”**

**Time-slot variations:** Morning prioritises **“Today's intention”** and **“One small step to try”**; Evening prioritises **“What I did”**, **“What I'm proud of”**, **“What helped.”** Actual entry time does not silently change the chosen slot. Structured responses, free text and CBT sessions are **different data entities**.

**UX constraints:** target a 60–90-second quick check-in; allow **Skip** at every stage, **Write directly**, later completion, and autosave on the first interaction. No pride or activity field is required to start writing. `draft` entries may be partial; to mark an entry `complete`, the original MVP rule is non-empty text plus mood and energy.

### 4.2.1. Optional writing depths

| Depth | Suggested duration, hideable | Presentation |
|---|---|---|
| Quick Check-in | About 30 seconds | Optional current state and a sentence; save partial content as a draft |
| Daily Journal | About 5–10 minutes | The existing skippable check-in and free writing |
| Deep Reflection | About 15–20 minutes | The same entry plus an optional manual worksheet once phase 3 is delivered |

Mode choice is never a gate. Switching keeps the same entry ID, journal date, slot, text, and answers. No timer, low-energy inference, mandatory extended exercise, or second entry is created. Until worksheets exist, their unavailability is explicit and writing stays usable. The normal guided flow still targets 60–90 seconds; duration suggestions describe different depths, not obligations.

### 4.3. Today screen (illustrative text wireframe)

```text
SUNDAY 22 NOVEMBER                                               Today

┌────────────────────────────────┬──────────────────────────────────┐
│ MORNING                        │ EVENING                          │
│ 🔵 Mood 4/10 · Energy 3/10    │ + Add my evening reflection      │
│ Activities: reading, rest      │ ① How I feel                     │
│ Pride: 6/10                    │ ② What I did / what I'm proud of │
│ [Read] [Edit]                  │ ③ Write freely                   │
└────────────────────────────────┴──────────────────────────────────┘

MY LAST 14 DAYS (illustrative data)
  D-13 ...   D-6    D-5    D-4    D-3    D-2    Yesterday   Today
    ●          ●      ●      ○      ●      ●       ●          ●
  Hover: mood / energy / pride / one activity or small win
  [7 days] [14 days] [30 days] [Hide scores]

What I did today: [3 logged activities]
Pinned goal (optional): [Days without checking: 12]
[Read this day] [Explore my progress] [CBT Exercise]
```

All sample names, values and counters are **fictional**. Empty dates must remain visible without fabricated metrics.

### 4.4. Editor

- Light rich text or Markdown with unobtrusive WYSIWYG rendering; choose the final editor at prototype stage while preserving Markdown export.
- Headings, paragraphs, lists, emphasis and quotes; Mac shortcuts `⌘B`, `⌘I`, `⌘S` (explicit save).
- Optional word count, hideable toolbar and distraction-free focus mode.
- At the bottom of each day, an optional, navigable **7/14/30-day progress timeline** (mood, energy, pride, achievements, date navigation), hidden in focus mode.
- During rereading, select a word or phrase and choose **“Explore this word over time”** to open lexical and semantic statistics.
- Autosave status **“Saving…” / “Saved” / “Couldn't save”**; crash recovery and draft restoration.
- No unsolicited AI rewriting or generated journal text.

---

## 5. Emotion picker inspired by How We Feel

### 5.1. Four-quadrant approach

Offer a **2×2 emotion matrix** or a grid of **coloured emotion chips**, showing both axes and allowing more specific choices.

```text
                             HIGH ENERGY

          UNPLEASANT                             PLEASANT
       ┌───────────────────────┬──────────────────────────┐
       │ RED                   │ YELLOW                   │
       │ Anxious    Tense      │ Joyful      Excited      │
       │ Irritated  Worried    │ Motivated   Confident    │
       ├───────────────────────┼──────────────────────────┤
       │ BLUE                  │ GREEN                    │
       │ Sad        Exhausted  │ Serene      Peaceful     │
       │ Down       Discouraged│ Relaxed     Grateful     │
       └───────────────────────┴──────────────────────────┘

                              LOW ENERGY
```

**Numerical scores are primary.** Derive quadrant position from `energy_score` and `valence_score` with transparent rules: `0..4 = low/unpleasant`, `6..10 = high/pleasant`, while `5` is a neutral middle state and must not arbitrarily imply a strong emotion.

If a user chooses **“Anxious”** with a low energy score, **never silently overwrite** their values. Offer an optional clarification, or retain the nuance. Chosen emotion labels and numeric scores may coexist even when they do not neatly match a quadrant.

### 5.2. Initial English emotion vocabulary

Use an **original, versioned English taxonomy**, with a brief definition available on hover/focus/click.

- **Red:** Anxious, Worried, Frustrated, Tense, Irritated, Annoyed, Stressed, Panicked, Angry.
- **Yellow:** Joyful, Excited, Curious, Motivated, Proud, Energised, Inspired, Confident, Hopeful.
- **Blue:** Sad, Melancholy, Down, Tired, Exhausted, Discouraged, Lonely, Gloomy, Unmotivated.
- **Green:** Calm, Relaxed, Serene, Peaceful, Grateful, Content, Comforted, Tranquil, At Ease.

Before release, review overlap/synonyms and the definitions with an English-speaking editor. Avoid any diagnostic implication and include **“Another emotion…”**.

### 5.3. Intensity and accessibility

- Optional intensity (`low`, `medium`, `high`) can be introduced later.
- **Colour must never be the sole meaning carrier**: show text labels, values, shapes and tooltips.
- Accessible palettes, keyboard control, VoiceOver, adjustable type and `prefers-reduced-motion` are required.

---

## 6. Calendar reading mode

### Required behaviour

- Full-month calendar, **Monday-first** by default; previous/next month and **Today** shortcuts.
- Each date shows the day number and **zero, one or two markers**, one per Morning/Evening check-in, coloured by emotional family.
- Empty dates remain visually neutral; never paint them as a negative day.
- Clicking a date opens its two entries, **logged activities, pride, optionally pinned counters**, and edit/create actions.
- Hover/focus summary with accessible text, such as **“22 November, Morning: energy 3, mood 4; Evening: no entry.”**
- Optional filters by topic, emotion, energy, pride, achievements, tags or counters; local full-text search.
- Arrow/Enter/Escape keyboard navigation, English date labels and configurable time zone.

### Illustration

```text
                             NOVEMBER 2026

   Mon      Tue      Wed      Thu      Fri      Sat      Sun
     2        3        4        5        6        7        8
    🟢       🔵       🔵🟢      🟡       —        🟢       🔴

     9       10       11       12       13       14       15
    🔵🟢      🔴       —        🟢🟡      🔵       🟢       🟡

          (Illustrative markers, not real user data.)
```

Provide a **quick day preview** without navigating away from the calendar and an **“Open in Book View”** action.

---

## 7. Book / personal diary reading mode

### Reading experience

- A restrained, elegant **paper-journal aesthetic**: generous margins, legible serif typography, warm cream paper in light mode, comfortable dark reading mode.
- Optional **two-page spread** on larger displays, with one date/entry per page where appropriate.
- **Single-page view** on smaller windows; avoid splitting words or clipping text.
- Previous/next buttons, `←`/`→` arrows, trackpad gestures and **Back to Calendar**.
- Optional, subtle page-turn animation; disable it for reduced motion. No heavy 3D dependency.
- Page heading: full English date, Morning/Evening label, emotion marker, score(s), optional pride, tags and permitted pinned counters.
- Optional footer timeline and selected-term frequency exploration over previous weeks/months.
- Show the **full text once**, with one entry per page and scrolling for long entries. Keep text selectable and preserve the reading position when returning or resizing (D-012).
- Direct date picker or progress scrubber to jump across months.

### Pagination model

By default, the book traverses **existing entries in chronological order**; for a date with two entries, Morning comes before Evening. Each entry occupies one reading page regardless of text length; window size and font changes adjust its layout without dividing it into continuation pages (D-012). Empty dates are skipped by default. An optional **“Show empty dates”** mode remains a later reading enhancement.

```text
┌──────────────────────────────┬──────────────────────────────┐
│ Sunday 22 November           │ Sunday 22 November           │
│ MORNING • Energy 3 • 🔵      │ EVENING • Energy 6 • 🟢      │
│                              │                              │
│ This morning, I thought...   │ Tonight, what stands out...  │
│                              │                              │
│ ‹ Previous page              │                 Next page ›  │
└──────────────────────────────┴──────────────────────────────┘
```

All example prose is fictional.

---
## 8. Trends and analysis

### 8.1. Self-reported journal metrics

- **Energy:** daily, weekly and monthly; Morning and Evening separately, with an average only where justified.
- **Mood/valence:** daily, weekly and monthly, applying the same separation.
- **Emotional family distribution:** red, yellow, blue and green among completed check-ins.
- Most frequently selected emotion labels and changes over time.
- Days with at least one entry, total entry count and Morning/Evening distribution.
- **Self-rated pride and perceived progress (each optional `1..10`)**, logged activities, canonical approved small wins and reported follow-through. The number of logged actions is not the total number of actions performed in real life.
- **Progress indicators:** days with an achievement, small steps attempted, intentions explicitly confirmed as completed, and CBT exercises started/completed.
- Filters: last 7, 30 or 90 days and a custom date range.
- Later: optional exploration of associations among mood, energy, activity tags, sleep and context.

**Never treat missing values as zero when calculating an average.** Display sample sizes and the coverage dates of the underlying observations.

### 8.2. ChatGPT-imported metrics

Retain the original analytics project's ambitions:

- **`rumination_mentions`:** count of user messages explicitly mentioning rumination.
- **`countdown_requests`:** count of explicit countdown requests.
- **`topics_mentioned`:** themes such as health, work, learning, relationships, exercise, finance and others.
- **`action_ideas`:** possible steps considered.
- **`decisions`:** explicit decisions reported in conversation.
- **`actions_reported`:** actions the user explicitly says they completed.

Every extracted event needs a **source message reference, timestamp, method, classifier version and review status**. A rumination mention is **not a clinical episode**, and message counts do not reliably measure time spent ruminating.

### 8.3. Combined analyses

Eventually support **exploratory questions**, for example: **“On days when I reported lower energy, did I also talk more about fatigue?”** Such findings are **descriptive associations, not causal evidence**. Avoid reducing all personal progress to a single psychological score or presenting data as a moral judgement.

### 8.4. Planned visualisations

- Calendar heatmap of self-reported emotions with accessible labels and legends.
- Valence and energy lines for 7/30/90 days, with distinct Morning and Evening observations.
- Emotion distribution by quadrant and time period.
- Comparison of ChatGPT discussion topics and journal topics, with source separation.
- Gentle optional weekly review of **documented** highlights; user review before saving or sharing.
- **7/14/30-day timeline** under daily entries; pride/activity charts; tag and keyword frequency (matches and distinct days); goal milestones and selected CBT small steps.

### 8.5. Weekly Review

A user-initiated Monday–Sunday ISO-week reflection combines deterministic counts, source links, and separate authored notes; AI is optional. Store exact week boundaries and source-version metadata. Three in-scope entries on two dates mean two days with entries. Count approved win IDs once, distinguish started and completed exercises, and preserve neutral experiment outcomes. Show the draft-inclusion rule and coverage; an empty week is “No entries recorded”, and a sparse week cannot justify broad claims.

Optional generated text is labelled, editable, and retained only when chosen. Source edits mark it stale; removed/hidden source excerpts stop appearing immediately. Regeneration preserves user-authored notes. Reminders are off until opted into.

### 8.6. The Path So Far

A long-range view offers 7/30/90-day, one-year, and custom ranges, accessible zoom/pan, source filters, and private user-created milestones. Reuse the existing timeline's calculations and date navigation; the editor's 7/14/30-day mini timeline remains a smaller view of the same observations.

Layers include check-ins, approved wins, and milestones first; experiments, tags, goal history, and imported themes appear only as their capabilities are delivered and enabled. Counter layers require explicit opt-in. Keep separate scales and slots, honest gaps, and source links; provide Hide scores, wins-only, and Gentle view. Opening a date or Book passage preserves the previous range/filter context. No “worst month” label, composite improvement gauge, or invented interpolation is shown.

---

## 9. ChatGPT import and synchronisation: actual constraints

**Important:** Do not assume that a consumer ChatGPT API can download every conversation from a personal ChatGPT account on a daily schedule. Do not promise such synchronisation without a working, authorised and verified source.

1. **MVP:** manually import an official ChatGPT **ZIP export** or its `conversations.json` file.
2. Normalise messages, retain stable source identifiers and provenance, and deduplicate repeated imports.
3. Extract events and aggregate by explicitly configured local dates.
4. **Later:** investigate a transparent, opt-in local collector for conversations that are genuinely accessible on the user's device, **without bypassing authentication** and without pretending it covers all devices.
5. A macOS `launchd` task may periodically analyse **already available local files**; it does not create otherwise unavailable ChatGPT access.

Daily journaling must never depend on ChatGPT connectivity and must work completely offline.

---

## 10. Recommended technical architecture

Read [Architecture and data protection](docs/technical-design.md#10-recommended-technical-architecture) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 11. Data model

Read [Data model](docs/technical-design.md#11-data-model) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 12. Recommended repository structure

Read [Repository structure](docs/technical-design.md#12-recommended-repository-structure) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 13. Prioritised development roadmap

Read [Prioritised development roadmap](docs/roadmap.md#13-prioritised-development-roadmap) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 14. Detailed specifications: daily reflection and progress

### 14.1. Minimal, extensible, non-judgmental check-in

The check-in **precedes free-form writing** but may be skipped at any stage. A tired person must be able to open the editor immediately without completing a questionnaire.

| English question shown in the UI | Input type | Required? | Use |
|---|---|---|---|
| **How am I feeling?** | Valence `0..10` and optional emotion(s) | Valence only for `complete` | Mood charts |
| **How is my energy?** | `0..10` | Only for `complete` | Energy charts |
| **What have I done since my last check-in?** | Preset and custom activities | No | Achievements and activities |
| **What am I proud of today?** | Free text | No | Small wins collection |
| **How proud do I feel?** | Integer `1..10` | No | Pride timeline |
| **How much do I feel I moved forward?** | Integer `1..10` | No | Independent perceived-progress observation |
| **What helped, and what did I learn?** | Separate optional text answers | No | User-authored reflection |
| **What was difficult?** | Free text | No | Context for challenges |
| **What's one small step I could take next?** | Concrete action, optional date | No | Intention follow-up |

- Scores are **momentary self-reports**, not diagnoses or objective grades.
- A difficult day may also include a useful action and a point of pride **without any improvement in mood**.
- Achievements are **reported by the user**; do not invent actions from silence or assume an intention was fulfilled.
- Morning and Evening remain independent. Day-level statistics should show observation count `n=0/1/2` and the aggregation rule.
- **“What have I done?”** refers to the past. For a morning entry, prefer **“What would I like to try today?”**.

### 14.2. Progress beyond scores

Add a **My Progress** view distinguishing four dimensions:

1. **Experience:** mood, energy, self-rated pride and perceived progress as separate self-reports.
2. **Actions:** walking, reading, chosen rest, social connection, creativity, administrative tasks or other activities that were actually reported.
3. **Coping and flexibility:** a CBT exercise, an attempted strategy, a reported calming technique or reaching out for support.
4. **Follow-through:** an explicit intention and a later user-reported outcome (`done`, `partly done`, `not done`, `postponed`) without moral scoring.

Every progress card links to its **underlying journal entries**. An optional weekly prompt could ask: **“What are three things I did despite a difficult day?”** Avoid forced positivity or promises of linear recovery.

### 14.3. Bottom-of-page timeline

- Display a **horizontal 7/14/30-day timeline** below the open day's entry in Today and Calendar, optionally in Book View. Default to **14 days including the viewed date**.
- Selectable series: **mood, energy, pride, perceived progress, number of logged activities**. Remember the person's display preferences; all series may be hidden.
- Where there are two entries, show two distinct values or a clearly labelled, explicitly selected aggregation method. Never silently merge Morning and Evening.
- No data means **a gap**, never zero. Keep mood and energy axes at `0..10` and pride/progress at `1..10`.
- Hover/focus: full date, recorded metrics, an optional small-win preview if enabled, and **“Open this day”**.
- Accessible horizontal scrolling and keyboard navigation; charts must remain understandable without colour.
- Provide a positive-but-optional filter **“See what moved forward”** to emphasise actions and pride rather than deficits. Do not rank **“best”** and **“worst”** days by default.

**Example:** Reviewing a hard Wednesday may reveal that prior days still included small wins and variable energy; the app must **not** automatically conclude that the person's mental health is better or worse.

---

## 15. Smart tags and journal exploration

### 15.1. Free-form taxonomy and suggestions

- **Manual tags** on entries or dates, such as `#work`, `#fatigue`, `#reading`, `#rumination`, `#friends`, `#pride`. These are editable examples, not medical classifications.
- Optional tag types: `topic`, `activity`, `context`, `strategy`, `project`; no mandatory type.
- Autocomplete and favourites; rename and merge tags without losing history.
- Optional lexical-rule or LLM tag suggestions appear as **suggestions**, never silently applied. One-click approval, with a short explanation such as **“Suggested because this phrase appears in the entry…”**.
- On ChatGPT-derived text, preserve source identity and the confidence of inferred tags.

### 15.2. Thematic rereading flow

1. Choose a tag such as `#rumination` from Calendar, Book View or search.
2. See linked dates, excerpts and **source** (`journal` versus `ChatGPT`).
3. Open an exact date or compare two date ranges.
4. Explore **related** topics without presenting correlation as causation.

Combinable filters: period, Morning/Evening, emotion, pride, energy, source, tracked goal, action status and existing CBT session.

### 15.3. Critical distinction

A **tag** is a user annotation or an approved suggestion. A **text match** is an occurrence in the corpus. An **interpreted event** is a probabilistic extraction. **Never add them together into a single metric.**

---

## 16. Keyword counts and lexical / semantic trends

### 16.1. Read-and-explore interaction

From any entry: **select text → “Analyse this word or phrase”**. People may also save keywords to a personal watchlist.

Illustrative panel (**fictional data**):

```text
KEYWORD EXPLORER: "rumination"          Source: Journal | ChatGPT | Both

Period                        Last 7 days      Last 30 days      Last 90 days
Exact matches                        3                10                23
Entries with a match                2                 7                15
Distinct days with a match          2                 6                12
Matches / 1,000 words             1.2               0.9               0.7

[●—●—○—●——○] Trend with visible missing-data gaps
[Exact matches] [Related word forms] [Semantic topics (AI)]

[See source passages] [Edit related terms] [Hide chart]
```

### 16.2. Three **separate** counting methods

| Method | Definition | Requirement |
|---|---|---|
| `exact` | Literal occurrence, with optional documented case/diacritic normalisation | Deterministic counts and source offsets |
| `lexical_family` | Approved inflections or related forms, e.g. `ruminate`, `ruminating`, `rumination` | Versioned word lists/lemmatisation, user-correctable |
| `semantic_topic` | Content about a topic without necessarily containing the exact word | Model/LLM classification, confidence and review option |

Calculate **occurrence count, entries containing matches, distinct dates containing matches**, and **matches per 1,000 words** separately to reduce the effect of longer writing sessions. Include actual corpus coverage in days. **Rolling 7/30/90-day windows**, calendar weeks and calendar months have different meanings: always label window boundaries accurately.

Do **not** count **“I ruminated less today”** as an active rumination episode merely because the keyword appears. Extracting a **reported episode** is a separate, uncertain classification that must be reviewable. Let the user choose corpus source(s) and hide sensitive categories.

### 16.3. Algorithmic requirements

- Store `start_offset`/`end_offset` using a documented index convention, source ID, algorithm version and lexicon version; make results auditable and reproducible.
- On import or editing, invalidate obsolete matches for the previous text version before rebuilding the index, so occurrences are not duplicated.
- Use **SQLite FTS5** for journal search and a separately scoped local index for ChatGPT; distinguish exact match from lemmatisation.
- Compute dates in a documented local time zone; handle midnight and daylight-saving changes.
- Return both sample sizes `n` and observation coverage. **Zero mentions do not demonstrate absence** of a phenomenon.
- Avoid unsolicited warnings such as **“You ruminated a lot”**. Users decide which trends to display and when.
- The **UI and analysis summaries are English**, even when source documents are multilingual; retain verbatim excerpts in their original language and use appropriate language-aware tokenisation.

---

## 17. Personal goals and counters inspired by I Am Sober

### 17.1. Multiple independent tracking goals

An **“Add a goal”** action opens the following fields:

- **Custom title:** e.g. **“Avoid checking an app”**, **“Reduce a behaviour”**, **“Meditate regularly”**. Never force the term *addiction*.
- **Tracking mode:** `avoid` (time since a behaviour), `reduce` (events relative to a target), `build` (a new habit). Counting logic differs by mode.
- **Start date/time**, time zone, units and configurable target; optional personal reason or hoped-for benefit.
- **Visibility:** independent options for Goals page, Today card, Calendar, Book View and exports. Every option can be disabled.
- **Milestones:** 1, 3, 7, 14, 30, 60, 90 days and custom milestones; subtle celebrations, optionally disabled.
- Optional reminder or daily commitment; ability to log an **urge** without calling it a lapse.

### 17.2. Non-destructive counter and history

For `avoid`, the headline metric is **time elapsed since the start of the current period**. Explicitly choose whether to display **elapsed local calendar days** or **completed 24-hour intervals**; explain the distinction in English and account for time zones and daylight saving. Fictional example: start on 1 November at 19:00, occurrence on 8 November at 18:00 = seven local calendar date boundaries passed but not seven full 24-hour intervals.

- A lapse requires an explicit **“Record a lapse”** button and confirmation; notes are optional. Never infer lapses from journal text, tags or ChatGPT imports.
- Preserve **all previous periods and milestones** after a lapse. Offer both **“Current period”** and **“Overall journey”** views, including recorded frequency and history.
- An **urge, intrusive thought or countdown request** must **never** reset a counter.
- Support historical corrections, undoing an accidental lapse, importing older dates and a small audit log.
- `reduce` compares reported occurrences against a chosen target; `build` tracks reported activity days. Do **not** manufacture abstinence streaks in these modes.
- Where a tracked dependency may involve dangerous withdrawal, do not provide medical withdrawal instructions or encourage stopping without suitable professional assessment.

### 17.3. Calendar and reading integration

An optionally pinned counter can show a **small, unobtrusive badge** on a calendar date, e.g. **`Day 12`**. If several counters are pinned, show a concise summary and details on click rather than crowding cells. In Book View, a permitted counter may appear in the margin. No counter data should appear in screenshots/exports without explicit permission.

### 17.4. Required behavioural examples

- Create two counters; verify their dates, colours, milestones and periods are **independent**.
- Record a lapse on one; the other is unchanged.
- Reimport ChatGPT conversations that contain countdown requests; **neither counter changes**.
- Correct an erroneous lapse; recompute displays from retained history and keep an audit record.

---

## 18. Practical CBT: optional LLM-guided companion

> **CBT = cognitive behavioural therapy.** In this product, a *chain of thinking steps* means **explicit user-facing reflection questions and answers**, not any hidden internal chain-of-thought from the model. LLM suggestions must be concise, editable, verifiable and clearly separated from the user's own words.

### 18.1. Product objective

Help transform a painful recurring thought into **a structured observation, a plausible alternative perspective and a realistic action**. Do not diagnose, prescribe therapy, act as a substitute clinician, or judge the user. CBT worksheets **must function without internet or any model**.

### 18.2. Three exercise flows

**A. Seven-step thought record** (informed by the NHS thought record approach):

1. **Specific situation:** when, where, and what happened, without interpretation?
2. **Emotions and initial intensity:** what did I feel (`0..10`)?
3. **Automatic thought:** what went through my mind?
4. **Evidence supporting it:** observable facts; do not prompt confirmation of the worst-case scenario.
5. **Evidence against or qualifying it:** observable facts and exceptions.
6. **Balanced alternative thought:** a personally credible reframe, without forced optimism or self-blame.
7. **Emotions afterwards and optional next step:** reassess freely; no improvement is not a failure.

**B. Behavioural activation / one small step:** pick a feasible action, estimated effort (`low`/`medium`/`high`), time slot, likely obstacle and adaptation. Later record `done`/`partly done`/`postponed`/`not done` and an optional reflection. Only count actions explicitly confirmed by the user.

**C. Problem-solving:** distinguish what is and is not controllable; generate two or three options, choose a feasible action, and set a review point. Do not encourage repeated checking as a way to resolve emotional uncertainty.

### 18.3. LLM experience: Socratic, not authoritarian

- **Supportive, not sycophantic:** the CBT companion and every other in-app LLM assistant, local or remote, must not agree merely to please. Acknowledge the person's feelings while questioning unsupported conclusions and clearly identifying factual errors or contradictions supported by the selected evidence.
- **Make disagreement useful:** explain the specific issue briefly, distinguish facts from interpretations, and propose a focused question, check, or constructive alternative. Critique the claim or action without humiliating, blaming, diagnosing, or treating the person as inherently wrong.
- **Calibrate and self-correct:** when context is insufficient, say so instead of inventing an error; agree when justified, respect personal values/preferences, and revise an incorrect criticism when new evidence appears. Disagreement is not a demand to accept the model's view. Keep the existing option to stop and the acute-distress support flow.
- **Only on user request:** **“Explore with CBT”** from an entry or **CBT Exercises** page; no unsolicited automatic therapeutic analysis.
- The person chooses A/B/C, or the model proposes **at most two options** with an observable, short justification. The user decides.
- **One question at a time** with configurable limits (for example, seven thought-record steps); provide **Skip**, **Pause** and **Back to Journal** on every step.
- **Ground suggestions in user-reported facts.** Do not claim to know another person's motives, certify a speculative interpretation, diagnose, encourage checking other people's social media, or reinforce reassurance-seeking.
- The user **approves** alternative thoughts and next steps. The model cannot change the main journal text, check-in scores or counters automatically.
- **Prevent loops:** if repeated reframing restates the same issue without new information, offer to close the exercise or choose one simple action rather than sustaining repetitive analysis.
- Distinguish **user-authored answers** from **AI suggestions**. Allow deleting any suggestion.
- All **CBT questions, choices and AI explanations must be in English**. Do not translate or alter an imported quote without consent.

### 18.4. Fictional exercise walkthrough

```text
Evening journal: "I feel like I haven't achieved anything today."

Through the Days: Would you like to explore that thought or note one helpful step?
[ Thought Record ] [ One Small Step ] [ No, Return to Journal ]

Thought Record:
1. What specific situation brought up that feeling?
2. What thought crossed your mind?
3. What observable facts support it?
4. What facts might offer another perspective?
5. What more balanced wording feels believable to you?
6. How do you feel after putting it into words?
7. What small step would feel manageable, if any?

[ Save Thought Record ] [ Keep Only My Answers ] [ Exit ]
```

### 18.5. Providers, privacy and user control

- **No-AI mode (always available):** all guided CBT worksheets run locally and manually.
- **Optional local AI:** user installs Ollama and selects a model. Verify offline functionality **after the model has been downloaded**. Do not promise clinical reliability comparable to a human professional.
- **Optional remote API:** provider configuration and credentials in macOS Keychain; **consent before each send**, with a preview showing exactly which excerpts and fields will leave the device. Never transmit the whole diary by default.
- **Minimal context:** active entry and current exercise answers. Prior entries are included only if explicitly selected.
- **Structured output:** validate a JSON object such as `question`, `step`, `optional_reframe`, `suggested_action`, `warnings`, `source_excerpt_ids` with a strict schema. Reject unexpected properties and escape rendered text. Retain model output only if the user chooses.
- **Prompt versioning:** enforce English output, the shared compassionate and non-sycophantic stance, clear separation of facts/hypotheses, no diagnosis, permission to stop, and **no encouragement of rumination loops**. Before enabling a model/prompt version, run synthetic cases for evidence-based correction, blind agreement, unjustified contradiction, uncertainty, and self-correction on every affected assistant surface; JSON validity alone is insufficient.
- **Robustness:** reasonable timeouts, cancellation, network failure handling, manual fallback, cost/context budgets and logging restricted to non-sensitive metadata.

### 18.6. Next-day review and progress summary

- After a CBT worksheet, the user may opt into **one small action**: specific step, manageable duration, an **“If X happens, then I'll try Y”** plan, an optional review date, or **“Don't schedule this.”**
- At the next check-in, ask **only one** follow-up question: **“Did you try that small step?”** with **“Yes”**, **“Partly”**, **“Not yet”**, **“I no longer want to.”** The AI never claims completion on the person's behalf.
- An **optional weekly review** gathers recorded wins, strategies tried and recurrent obstacles, with source-entry links. Clearly distinguish direct quotes, calculations and AI interpretations. Do not send the full journal to a remote service without excerpt-by-excerpt consent.
- Offer user-initiated modes **“Explore my thoughts”**, **“Recognise my efforts”**, **“Prepare for tomorrow”** or **“Skip analysis.”** The assistant must not pathologise every unpleasant emotion.
- Describe progress through multiple dimensions (recorded actions, self-reported cognitive flexibility, pride and optional quality-of-life reflections), not a mandatory upward mood curve.

### 18.7. Distress support and limitations

Never describe the LLM as a healthcare professional. For text suggesting an acute crisis, **avoid launching an extended analysis or progress countdown**; show calm, clear encouragement to seek timely human support and relevant emergency resources for the selected country. Do not produce a diagnostic **risk score**. Journal text remains editable even when connectivity is unavailable.

The CBT exercises are informed by established approaches; the **clinical effectiveness of this app is not established** and must not be claimed without specific evidence.

### 18.8. Prediction, experiment, observation, and learning

Refine the existing action-plan flow rather than adding a second plan store. The person may explicitly choose a manageable step, record a prediction/effort and optional contingency, try it, then record an observation and optional lesson. Review choices are **Done**, **Partly**, **Not yet**, **No longer relevant**, and **Skip**; Skip is not a fabricated outcome. Existing plan states remain auditable rather than silently relabelled as failure.

Reminders are off by default, with at most one specifically enabled review reminder per plan unless configured otherwise. Retrospective corrections preserve original timestamps and revision history. Deletion invalidates timeline/insight copies. AI can offer at most two ideas; declined suggestions create no approved action. Avoid unsafe/medically consequential assignments, forced positive reframing, and repeated checking of others' activity.

After the original manual workflows work, add bounded offline templates for **Behavioural Experiment**, **Coping Estimate**, **Positive Evidence Journal**, and **Values-to-Action Reflection**. They belong to the separate expand-cbt-exercise-library OpenSpec change so phase 3 can be archived independently. They are optional P2 follow-ups, not an expansion of the first journal MVP or evidence of clinical effectiveness.

---
## 19. Data contracts and implementation interfaces

Read [Service contracts and command responsibilities](docs/technical-design.md#19-data-contracts-and-implementation-interfaces) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 20. Core acceptance tests

Read [Product acceptance scenarios](docs/acceptance-tests.md#20-core-acceptance-tests) in the thematic documentation. The original section number is retained for OpenSpec source references.

---

## 21. Instructions for the development agent

You are implementing **Through the Days** using this specification. Deliver a working macOS application incrementally; never claim unimplemented features are complete.

1. **Start with phases 0 and 1.** The first sprint includes the **guided reflection before writing**, not AI or ChatGPT integration.
2. Initialise Tauri 2 + React + TypeScript, the original emotion-inspired design system, Today view, picker, mood/energy input, **actions + pride `1..10` + “What am I proud of?”**, and the editor.
3. Implement SQLite migrations, autosave, transactions and up to two entries per date. Reflection prompts are optional, except mood, energy and non-empty text when marking an entry `complete`.
4. Prepare extension points for timeline, tags, keywords, goals and CBT sessions, but **do not invent ChatGPT synchronisation**.
5. Write tests with fictional data, document every command and mark incomplete features clearly.
6. At each iteration, report changed files, tests actually run, observed results, limitations and next steps.
7. **English is a hard requirement:** all product UX copy, editor prompts, seed data, app notifications, AI system prompts, CBT templates, release notes and tests are written in English. Do not reuse French strings from old specifications. Do not alter the language of user-written content.
8. **Close every PR with current specs:** after final edits, reconcile affected requirements/scenarios, tasks, decisions and acceptance coverage in the same PR before merge. Delivered features update main specs; planning-only PRs remain proposals. Follow the [PR completion checklist](docs/specification-workflow.md#pull-request-completion) and report sync/archive status or an explicit no-behavior-impact reason.

### First task to execute now

> Initialise the **Through the Days** monorepo. Build a macOS Tauri 2 / React / TypeScript app with a sidebar, light/dark theme, a **Today** screen and the guided flow **“How am I feeling? → What did I do? → What am I proud of? (optional 1–10) → Write freely”**. Persist it in SQLite with migrations and autosave. Add tests for two entries per date, independent Morning/Evening values, skippable questions, draft recovery after restart, and **English-language UI copy**. **Stop after producing a truly usable offline journal.**

### Next tasks, in this order

1. Calendar + Book View + mini timeline, deterministic Weekly Review and initial The Path So Far layers.
2. Manual seven-step CBT worksheets, then optional local LLM coach.
3. Manual tags + exact and normalised keyword statistics.
4. Counters and goals with non-destructive histories, milestones and visibility settings.
5. P2 source-backed exploration and expanded manual templates, then optional ChatGPT import; private portability and approved Hugo aggregates remain separate.

---

## 22. Definition of Done: first MVP

The first MVP is complete when someone can **install or launch Through the Days on their Mac**, fill in or skip a **guided check-in** (mood, energy, activities, optional pride/progress `1..10`, approved small win), write a Morning or Evening entry, have it saved automatically, close the app, and recover the exact text and saved answers on reopening. **All first-party interface content is in English**, regardless of the operating system language. **Calendar and Book View** form the next priority iteration, **before** ChatGPT analytics.

Before real personal use, the MVP also needs the confirmed 30-day trash, portable encrypted backups, daily/next-launch catch-up, and tested restore. Optional writing depths and Gentle view preserve entry identity and data. AI, the extended CBT library, long-range insights, and ChatGPT import are not required to finish this first milestone.

The visual experience should take inspiration from How We Feel's emotional clarity while remaining an **original personal journal** suited to long writing and comfortable reading on macOS.

---

## 23. Evidence-backed personal exploration (P2)

**Looking Back** retrieves relevant local authorised passages, initially using the existing full-text index; optional local embeddings are derivative and removable. Show dated excerpts, source links, actual coverage and a modest distinction between “You wrote…” and interpretation. Each interpretation offers “That's not how I see it” or “Hide this interpretation” independently of pins or Gentle view. An optional “Moment worth remembering” card is local, editable/removable and follows source visibility. No external persistent model memory is created.

**Ask My Journal** defaults to journal-only scope, with other delivered source types selected explicitly. Answers identify question, qualified English answer, source type/ID/date and exact or traceably normalised excerpt, coverage dates, recorded days, source count, limitations and descriptive/exploratory inference level. A weekly summary is not independent primary evidence; follow claims back to original records. Reject unsupported dates, IDs and quotations. When evidence is absent, say “I couldn't find enough relevant entries to answer.”

**Personal Patterns** reuses existing metrics and versioned runs. Display compared variables, time window, missingness, sample sizes and confounding limits. Keep lexical mentions, uncertain semantic topics and any separately reported event type distinct. Show raw and per-1,000-word counts where relevant. Sparse records cannot support broad claims; no relapse prediction, wellbeing forecast or hidden distress classification is introduced.

A deterministic retriever selects bounded authorised snippets before optional model wording. Every remote request still requires its exact preview and explicit consent; the appendix's persistent-permission exception is not adopted. Retrieved instructions are data, never authority or executable tools. Query results cannot mutate journal text, scores, wins, experiments, goals or history. Retain private answers only when chosen. Source hashes/versions support freshness while authorised revisions exist, not retention of deleted text.

## 24. Gentle view and private portability

**Gentle view** combines existing visibility controls: hide optional score/interpretation panels, counters/streak prompts, unsolicited insights and automatic follow-ups while keeping writing, available navigation, authored wins and manual worksheets accessible. Restore prior display choices without altering saved values. Data-integrity warnings and backup prompts remain visible.

Keep three explicit flows separate:

| Flow | Data and protection | Stage |
|---|---|---|
| Recovery backup | Consistent encrypted snapshot, portable passphrase, daily/next-launch catch-up | Before real use, phase 1 |
| Private portability | Selected dated Markdown, versioned JSON, selected-range PDF, quantitative CSV; preview destination and actual protection | Phase 6 |
| Public Hugo aggregates | Exact preview of an approved aggregate allowlist; no prose or hidden counter data by default | Phase 6 |

JSON round trips preserve the selected core records, IDs, timestamps, provenance and confirmed outcomes. Stage and validate imports before committing; repeated imports are idempotent. Active/trash ID conflicts, changed content or occupied slots never silently overwrite or revive data, create duplicates, or invent goal events. A plaintext export is never described as an encrypted backup. File export and publication are separate actions.

## 25. Appendix integration and capability ownership

The [integration assessment](docs/appendix-integration.md) maps all INT-01–INT-10 ideas and TEST-01–TEST-22 cases to their canonical owners. Existing check-in, timeline, counters, consent, manual CBT and metrics were enriched rather than copied into competing features or tables. The original [appendix](appendix.md) remains a historical proposal, including alternatives not adopted.

The eight [OpenSpec changes](docs/specification-workflow.md) separate the core journal, reading/review views, manual CBT and optional AI, exploration, later source-backed insights, the extended CBT library, ChatGPT analysis, and distribution/portability. Milestone 1's tasks carry their verification evidence; later changes keep unchecked tasks, and document validation alone is not evidence of an implemented application.

## Functional and methodological references

- [How We Feel — Google Play listing](https://play.google.com/store/apps/details?id=org.howwefeel.moodmeter&hl=en): inspiration for emotional vocabulary and trends; **do not copy proprietary assets**.
- [I Am Sober — Google Play listing](https://play.google.com/store/apps/details?id=com.thehungrywasp.iamsober&hl=en) and [official FAQ](https://iamsober.com/en/site/faq): inspiration for independent counters, daily commitments, milestones and lapse history; **do not copy its UI**.
- [NHS — Thought record](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/): inspiration for a structured CBT thought record; Through the Days does **not** claim to be a medical device.

All screens and numbers shown in this README are fictional examples. This is a **development specification**, not a description of an already implemented product.
