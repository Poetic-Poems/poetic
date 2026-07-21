# Project review — poetic

**Date:** 2026-07-21 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `4dfacac` (main, v6.1.1)

Poetic — a Node.js framework for authoring poems in plain text and building them to HTML for
GitHub Pages and Blogger — remains in good and improving health: since the 2026-07-11 review, 93
commits landed a disciplined wave of genuine security fixes (all 13 historical CodeQL alerts
confirmed fixed via the GitHub API), and the build, test (493 passing), lint, and
trailing-whitespace gates all pass cleanly. This review found 47 findings across all 13
dimensions — 0 exploitable security or data issues among them — but one Critical and two High
findings sit in `docs/BUILD.md` and `docs/QUICKSTART-VIM.md`, which describe a superseded
implementation and reference paths that no longer exist; a further High finding is a live
keyboard-accessibility gap in the postscript toggle, and another is that the project's sole
enforced PR-review gate is currently satisfied by the maintainer's own second account rather
than independent review. All are addressed by ready-to-run agent prompts below.

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, overall assessment, headline strengths and risks, and the scope and method of the review. |
| [Findings](02-findings.md) | All findings across thirteen dimensions with evidence and impact. 47 findings: 1 critical, 4 high, 9 medium, 33 low. |
| [Recommendations](03-recommendations.md) | 18 prioritised recommendations, each with current state, intended end state, and approach. |
| [Improvement prompts](04-improvement-prompts.md) | One self-contained, paste-ready AI-agent prompt per recommendation, ordered by priority. |
| [Tech debt register](../../TECH-DEBT.md) | Updated in place: 18 new entries (TD26072101–TD26072118), each cross-referenced to its recommendation in the register's own "Review provenance" table. |
