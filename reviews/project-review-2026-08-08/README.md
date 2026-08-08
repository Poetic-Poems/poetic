# Project review — poetic

**Date:** 2026-08-08 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `e47f6ee98dfb4ce62195ab338ac192488d075003`

Poetic remains in strong health going into its sixth full review: every automated gate re-ran clean from a fresh `npm ci` (703 tests, 0 failures, 85.36% coverage against an 80% floor; lint, audit, licences, whitespace, and tech-debt-register checks all clean), and five of the last review's own findings — a security fix, a dead-code bug, a stale register entry, a test-coverage gap, and a WCAG AA contrast defect — were independently re-confirmed resolved rather than taken on trust. The single most important thing to act on is a genuine, narrowly-scoped security defect: `blogger-auth.js`'s OAuth loopback server reflects an unescaped error parameter into its HTML response and skips its CSRF check on that one branch, while the parallel success branch already gets it right (R-01). Beyond that, this review found no Critical or High findings — eight Medium and sixteen Low findings, several of them recurring gaps from prior reviews (the README round-trip example, missing human-facing contributing docs, a `serve-static.js` architecture recommendation now open across three reviews) alongside genuinely new ones (a second flaky test file the last fix didn't reach, an untested `sync-blogger.js` publish path, inconsistent CLI `--help` handling, and three related gaps in the poem `$ref` caching subsystem).

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, its overall health, headline strengths and risks, and this review's scope and method. |
| [Findings](02-findings.md) | All findings by dimension: 24 findings — 0 critical, 0 high, 8 medium, 16 low — plus 4 informational notes (deliberate design decisions or confirmed-resolved items). |
| [Recommendations](03-recommendations.md) | 15 prioritised recommendations, each naming the findings it addresses and its own tech-debt register item. |
| [Improvement prompts](04-improvement-prompts.md) | One self-contained, ready-to-paste AI agent prompt per recommendation, in priority order. |
| [Tech debt register](../../TECH-DEBT.md) | Updated in place (per-item format under [`tech-debt/`](../../tech-debt/)): 14 new items filed (`TD-PPpoet-26080802` through `-26080815`), each cross-referencing this review's recommendation and finding IDs; the pre-existing open item `TD-PPpoet-26080801` (filed the same day by another agent) independently re-verified as accurate and mapped to R-07 rather than duplicated. |

The recommendations in `03-recommendations.md` and their filed tech-debt items feed the implementation pipeline's `tech-debt` source and the `project-remediation` skill; each newly-filed item's `review:` frontmatter line cross-references its recommendation (`R-NN`) and finding IDs (`F-<CODE>-NN`) so the pipeline can recognise it as already-scoped work rather than re-investigating the recommendation from scratch.
