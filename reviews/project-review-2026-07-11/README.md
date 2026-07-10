# Project review — poetic

**Date:** 2026-07-11 · **Reviewer:** Claude (project-review skill) · **Revision reviewed:** `55863e5` (main, v5.1.0 + 2 commits)

Poetic — a Node.js framework for authoring poems in plain text and publishing them to GitHub
Pages and Blogger — is in good health and improving: since its review four days ago the
dependency vulnerabilities, test hermeticity, and working-directory issues have all been
fixed, and the engineering discipline (292 fast tests, clean audit, exemplary docs and
changelog) is well above what a solo project usually manages. The review found nothing
Critical, but two High findings demand action: the project has **no licence** (so consumers
have no legal right to the copying its whole model depends on), and the author's own site
name **"Fragments & Unity" is hard-coded** into pages every consumer generates. Both are
small fixes; ready-to-run agent prompts are provided for them and eleven further improvements.

## Contents

| Document | What it contains |
|---|---|
| [Summary](01-summary.md) | What the project is, overall assessment, headline strengths and risks, and the scope and method of the review. |
| [Findings](02-findings.md) | All findings across thirteen dimensions with evidence and impact. 30 findings: 0 critical, 2 high, 6 medium, 22 low. |
| [Recommendations](03-recommendations.md) | 13 prioritised recommendations, each with current state, intended end state, and approach. |
| [Improvement prompts](04-improvement-prompts.md) | One self-contained, paste-ready AI-agent prompt per recommendation, with ordering dependencies noted. |
| [Tech debt register](../TECH-DEBT.md) | Updated in place: eight new entries (TD26071101–TD26071108) in the register's own format, cross-referenced to findings and recommendations. |
