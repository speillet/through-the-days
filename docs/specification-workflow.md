# Planning development with OpenSpec

OpenSpec turns the product brief into reviewable changes containing behavior, design, and implementation tasks. Matt Pocock's interview and domain-modeling skills help resolve decisions before they become code.

## Current state

The offline journal (milestone 1) and reading/review features (milestone 2) have application code and passing automated checks in the development branch. Both OpenSpec changes remain active: incomplete acceptance work is unchecked and neither is archived. The milestone-1 PR synchronises four verified entry/check-in/editor/persistence capabilities; the reading deltas remain active. See [development status](development-status.md) for the current worktree, results and remaining work. Milestone 1 is merged into main through [PR #4](https://github.com/speillet/through-the-days/pull/4).

Checks that need a person at a Mac are tracked in the confirm-native-macos-checks verification checklist: a VoiceOver pass, keyboard navigation with real keys, full screen, native dialogs and Keychain prompts, a launch with networking off, and an exFAT backup drive. This checklist does not discharge the original milestones' acceptance tasks. Six further product changes capture later work in the [product roadmap](roadmap.md).

openspec/specs/ describes only delivered, verified behavior; proposed requirements live in openspec/changes/. Syntax validation checks document structure; it does not approve product choices or prove application correctness.

## Where to read

| Question | Document |
|---|---|
| What does the app do and how will someone use it? | [User overview](../README.md) |
| What are the detailed feature and UX requirements? | [Product reference](../README_THROUGH_THE_DAYS.md) |
| What are the architecture and data contracts? | [Technical design](technical-design.md) |
| What comes first and who owns each capability? | [Roadmap](roadmap.md) |
| What did the user decide, and what remains open? | [Decision register](product-decisions.md) |
| What does a domain term mean? | [Glossary](../GLOSSARY.md) |
| Why was an enduring trade-off made? | [Architecture decisions](adr/) |
| Which acceptance case belongs to which milestone? | [Acceptance coverage](acceptance-coverage.md) |
| What should a change do and how will it be delivered? | Its proposal.md, specs/, design.md, and tasks.md |

Explicit later user decisions refine the original brief. Update the affected requirement and its coverage when a decision changes. Keep each requirement owned by one capability; link to shared requirements rather than duplicating them.

## Delivery order

The [roadmap](roadmap.md) owns the ordered phases and their OpenSpec change mapping, including the first-use backup requirement and deferred P2 work.

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

## Pull request completion

Specification reconciliation is part of every PR's definition of done, performed after the final implementation/review edits and before merge. Review the final diff against requirements, scenarios, decisions, and acceptance coverage; include the updates in that PR rather than leaving a separate documentation follow-up.

1. **Match actual scope:** update affected proposal/spec/design/task artifacts, changed acceptance scenarios, and material README/decision text. Describe the resulting behavior and known limits, including choices changed during review.
2. **Synchronise delivered behavior:** for an implemented change, reconcile only verified delivered deltas into openspec/specs/ using openspec-sync-specs; archive a fully completed change using openspec-archive-change. Mark tasks complete only with actual evidence. Split partially delivered scope into coherent changes when needed so unfinished requirements are neither advertised as delivered nor silently archived.
3. **Keep planning distinct:** a planning-only PR updates its draft artifacts and relevant brief, leaving unimplemented product tasks unchecked. It does not sync proposed features into delivered main specs or archive them merely because the documents validate.
4. **Handle unchanged behavior explicitly:** if tooling or editorial changes leave product behavior unchanged, explain in the PR why no product requirement changes; review and keep the applicable workflow/docs current rather than making a cosmetic spec edit.
5. **Validate and report:** run npm run spec:validate and npm run openspec -- validate --archived --no-interactive, plus the checks appropriate to the delivered work. List affected capabilities/spec paths, sync/archive status or the no-impact reason, commands/results, and remaining scope in the PR's Specifications section.

The PR template prompts this review. CI checks strict OpenSpec structure and rejects archived changes with unfinished tasks; those checks do not establish semantic agreement between code and prose. The author and reviewer must still compare the final behavior to the specs before merging. A GitHub PR merge is not itself an OpenSpec product-change archive.

## Commands

Application checks (Rust needs rustup; the pinned toolchain installs itself):

~~~sh
npm ci
npm run check          # TypeScript
npm test               # component, state and guard tests (Vitest)
npm run test:e2e       # WebKit and Chromium end-to-end tests with synthetic data
npm run test:rust      # journal-core and native shell tests
npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app
npm run smoke:native   # drives the debug app natively with a throwaway data folder
~~~

Development builds keep their data in a separate com.throughthedays.app.dev folder; the smoke check uses a temporary folder. Never point a development build at a real journal.

Install a supported Node.js version, then use the lockfile for the specification tooling:

~~~sh
npm ci
npm run spec:list
npm run spec:validate
npm run openspec -- status --change build-offline-journal --json
npm run openspec -- instructions specs --change build-offline-journal --json
npm run openspec -- new change describe-the-next-change --schema spec-driven
~~~

The project pins OpenSpec 2.1.1. Prefer these npm commands over a separately installed global openspec binary. Pull requests and main pushes run strict structure validation and archived-task completion checks in .github/workflows/specs.yml. CLI metadata is scaffolded with openspec new change; generated Codex skills live in .agents/skills/.

## Skills and external tools

Context7 supplies current technical documentation. The existing grill-me delegates to grilling. Additional skills installed from mattpocock/skills are grill-with-docs, domain-modeling, writing-for-agents, codebase-design, tdd, and to-tickets. Their pinned source is recorded in [the skills inventory](development-skills.json).

OpenSpec artifacts are the local planning record for this setup. Creating GitHub issues, comments, pull requests, labels, or published pages is a separate action requested by the user. The GitHub remote alone does not choose an issue-tracker workflow.

## Sources

- [OpenSpec CLI reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md)
- [OpenSpec spec-driven schema](https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml)
- [Matt Pocock skills](https://github.com/mattpocock/skills)
