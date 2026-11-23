# Through the Days

*Every day you make it through becomes another page.*

A personal journal for macOS, designed to help you remember your days, notice your efforts, and reflect at your own pace. Your writing stays at the centre; check-ins, scores, and guided exercises are optional.

> **Status: offline-journal development preview.** The offline journal works: Morning and Evening entries, a skippable check-in, the editor, autosave, Trash, and encrypted backups with restore. Automated verification is available; manual native acceptance remains open in [milestone 1 status](docs/milestone-1-status.md). There is no signed release yet, so you build the app yourself (see [Build and run](#build-and-run)). Reading views, CBT exercises, and the other planned features arrive in later milestones.

## What you can do now

- **Write your way.** Keep a Morning or Evening entry for any date. Choose a quick check-in, the daily journal, or go straight to writing. One entry is enough.
- **Name how you feel.** Record mood and energy from 0 to 10, an emotion word, and, if you like, pride and perceived progress from 1 to 10.
- **Notice what you did.** Note activities, small wins, what helped, what you learned, a difficulty, and a next small step. Every question is optional.
- **Keep your own words.** Entries save as you type, with a clear *Saving…*, *Saved*, or *Couldn't save*. You can view any entry as Markdown.
- **Keep things simple.** Gentle view hides scores and tracking prompts without deleting anything. Missing days stay neutral. Text size is adjustable.
- **Recover from mistakes.** Deleted entries stay in Trash for 30 days. Encrypted backups run daily while the app is open, into a folder you choose, and can be restored on another Mac with your backup passphrase.

## How to use it

1. Open **Today**, then choose Morning or Evening. Use the date controls if you are writing about another day, for example just after midnight.
2. Answer any parts of the check-in you find useful, skip them, or choose **Write directly**.
3. Write freely. Autosave keeps your draft; press ⌘S to save straight away. Mood, energy, and some writing are needed only if you mark an entry complete.
4. Before relying on the app, open **Settings → Backups**, choose a backup folder, and set a backup passphrase. Keep the passphrase somewhere safe: backups cannot be restored without it.

The interface is in **English**. Your journal can be written in **any language**, without automatic translation.

## Coming later

- **Revisit your story:** a calendar, a book-style reader, weekly reviews, and a personal timeline.
- **Reflect with care:** manual cognitive behavioural therapy (CBT) worksheets and small experiments. Optional AI assistance should be kind, question unsupported conclusions, and acknowledge its own mistakes.
- **Explore:** tags, keyword trends, independent goals, and optional private ChatGPT analytics.

These views appear in the sidebar as *Not available yet* until they are delivered.

## Privacy and AI

The app works locally and offline. It never uploads your journal and has no account. The live journal is stored in `~/Library/Application Support/com.throughthedays.app` and relies on your macOS account and disk protections; the app does not encrypt it. Backups are encrypted with your backup passphrase. See the [backup format](docs/backup-format.md) and the [privacy and storage requirements](docs/technical-design.md#103-data-location-and-security).

AI and ChatGPT imports are not part of this version. When they arrive, they will be optional, and every remote AI request will show what will be sent and ask for consent. CBT features are self-reflection tools, not a replacement for professional care.

## Build and run

You need macOS 13 or later, the Xcode Command Line Tools, Node.js 22.20 or later, and [rustup](https://rustup.rs) (the pinned Rust toolchain installs itself).

```sh
npm ci
npm run build:mac
```

The app is created at `target/release/bundle/macos/Through the Days.app`. Open it from there or move it to Applications.

For development, `npm run dev` starts the app with live reloading. Development builds keep their data in a separate `com.throughthedays.app.dev` folder, so they never open your real journal. `npm run check`, `npm test`, `npm run test:e2e`, and `npm run test:rust` run the checks; [the specification workflow](docs/specification-workflow.md) explains how changes are planned and verified.

## Learn more

| You want to… | Read |
|---|---|
| Understand the full product and feature requirements | [Detailed product reference](README_THROUGH_THE_DAYS.md) |
| See what comes next | [Development roadmap](docs/roadmap.md) |
| Understand the architecture, storage, and data contracts | [Technical design](docs/technical-design.md) |
| Understand backups and recovery | [Backup format](docs/backup-format.md) |
| Develop or contribute to the project | [OpenSpec workflow and tooling](docs/specification-workflow.md) |

See also the [license](LICENSE).
