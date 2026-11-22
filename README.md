# Through the Days

*Every day you make it through becomes another page.*

A personal journal for macOS, designed to help you remember your days, notice your efforts, and reflect at your own pace. Your writing stays at the centre; check-ins, scores, and guided exercises are optional.

> **Status: in planning.** The application is not implemented and there is no installable release yet. This repository currently contains the product requirements, specifications, and development tooling. Installation instructions will be added with the first usable build.

## The planned experience

- **Write your way.** Keep a Morning or Evening entry, choose a short check-in or longer reflection, or go straight to writing. One entry is enough.
- **Name how you feel.** Record mood and energy independently, with optional emotions, pride, and perceived progress.
- **Notice what you did.** Save activities and small wins without turning a difficult day into a failed day.
- **Revisit your story.** Browse a calendar, read your journal like a book, and explore weekly reviews and a personal timeline.
- **Reflect with care.** Use manual cognitive behavioural therapy (CBT) worksheets and small experiments. Optional AI assistance should be kind, question unsupported conclusions, and acknowledge its own mistakes.
- **Keep things simple.** Hide optional scores and tracking with Gentle view. Missing days stay neutral.

These features are planned. The first milestone is a usable offline journal; reading views and other features follow progressively.

## How you will use it

Once a working build is available, the intended daily flow is:

1. Open **Today** and choose Morning or Evening and the date you want to write about.
2. Complete any parts of the check-in you find useful, or choose **Write directly**. You can leave optional questions unanswered.
3. Write freely, record a small win if you want, and let autosave preserve your draft. Mood, energy, and non-empty writing are needed only when marking an entry complete.
4. Come back to read or continue your entry. As later features arrive, use Calendar, Book View, or an optional exercise to explore further.

The interface will be in **English**. Your journal can be written in **any language**, without automatic translation.

## Privacy and AI

The app is designed to work locally and offline, with encrypted backups and explicit control over sharing. AI and ChatGPT imports are optional; they are not required to keep a journal. Every remote AI request must show what will be sent and ask for consent.

CBT features are self-reflection tools, not a replacement for professional care. The live journal's planned macOS protection and backup encryption are explained in the [privacy and storage requirements](docs/technical-design.md#103-data-location-and-security).

## Learn more

| You want to… | Read |
|---|---|
| Understand the full product and feature requirements | [Detailed product reference](README_THROUGH_THE_DAYS.md) |
| See what will be built first | [Development roadmap](docs/roadmap.md) |
| Understand the architecture, storage, and data contracts | [Technical design](docs/technical-design.md) |
| Develop or contribute to the project | [OpenSpec workflow and tooling](docs/specification-workflow.md) |

See also the [license](LICENSE).
