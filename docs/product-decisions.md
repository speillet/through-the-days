# Product decisions and open questions

Confirmed choices refine the original README v0.6 and remain in force in the consolidated v0.7. Draft recommendations remain distinct from confirmed decisions. All entries below originate in the specification interview on 22 November 2026.

## Confirmed decisions

| ID | Decision | Consequence |
|---|---|---|
| D-001 | Personal use on the owner's Mac first; wider distribution is a separate milestone. | The MVP needs a launchable Mac app, not accounts or a hosted service. |
| D-002 | Default to the current civil date; allow explicit correction, including the previous date after midnight. Preserve historical journal dates across time-zone changes. | Date and slot are explicit entry properties. See ADR 0001. |
| D-003 | Retain deleted entries in local trash for 30 days, with restoration and explicit permanent deletion. | Deletion is a lifecycle transition; recovery must respect the two-slot constraint. |
| D-004 | Use macOS session/disk protections for the MVP; the application does not encrypt its live SQLite database or provide a separate vault password. | Describe protection accurately; FileVault availability is not guaranteed by the application. |
| D-005 | Include encrypted local backup and tested restore before real personal use. | Advance backup/restore from phase 6 into the first usable milestone. See ADR 0002. |
| D-006 | Encrypt backups with a dedicated portable passphrase, optionally remembered in macOS Keychain. | A clean Mac can restore a backup with that passphrase; the live journal still has no application vault password. |
| D-007 | Back up daily while the app is open; catch up at the next launch when it was closed. | The MVP needs no background service. Catch-up records the current recoverable state, not invented snapshots for missed days. |
| D-008 | Every in-app LLM assistant must be supportive without being a yes-man: challenge evidenced errors and unsupported conclusions with kindness, calibrated uncertainty, and self-correction. | One shared policy applies to CBT, journal questions, generated interpretations, and local/remote adapters; acceptance checks must test dialogue stance, not just output structure. |
| D-009 | Keep the 30 latest validated encrypted backups, in a folder chosen in the app. | Prune only after a replacement succeeds; independently retained copies and the 30-day trash policy remain separate. |
| D-010 | Include recorded scores from saved drafts as well as completed entries in descriptive statistics. Confirmed 23 November 2026. | Show per-metric observation counts and distinct recorded days; missing values are never zero. |
| D-011 | Keep separate Morning/Evening calendar markers, explicit neutral numeric values and independently chosen emotion labels. Confirmed 23 November 2026. | A score of 5 on either axis has no strong quadrant colour; labels never overwrite scores. |
| D-012 | Book View shows one entry per page, with scrolling for long text, adjustable text size and a preserved reading position. Confirmed 23 November 2026. | Render each document once in full, preserve text selection, and retain the entry/position across navigation and resize. |

## Inherited requirements

The README already fixes the offline-first Tauri 2 + React/TypeScript + Rust + SQLite architecture, English-only first-party copy, multilingual user text, two entry slots per date, skippable reflection, independent mood and energy, optional pride, and no automatic uploads. The first usable journal precedes reading views, CBT, goals, ChatGPT analytics, and Hugo exports.

## Engineering proposals

