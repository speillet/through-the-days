# Add optional guided reflection and CBT support

## Why

The person can choose a structured reflection or manageable action without depending on a model or having their journal interpreted automatically.

## What Changes

- Deliver milestone 3 (README phase 3): manual exercises and experiments first, then optional AI; expanded templates belong to the separate expand-cbt-exercise-library P2 change.
- Ship manual exercises first; add an optional local model only after manual workflows work. Keep source authorship, consent, and user control visible.
- Keep the proposal and its tasks visibly unimplemented until verification.

## Capabilities

### New Capabilities

- cbt-worksheets: Offline exercises and existing action plans extended with predictions, observed outcomes, lessons, and neutral review.
- llm-assistance: User-requested local/remote suggestions with explicit consent and bounded behavior.

### Modified Capabilities

None. The delivered capability inventory is currently empty.

## Impact

Dependencies: build-offline-journal; add-journal-reading is the preceding product milestone.

Sources: README §§18–20 and 13 phase 3; appendix INT-03/09 (§§5, 11) and §13.4.

Out of scope: Diagnosis, treatment promises, hidden reasoning disclosure, automatic journal rewriting, automatic score changes, or automatic goal resets.

Open decisions: Confirm original-exercise wording and experiment revision/deletion policy when implementing that slice. Resolve O-005 and the exact provider/output limits before enabling an adapter. Confirm reminder and follow-up behavior during the exercise prototype.

Status: draft planning baseline derived from the README and recorded user decisions; no application implementation is claimed.
