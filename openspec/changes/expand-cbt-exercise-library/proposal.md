# Expand the offline CBT exercise library

## Why

The appendix proposes additional optional exercises after the original manual CBT workflows are usable. Keeping this P2 work in a separate change lets phase 3 be verified and archived independently.

## What Changes

- Deliver a P2 catalogue of bounded, inspectable offline templates for Behavioural Experiment, Coping Estimate, Positive Evidence Journal, and Values-to-Action Reflection.
- Reuse existing sessions, approved action plans/experiments, and shared AI controls rather than introducing another plan store.
- Keep the original three manual exercises usable while the extension is unavailable; optional suggestions never choose for the person.

## Capabilities

### New Capabilities

- cbt-exercise-library: Progressive delivery and manual use of the additional offline exercise templates.

### Modified Capabilities

None. Existing cbt-worksheets owns the original manual flows and experiments; llm-assistance owns optional provider behavior.

## Impact

Milestone: P2 follow-up alongside phase 4.1; outside phase 3's completion scope and the first journal MVP.

Dependencies: the original manual cbt-worksheets and action-plan/experiment behavior. No model installation or remote credential is required for manual template use.

Sources: appendix INT-09 (§11); README §§13, 18.8. This is proposed behavior, not an implemented or clinically validated treatment.

Out of scope: diagnoses, clinical effectiveness claims, mandatory reframing, arbitrary model actions, new counter logic, and duplication of the existing experiment store.

Decision gate: review exact template wording and bounded steps (O-012) before delivering this library.
