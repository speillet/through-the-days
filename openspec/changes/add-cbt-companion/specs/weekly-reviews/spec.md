# weekly-reviews

## MODIFIED Requirements

### Requirement: Distinct reviewed evidence

The review SHALL count approved canonical wins, reported actions and started/completed exercises separately, preserve explicit experiment outcomes, and link each highlight to its dated source. These additions SHALL reuse the existing week boundaries, source permissions and freshness rules.

#### Scenario: Exercises not delivered

- **WHEN** the person opens a review before CBT exercises are available
- **THEN** the app states that exercises are unavailable and not counted rather than displaying zero as an observed result.

#### Scenario: Separate exercise counts

- **WHEN** a week contains two started worksheets of which one is completed, one reported action and one approved win
- **THEN** the review shows those four measures separately without counting an authored review as a worksheet or an entry.

#### Scenario: Not yet is unknown progress

- **WHEN** an experiment is marked Not yet or has no follow-up
- **THEN** the review preserves that status without a failure score or treating a missing outcome as unsuccessful.

#### Scenario: No duplicate wins

- **WHEN** one canonical win links to an entry's pride reflection
- **THEN** the weekly count includes one win, not the reflection plus a duplicate item.

#### Scenario: Exercise source removed

- **WHEN** a worksheet or experiment is deleted or excluded from insight use
- **THEN** it disappears from weekly evidence and generated material is invalidated while authored weekly notes remain unchanged.
