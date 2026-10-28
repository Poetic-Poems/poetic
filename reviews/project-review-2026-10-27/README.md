# Project review — poetic

**Date:** 2026-10-27 · **Reviewer:** the project-review skill · **Revision reviewed:** `c0f8460` (main)

`poetic` is a mature, carefully engineered, single-maintainer Node.js framework for authoring and publishing plain-text poems. Every automated gate this review ran — tests, lint, coverage, licence check, whitespace check, and the build itself — passed cleanly from a fresh clone, and the deep review across all thirteen checklist dimensions found zero Critical findings and exactly one High finding, which is not a code defect: a high-severity `markdown-it` dependency advisory whose fix is already sitting in an open, unconflicted Dependabot pull request, blocked only by a stale CI base an unrelated, already-merged fix resolves on rebase. The single most important thing to act on is rebasing and merging that pull request.

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, its overall health, headline strengths and risks, and this review's scope and method. |
| [Findings](02-findings.md) | All 27 findings across 13 dimensions, each with evidence and impact: 0 critical, 1 high, 6 medium, 15 low, 5 informational. |
| [Recommendations](03-recommendations.md) | 10 prioritised recommendations (R-01 to R-10), each naming the findings it addresses, its effort estimate, and its intended end state. |
| [Improvement prompts](04-improvement-prompts.md) | One self-contained AI-agent prompt per recommendation, ready to paste into a fresh session. |
| [Tech debt filed](https://github.com/Poetic-Poems/poetic/issues?q=is%3Aissue+label%3Apw%3A%3Atype%3Atech-debt+%22reviews%2Fproject-review-2026-10-27%22) | 10 new issues filed (#297–#306), one per recommendation, each cross-referencing its `R-NN` here. No existing tech-debt register item was found already resolved by this review. |

Twelve findings (F-ARCH-01/02/03/04, F-CODE-01/02/03, F-TEST-02, F-PERF-01/02, F-GOV-01/02, F-OPS-01, F-DATA-01) were judged, on consolidation, as not warranting a dedicated recommendation at the project's current scale — each is recorded in `02-findings.md` as a watch item rather than tracked work nobody intends to do, consistent with the previous review cycle's practice.
