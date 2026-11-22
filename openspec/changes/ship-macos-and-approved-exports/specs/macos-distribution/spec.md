# macos-distribution

## Purpose

Verify a distributable Mac application against an explicit support matrix before claiming readiness for wider use.

Sources: README_THROUGH_THE_DAYS.md §§3, 10, 13 phase 6; D-001 and D-005.

## ADDED Requirements

### Requirement: Verified Mac artifacts

The project SHALL provide a launchable macOS app and a disk-image distribution artifact for the selected support matrix, verifying operation outside the development environment.

#### Scenario: Release installation

- **WHEN** a release artifact is installed on a supported clean Mac environment
- **THEN** the app launches and its offline journal data survives a normal restart.

### Requirement: Explicit supported platforms

A release SHALL document its minimum macOS version, verified processor architectures, and required signing/notarisation/distribution conditions.

#### Scenario: Unverified architecture

- **WHEN** an architecture has not passed release verification
- **THEN** release documentation does not claim that architecture as supported.

### Requirement: Private release verification

Release verification SHALL use synthetic data and SHALL confirm that application resources and release artifacts exclude personal journals, backups, exports, and secrets.

#### Scenario: Packaged resource inspection

- **WHEN** the release resources are inspected
- **THEN** they contain no private user database or configured credential.
