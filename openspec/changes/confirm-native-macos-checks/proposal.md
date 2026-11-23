# Record outstanding native macOS verification

## Why

Automated journal and reading checks pass, but they cannot establish VoiceOver usability, real hardware interactions, or removable-drive behaviour. Track these remaining checks explicitly before declaring the original milestones complete.

## What Changes

- Maintain a manual verification checklist and record actual results, environment, and limitations in acceptance coverage.
- Keep the corresponding tasks in `build-offline-journal` and `add-journal-reading` open until their required evidence exists. This checklist does not remove their acceptance obligations.
- Propose a separate implementation change if a check exposes a requirement or product behaviour that needs to change.

## Capabilities

### New Capabilities

None. This change records verification evidence only; `skip_specs: true` applies.

### Modified Capabilities

None. Existing product requirements remain owned by the original journal and reading changes.

## Impact

Milestones 1–2: documentation and manual execution on a supported Mac using synthetic data in a separate development data directory. No product code, dependencies, journal migration, or release is introduced by this plan. No new product decisions are required. Wider distribution, CBT, AI, and private-data use remain out of scope.
