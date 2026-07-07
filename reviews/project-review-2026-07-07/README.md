# Project review

This review assesses the Poetic framework repository as a maintainable, publishable authoring tool for poems and static sites. The repository is in good health overall: its build pipeline is coherent, its documentation is strong, and its automated tests are passing. The most significant issues are around test hermeticity, dependency hygiene, and making the build path a little less dependent on the current working directory.

## Documents

- [01-summary.md](01-summary.md) — High-level summary, health assessment, strengths, risks, and review scope.
- [02-findings.md](02-findings.md) — Evidence-based findings grouped by dimension, each with severity and impact.
- [03-recommendations.md](03-recommendations.md) — Prioritised recommendations with effort and affected findings.
- [04-improvement-prompts.md](04-improvement-prompts.md) — Ready-to-paste AI agent prompts for implementing each recommendation.
- [TECH-DEBT.md](../TECH-DEBT.md) — Updated in place with the new review finding about hermetic tests.
