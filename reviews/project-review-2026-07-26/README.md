# Project review — poetic

**Date:** 2026-07-26 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `700123a` (branch `main`)

Poetic remains in strong and still-improving health going into its fourth full review: every automated check (574 tests, lint, `npm audit`, the whitespace gate, a full build) passed cleanly, CI is confirmed genuinely green rather than just configured to look that way, and a real architectural decomposition (`poem-parser.js` split into three focused, tested modules) landed cleanly since the last review. The single most important thing to act on is that the changelog-bump CI check added after the last review is not actually enforced by branch protection — a version can currently land on `main` without a corresponding `CHANGELOG.md` entry despite the check existing specifically to prevent that (R-01) — closely followed by adding test coverage to `sync-blogger.js`'s untested live-publishing orchestration (R-02), the project's single largest gap between well-factored code and code proven correct.

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, its overall health, headline strengths and risks, and this review's scope and method. |
| [Findings](02-findings.md) | All 27 findings by dimension, each with evidence and impact: 0 critical, 2 high, 7 medium, 18 low. |
| [Recommendations](03-recommendations.md) | 17 prioritised recommendations, each mapped to the finding(s) it addresses. |
| [Improvement prompts](04-improvement-prompts.md) | One ready-to-use AI agent prompt per recommendation, in priority order. |
| [Tech debt register](../../TECH-DEBT.md) | Updated in place: one new entry filed (browser-renderer error classification, per R-14), one recommendation cross-referenced, no items found to have regressed. |

The recommendations in `03-recommendations.md` and the prompts in `04-improvement-prompts.md` feed the implementation pipeline's `tech-debt` source and the `project-remediation` skill.
