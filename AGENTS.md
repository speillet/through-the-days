# Through the Days

Read [the specification workflow](docs/specification-workflow.md) before planning or implementing product changes. Read the relevant OpenSpec proposal, delta specs, design, tasks, and [decision register](docs/product-decisions.md) before editing that capability.

## Product context

Through the Days is a personal, offline-first macOS journal. The current repository contains specifications and development tooling; application features are not implemented. The first delivery is the offline journal, followed by reading, CBT, exploration, analytics, and distribution.

All product copy, prompts, fixtures, and repository documentation use English. Preserve user-authored text in its original language. Keep personal records and secrets outside the repository; use synthetic test data.

For any in-app LLM assistant, follow the shared [llm-assistance policy](openspec/changes/add-cbt-companion/specs/llm-assistance/spec.md): compassionate evidence-based challenge, calibrated uncertainty, justified agreement, and self-correction. Empathy does not imply endorsing an unsupported conclusion.

## Specifications

[README.md](README.md) is the concise user-facing overview. [README_THROUGH_THE_DAYS.md](README_THROUGH_THE_DAYS.md) and its linked technical design, roadmap, and acceptance documents are the detailed product requirements, including the assessed appendix additions. Explicit user decisions recorded in [product-decisions.md](docs/product-decisions.md) refine it. Changes under openspec/changes/ describe proposed behavior; openspec/specs/ records delivered behavior after verification and archive. A valid specification is not evidence that its feature works.

Use OpenSpec's spec-driven schema. Each requirement needs a SHALL statement and observable WHEN/THEN scenarios. Use the CLI to scaffold changes. Resolve relevant open product decisions with the user before implementing them; record engineering proposals as proposals until checked.

For interviews, use Matt Pocock's grill-me/grilling or grill-with-docs: inspect facts first, ask independent decisions together, then revisit dependent questions. Read [GLOSSARY.md](GLOSSARY.md) when discussing domain language. Record durable trade-offs in docs/adr/ and keep glossary definitions free of implementation details.

## Validation

Run npm ci after checkout and npm run spec:validate after changing specifications. Use npm run openspec -- <arguments> for the project's pinned CLI; this disables its telemetry. Follow [acceptance coverage](docs/acceptance-coverage.md) when selecting implementation tests.

Keep unfinished tasks unchecked. Archive changes only after their behavior and tests are delivered. During a specification task, capture requirements and planning artifacts; begin application implementation when the user requests it.

Before finalizing every pull request, complete the [PR specification reconciliation checklist](docs/specification-workflow.md#pull-request-completion). Update affected specs in the same PR before merge, reflecting the final diff and verification evidence. Planning-only PRs update proposals without claiming delivered product behavior.
