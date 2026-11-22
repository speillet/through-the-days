# Planning development with OpenSpec

OpenSpec turns the product brief into reviewable changes containing behavior, design, and implementation tasks. Matt Pocock's interview and domain-modeling skills help resolve decisions before they become code.

## Current state

The application is not implemented. Eight draft changes capture the README roadmap. Their requirements use SHALL statements and concrete scenarios. The first change includes additional decisions confirmed on 22 November 2026.

The empty openspec/specs/ directory is intentional: no product behavior has been delivered yet. Proposed requirements live in openspec/changes/. Syntax validation checks document structure; it does not approve product choices or prove application correctness.

## Where to read

| Question | Document |
|---|---|
| What is the full product vision? | [Consolidated requirements](../README.md) |
| What did the user decide, and what remains open? | [Decision register](product-decisions.md) |
| What does a domain term mean? | [Glossary](../GLOSSARY.md) |
| Why was an enduring trade-off made? | [Architecture decisions](adr/) |
| Which acceptance case belongs to which milestone? | [Acceptance coverage](acceptance-coverage.md) |
| What should a change do and how will it be delivered? | Its proposal.md, specs/, design.md, and tasks.md |

Explicit later user decisions refine the original brief. Update the affected requirement and its coverage when a decision changes. Keep each requirement owned by one capability; link to shared requirements rather than duplicating them.

## Delivery order

| Order | Change | Scope |
|---|---|---|
| 1 | [build-offline-journal](../openspec/changes/build-offline-journal/proposal.md) | Phases 0–1: writing, check-in, durable storage, trash, backup and restore before real use |
| 2 | [add-journal-reading](../openspec/changes/add-journal-reading/proposal.md) | Phase 2: calendar, book, timeline, local search, Weekly Review and The Path So Far |
| 3 | [add-cbt-companion](../openspec/changes/add-cbt-companion/proposal.md) | Phase 3: manual worksheets and experiments, then optional AI; extended templates are P2 |
| 4 | [add-personal-exploration](../openspec/changes/add-personal-exploration/proposal.md) | Phase 4: tags, keyword statistics, independent goals |
| 4.1a | [add-source-backed-insights](../openspec/changes/add-source-backed-insights/proposal.md) | P2: Looking Back, Ask My Journal, descriptive Personal Patterns |
| 4.1b | [expand-cbt-exercise-library](../openspec/changes/expand-cbt-exercise-library/proposal.md) | P2: additional offline templates, independently archived from phase 3 |
| 5 | [add-chatgpt-analytics](../openspec/changes/add-chatgpt-analytics/proposal.md) | Phase 5: manual import and auditable analytics |
| 6 | [ship-macos-and-approved-exports](../openspec/changes/ship-macos-and-approved-exports/proposal.md) | Phase 6: wider distribution, private portability and separately approved Hugo aggregates |

Backup and restore have been advanced from phase 6 by the user's explicit decision. Initial personal launch remains in milestone 1; wider distribution remains later. Later changes are planning drafts, and their detailed choices are reopened when that milestone is approached.

The [appendix integration assessment](appendix-integration.md) records what is new, reused, deferred, or rejected. The original appendix is a historical proposal; this workflow and the canonical README use the consolidated behavior. Proposed SQL is conceptual, not executable migration code.

## Working loop

~~~mermaid
flowchart LR
  A[Read brief and relevant specs] --> B[Inspect facts]
  B --> C[Interview unresolved decisions]
  C --> D[Update proposal, specs and design]
  D --> E[Validate and slice tasks]
  E --> F[Implement requested change and test]
  F --> G[Verify behavior and archive]
~~~

1. Read the relevant change, glossary, decision register, and ADRs.
2. Use grill-me to ask only genuine product decisions. Research facts in the repository or official documentation first. Use grill-with-docs and domain-modeling to capture terminology and durable decisions.
3. Keep user decisions, engineering proposals, and future questions visibly distinct. A change can be structurally valid while still containing open decisions.
4. Break implementation into observable vertical slices. Use the existing tasks as a draft; refine the next slice using to-tickets and codebase-design when implementation is requested.
5. Test through the public behavior of each module. Use tdd for meaningful implementation changes; persistence tests use real temporary SQLite databases and synthetic content.
6. Verify the implemented scenarios before archiving. Unchecked tasks and unresolved decisions remain visible.

## Commands

Install a supported Node.js version, then use the lockfile:

~~~sh
npm ci
npm run spec:list
npm run spec:validate
npm run openspec -- status --change build-offline-journal --json
npm run openspec -- instructions specs --change build-offline-journal --json
npm run openspec -- new change describe-the-next-change --schema spec-driven
~~~

The project pins OpenSpec 2.1.1. Prefer these npm commands over a separately installed global openspec binary. Pull requests and main pushes run the same strict validation in .github/workflows/specs.yml. CLI metadata is scaffolded with openspec new change; generated Codex skills live in .agents/skills/.

## Skills and external tools

Context7 supplies current technical documentation. The existing grill-me delegates to grilling. Additional skills installed from mattpocock/skills are grill-with-docs, domain-modeling, writing-for-agents, codebase-design, tdd, and to-tickets. Their pinned source is recorded in [the skills inventory](development-skills.json).

OpenSpec artifacts are the local planning record for this setup. Creating GitHub issues, comments, pull requests, labels, or published pages is a separate action requested by the user. The GitHub remote alone does not choose an issue-tracker workflow.

## Sources

- [OpenSpec CLI reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md)
- [OpenSpec spec-driven schema](https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml)
- [Matt Pocock skills](https://github.com/mattpocock/skills)
