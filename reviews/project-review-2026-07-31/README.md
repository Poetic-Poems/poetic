# Project review — poetic

**Date:** 2026-07-31 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `38ae8c8` (branch `main`)

Poetic remains in strong health going into its fifth full review: every automated check re-run from scratch this session — 672 tests, lint, `npm audit`, the whitespace and licence-compatibility gates, the tech-debt register's own consistency checker, and a full build — passed cleanly, and several of the last review's findings (a complexity hot-spot, an inline-`onclick` template violation, path-containment gaps) are confirmed genuinely resolved rather than taken on trust. The single most important thing to act on is process rather than product: `TECH-DEBT.md`'s own register had drifted from reality — an item marked `open` for a branch-protection fix that GitHub's live ruleset shows was actually applied three days earlier (R-01/F-CI-01) — which this review corrects directly, alongside a smaller but real dead-code bug in `yaml-to-poem.js --all` (R-02) and a WCAG AA contrast regression-of-omission in `.back-to-top` (R-06).

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, its overall health, headline strengths and risks, and this review's scope and method. |
| [Findings](02-findings.md) | All 20 rated findings by dimension, each with evidence and impact: 0 critical, 1 high, 8 medium, 11 low (plus one informational note on a sandbox limitation). |
| [Recommendations](03-recommendations.md) | 13 prioritised recommendations, each mapped to the finding(s) it addresses. |
| [Improvement prompts](04-improvement-prompts.md) | One ready-to-use AI agent prompt per recommendation, in priority order. |
| [Tech debt register](../../TECH-DEBT.md) | Updated in place: `TD26072604` flipped to resolved (the register itself was found stale against live GitHub state), one new item filed (`TD26080101`, the residual drift-detection gap), one recommendation cross-referenced. |

The recommendations in `03-recommendations.md` and the prompts in `04-improvement-prompts.md` feed the implementation pipeline's `tech-debt` source and the `project-remediation` skill.
