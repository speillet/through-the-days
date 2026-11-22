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

## Inherited requirements

The README already fixes the offline-first Tauri 2 + React/TypeScript + Rust + SQLite architecture, English-only first-party copy, multilingual user text, two entry slots per date, skippable reflection, independent mood and energy, optional pride, and no automatic uploads. The first usable journal precedes reading views, CBT, goals, ChatGPT analytics, and Hugo exports.

## Engineering proposals

These proposals make acceptance cases precise and must be verified during implementation. They are not additional user-approved product choices.

- Autosave acknowledges a revision only after the complete entry aggregate commits. Recovery promises the last acknowledged revision; unsaved edits remain visibly pending and are retained for retry after a failure.
- Autosave never silently marks an entry complete. Writing-only drafts remain readable. An explicit completion action validates the README predicate; edits that invalidate it return the entry to draft without discarding content.
- Capture the creation time zone as context while preserving the chosen journal date. An entry open across midnight stays attached to its chosen date.
- A trash restore into an occupied date/slot reports a conflict without overwriting either record. Permanent deletion removes the entry's retained live-store data; independent backup snapshots can retain an earlier copy.
- Prototype Tiptap with a single canonical document and derived Markdown. Select editor and chart libraries after checking formatting, Unicode, export fidelity, and macOS behavior.

## Backup policy details

O-001 is resolved by D-006; daily frequency and catch-up are resolved by D-007. The user approved daily backups and next-launch catch-up, rather than accepting the entire bundled policy proposed during the interview. Backup retention, destination defaults, and credential-change behavior remain engineering proposals to specify during backup design. In particular, 30 days is confirmed for trash, not for backup retention.

If the backup credential is unavailable, request it and show that backup is pending; journal writing remains usable. Never report a successful daily backup until one has completed.

## Deferred interview branches

| ID | Question | Trigger |
|---|---|---|
| O-002 | Which scored drafts contribute to trends, and what denominator is displayed? | Before implementing progress aggregation in milestone 2. |
| O-003 | How should neutral numeric scores and differently labelled emotions appear in calendar markers? | Before finalising calendar and chart visual encoding. |
| O-004 | What exact pagination, text scaling, and selection behavior works for long entries? | Book View prototype with synthetic long documents. |
| O-005 | Which local model, context/cost limits, and crisis-resource country behavior should AI assistance support? | After manual CBT is usable, before enabling an adapter. |
| O-006 | Should an avoid-mode counter default to completed 24-hour intervals or local calendar days? | Before goal-counter design. |
| O-007 | Which operating systems, architectures, signing identity, and distribution channel must the public release support? | Before milestone 6 distribution work. |
| O-008 | Which ChatGPT export versions and bounded import sizes are supported? | Before implementing import. |
| O-009 | Specify backup destination defaults, retention, and safe credential-change behavior. Daily frequency and next-launch catch-up are already decided. | Backup design, before using real data. |
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