These engineering choices make acceptance cases precise; they are not additional user-approved product choices. The automated suites cover the first five choices. See [actual evidence and remaining acceptance](acceptance-coverage.md#milestone-1-evidence); milestone 1 is not yet archived.

- Autosave acknowledges a revision only after the complete entry aggregate commits. Recovery promises the last acknowledged revision; unsaved edits remain visibly pending and are retained for retry after a failure.
- Autosave never silently marks an entry complete. Writing-only drafts remain readable. An explicit completion action validates the README predicate; edits that invalidate it return the entry to draft without discarding content.
- Capture the creation time zone as context while preserving the chosen journal date. An entry open across midnight stays attached to its chosen date; a Today view with no open entry moves on to the new date.
- A trash restore into an occupied date/slot reports a conflict without overwriting either record. Permanent deletion removes the entry's retained live-store data; independent backup snapshots can retain an earlier copy.
- Tiptap holds a single canonical document; Markdown is derived for review and copying. Chart libraries are selected in milestone 2.

Implementation choices adopted in milestone 1, also engineering proposals rather than product decisions:

- Each entry is stored as one validated aggregate ([ADR 0003](adr/0003-store-each-entry-as-one-validated-aggregate.md)).
- The backup plan (folder, last success, Keychain choice) is device-local and outside the journal, so a restore never changes backup settings.
- Before a restore replaces a journal that has entries, the app makes a safety backup when a folder and passphrase are available. If the current journal cannot be read, restoring without that safety backup needs explicit confirmation. A journal that cannot be opened at launch can be restored from a backup; the unreadable file is kept aside, never deleted.
- Daily backups are attempted at launch, every 10 minutes and when the window regains focus while the app is open. After a failed automatic attempt they pause for an hour unless the folder or passphrase changes; Back up now always runs.
- Gentle view hides score panels, suggested durations and the completion control. Drafts remain complete records of what was written, and leaving Gentle view restores every control.
- Interface text size can be set to 100, 115, 130 or 150%, independently of layout spacing.
- Development builds use a separate com.throughthedays.app.dev data folder and Keychain item.
- Supported window close and application Quit wait for acknowledged saves. A missing renderer reply, timeout, event failure or timer failure keeps the app open and permits retry rather than approving exit.
- Known limit: quits started by macOS itself (Dock, app switcher, logout or shutdown) skip the flush-before-quit request. Acknowledged revisions are durable, and the interface saves pending input when the window loses focus.

## Backup policy details

O-001 is resolved by D-006; daily frequency and catch-up are resolved by D-007. Backup retention is resolved by D-009. The [backup contract](backup-format.md) specifies native destination selection, validated publication, safe passphrase changes and recovery. Existing backups retain their original passphrase; a changed credential applies to future snapshots. The 30 latest validated backups are a count, independent of the 30 days confirmed for trash.

If the backup credential is unavailable, request it and show that backup is pending; journal writing remains usable. Never report a successful daily backup until one has completed.

## Deferred interview branches

| ID | Question | Trigger |
|---|---|---|
| O-002 | Resolved by D-010: include saved scored drafts, state each metric's observation count and date coverage. | Resolved for milestone 2. |
| O-003 | Resolved by D-011: separate slots, neutral numeric markers and independent emotion labels. | Resolved for milestone 2. |
| O-004 | Resolved by D-012: one complete entry per page with scrolling, text selection, text size and stable position. | Resolved for milestone 2. |
| O-005 | Which local model, context/cost limits, and crisis-resource country behavior should AI assistance support? | After manual CBT is usable, before enabling an adapter. |
| O-006 | Should an avoid-mode counter default to completed 24-hour intervals or local calendar days? | Before goal-counter design. |
| O-007 | Which operating systems, architectures, signing identity, and distribution channel must the public release support? | Before milestone 6 distribution work. |
| O-008 | Which ChatGPT export versions and bounded import sizes are supported? | Before implementing import. |
| O-009 | Resolved by D-009 and the [backup format](backup-format.md): a folder chosen in the app, the 30 latest validated backups, and new passphrases applying to future backups only. | Resolved in milestone 1. |
| O-010 | Specify retrieval offsets/normalisation, bounded context, and minimum evidence for descriptive patterns. | Before P2 source-backed insights. |
| O-011 | Specify private JSON schema versions, conflict-resolution UX, selected-content boundaries, and destination/protection defaults. | Before private portability. |
| O-012 | Review wording and bounded steps for the extended offline exercise library. | After the original manual exercises work, before P2 templates ship. |

Decisions about backup retention must explain its interaction with trash and permanent deletion. Thirty-day trash retention does not imply erasing older encrypted backups, and ordinary deletion does not guarantee forensic erasure.

## Appendix incorporation

The user requested incorporation of useful appendix ideas on 22 November 2026. The [assessment](appendix-integration.md) identifies retained refinements and deferred P2 work. This authorises updating the plans, not claiming features or clinical benefit are delivered. D-001–D-007 and per-request remote consent remain unchanged.

- Perceived progress is optional and independent; depth changes preserve the same entry.
- Experiments extend existing action plans; small-win promotion is explicit and counted once.
- Weekly reviews and long-range views reuse source queries and metric definitions.
- Looking Back, Ask My Journal, Personal Patterns, extended templates and private portability remain in their specified later milestones.
- Design the retrieval offset/normalisation and minimum-evidence rules before P2 insights; review extended template wording before delivery.
- Specify private JSON version/conflict handling before portability. Source fingerprints do not authorise retaining deleted text.
