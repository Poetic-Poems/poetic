# Project review — poetic

**Date:** 2026-09-21 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `bca1bbe` (main)

`poetic` is a mature, well-run, single-maintainer Node.js framework for
authoring and publishing plain-text poems. Every automated gate this review
ran — tests, lint, whitespace, license check, and the build itself — passed
cleanly from a fresh clone, and the deep review across all thirteen
checklist dimensions found **no Critical or High findings**: security,
data-handling, and dependency management are all sound on direct
inspection, not just clean by omission. The one thing most worth acting on
is a small, cheap documentation gap — the YAML schema doc omits a field the
converter actually emits ([F-DOC-01](02-findings.md#f-doc-01--docsyaml-schemamd-omits-the-parts-mixed-segment-field--medium))
— alongside two other Medium findings (missing line numbers in parse
errors, some duplicated parsing logic) that are similarly small and
well-scoped.

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, its overall health, headline strengths and risks, and this review's scope and method. |
| [Findings](02-findings.md) | All 22 findings across 13 dimensions, each with evidence and impact: 0 critical, 0 high, 3 medium, 13 low, 6 informational. |
| [Recommendations](03-recommendations.md) | 13 prioritised recommendations (R-01 to R-13), each naming the findings it addresses, its effort estimate, and its intended end state. |
| [Improvement prompts](04-improvement-prompts.md) | One self-contained AI-agent prompt per recommendation, ready to paste into a fresh session. |
| [Tech debt filed](https://github.com/Poetic-Poems/poetic/issues?q=is%3Aissue+label%3Apw%3A%3Atype%3Atech-debt+%22reviews%2Fproject-review-2026-09-21%22) | 13 new issues filed (#226–#238), one per recommendation, each cross-referencing its `R-NN` here. No existing tech-debt register item was found already resolved by this review. |

Every recommendation in this cycle addresses only Medium/Low findings — there
was nothing Critical or High to cover. Findings judged as not warranting a
recommendation at the project's current scale (F-CODE-03 and several
Informational-severity items) are recorded in the findings document for
transparency but were deliberately not filed as issues, to avoid tracking
work nobody intends to do.
