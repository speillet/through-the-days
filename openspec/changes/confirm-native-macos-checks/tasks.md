# Outstanding native verification

Status: not executed. This verification-only checklist supplements the original milestones' tasks; it does not mark them complete or change their requirements.

## 1. Native accessibility and navigation

- [ ] 1.1 On a supported Mac with synthetic data, use VoiceOver through writing, saving/errors, Calendar, Book View, Weekly Review, and the personal timeline. Record announced names, focus order, actionable controls, macOS version, and actual results in acceptance coverage.
- [ ] 1.2 Use real keyboard navigation, app shortcuts, full-screen entry/exit, and reduced motion in the native window. Verify source navigation and a long Book entry retain usable focus and reading position; record results and limits.

## 2. Native persistence and protection

- [ ] 2.1 Exercise native folder/file dialogs and optional Keychain prompts, including cancellation and unavailable credentials, a refused store or delete, and a launch prompt left unanswered behind the window while a passphrase is entered or forgotten. Verify an error never appears as a successful backup, the app says what Keychain did not do or that it waits for Keychain, and existing writing remains readable; record whether that passphrase change completed before the launch prompt was answered, with synthetic records only.
- [ ] 2.2 Disable networking at the operating-system level and verify native create/edit/save/restart/read, search, and weekly notes. Record the disabled-network environment and actual persistence results.
- [ ] 2.3 Back up to an actual exFAT drive and restore into an isolated destination, comparing synthetic writing and reading metadata. Record device/filesystem details and any interruption or unsupported behaviour.

## 3. Acceptance reconciliation

- [ ] 3.1 Review actual results against the original journal and reading acceptance tasks, leaving failed or unexecuted work unchecked. Update acceptance coverage and development status before any milestone archive or implementation PR merge.

## Workflow follow-up

- Archive this verification-only change after its results are recorded. Assess each original product change independently before synchronising or archiving it.
