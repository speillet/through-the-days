# Tasks for source-backed insights

Status: P2 draft; all implementation work is pending. Resolve decision gates before dependent work, preserving the first offline journal's smaller scope.

## 1. Source-scoped retrieval

- [ ] 1.1 Specify offset/normalisation, source-revision checks, query bounds, and minimum-evidence behavior; verify the documented contract against synthetic exact, multilingual, and unsupported-source examples.
- [ ] 1.2 Extend the existing local search interface with dated verified snippets and coverage, not a separate index authority; verify correct source navigation, absent-evidence fallback, and no hidden or trashed source retrieval.
- [ ] 1.3 Add explicitly pinned local memories; verify title editing/removal, source-change invalidation, individual interpretation rejection/hiding, and deletion of a card without changing its original journal. Include retrieval slice tests and documentation.

## 2. Read-only questions

- [ ] 2.1 Build Ask My Journal over that verified result set with scope, dated evidence, coverage, limitations, and version metadata; verify no unsupported quote/date/source is accepted and review summaries do not inflate observation counts.
- [ ] 2.2 Reuse the existing optional model boundary; verify English output, prompt-injection isolation, per-request remote consent, metadata-only default retention, and local fallback on cancellation or provider failure.
- [ ] 2.3 Invalidate saved answers after source changes and remove excluded/deleted derived excerpts; verify journal text, scores, goals, wins, and authored review notes remain unchanged. Include question slice tests and documentation.

## 3. Descriptive personal patterns

- [ ] 3.1 Reuse canonical score/action/keyword/goal calculations with explicit ranges, sample sizes, confounding, and method versions; verify unequal writing volumes, missing outcomes, sparse data, and no causal/diagnostic claims.
- [ ] 3.2 Add optional local semantic retrieval only after deterministic retrieval works; verify derivative-only storage, per-source visibility, versioned rescanning, and independent removal of private embeddings.
- [ ] 3.3 Verify the combined views honor Gentle view and hidden counters/metrics and cannot produce a write or external action from a journal instruction. Record integration evidence after each slice's own tests and documentation.

## Workflow follow-up

- Archive after the implemented scope and verified scenarios match this proposal.
- Revisit any additional imported-source or model support as explicit later work.
