# Summary

## What this project is

`poetic` is a Node.js framework (not itself a poem collection) for authoring poems in a plain-text `.poem` format, converting them to YAML, and rendering them to static HTML via a Pug template for publication on GitHub Pages — with optional syndication to Blogger. It is consumed by sibling "consumer" repositories via `scripts/sync-framework.sh` and a `.poetic-version` pin, so changes here ripple outward to every poem collection built on it.

It is maintained by a single person (two GitHub handles, one person, by explicit design — `CODEOWNERS`/`AGENTS.md`), is MIT-licensed for the code (with a separate, clearly-scoped CC BY-NC-ND default for poem *content* in `LICENCE-POEMS.md`), and is not published to npm (`private: true`). At this revision (`c0f8460`, v6.5.0) it comprises 314 tracked files: 85 JavaScript files (~11k lines of framework code in `src/tools/`), 48 test files, 10 reference docs, a Vim syntax plugin, and 8 GitHub Actions workflows. It has 4 direct production dependencies and is built, tested, linted, licence-checked, and whitespace-checked on every pull request.

## Overall assessment

This is a mature, carefully engineered, single-maintainer project in excellent health, continuing the trajectory the 2026-09-21 review found: every one of that review's 13 recommendations has since landed, cleanly, with no regressions. Every automated gate this review ran on a fresh clone — 827/831 tests (4 environmental skips), lint, trailing-whitespace, licence-allowlist, and the build itself — passed without intervention. The deep review across all thirteen checklist dimensions found zero Critical findings and exactly one High finding, and that one is not a code defect: it is a known, high-severity `markdown-it` dependency advisory whose fix is *already* sitting in an open, unconflicted Dependabot pull request, blocked only by a stale CI base that an unrelated, already-merged fix resolves on rebase. Security, data handling, operations, and governance are all sound on direct inspection — real secrets-handling discipline (atomic mode-0600 writes, on-disk permission checks, nothing in logs), real outbound-call timeout/retry discipline, and a self-auditing CI/governance setup (a daily ruleset-drift detector that found zero drift this review) — not merely clean by the absence of anyone looking.

The six Medium findings are all small, well-scoped documentation and UX gaps of exactly the kind this project has a strong track record of closing quickly: a YAML-schema doc missing a real-but-undocumented `$ref` shape (mirroring a gap the prior review already fixed once for a different field), a stale example-output file whose doc pointer disagrees with the code it describes, a dev-server crash that surfaces a raw stack trace instead of a clear instruction on a port collision, and new CI-gating shell logic (the changelog-assembly grammar, added since the last review) that shipped without its own test coverage. None of these threaten the project's core function; all are Small-to-Medium effort.

The single most important thing to act on is R-01: rebase and merge the already-open Dependabot PR #291, which clears the one High-severity finding with essentially no new work — the fix is written, the PR exists, it just needs a rebase onto `main`'s latest commit and the maintainer's routine review.

## Headline strengths

- Every automated check (tests, lint, coverage, licence allow-list, whitespace, build) passes cleanly from a fresh clone, confirmed by actually running them, not inherited from a prior review.
- Security and data-handling discipline is genuine and specific, not generic: a symlink-aware path-traversal guard with its own documented threat model, atomic mode-0600 credential writes with an active on-disk permission check, zero secrets found anywhere in the repository or its fixtures, and zero open CodeQL alerts.
- The dependency surface is small (4 direct production dependencies), justified, and actively tended — the one open advisory already has a merged-ready fix in flight, and the licence allow-list has itself been patched against real breakage with a documented rationale.
- CI and governance are self-auditing: a daily ruleset-drift detector (added since the last review) independently confirmed, against GitHub's own live API, that the documented branch-protection model matches reality.
- Issue/PR hygiene is excellent — zero open issues, no stale human-authored PRs, and every one of the prior review's 13 recommendations closed cleanly in the time since.

## Headline risks

- A high-severity `markdown-it` ReDoS advisory is live on `main`, directly applicable to this project's own `html: true` renderer configuration, with its fix sitting unmerged in CI-red limbo for a reason unrelated to the fix itself [F-SEC-01, F-DEPS-01].
- Two documentation artefacts (a YAML-schema reference and a cited example-output file) have quietly drifted from what the code actually emits, in the same way a now-fixed prior-review finding did [F-DOC-01, F-DOC-02].
- The newest CI-gating logic — the changelog grammar/assembly scripts that back a required check and the release process itself — shipped with zero automated test coverage, unlike almost everything else in this codebase [F-TEST-01].
- A dev-server port collision surfaces as a raw, undecipherable stack trace rather than a clear instruction, on the exact command (`npm start`) a brand-new user runs first [F-UX-01].

## Scope and method

This review examined revision `c0f8460` of `Poetic-Poems/poetic` on a fresh clone. Reconnaissance (manifests, CI workflows, top-level docs, directory structure, size) was exhaustive. The thirteen checklist dimensions were split across five parallel review passes (this lead agent handled Security and Dependencies directly; four subagents each covered 2-4 of the remaining dimensions), each given the project map and the relevant checklist section, and consolidated by the lead agent.

Depth was near-exhaustive on the core framework: every file in `src/tools/`, `src/templates/`, and `src/browser/` was read in full by at least one dimension pass, with particular attention to `poem-parser.js`, `yaml-to-poem.js`, `path-guard.js`, `markdown.js`, `serve-static.js`, `sync-blogger.js`, and `blogger-auth.js`. All 8 GitHub Actions workflows, all 10 `docs/*.md` files, and every root-level doc (README, AGENTS.md, SECURITY.md, CONTRIBUTING.md, LICENCE, LICENCE-POEMS.md) were read in full. `scripts/*.sh` and `test/` were sampled rather than read exhaustively, weighted toward the newest (changelog grammar/assembly) and most security-relevant (`path-guard`, credential handling) files.

Automated tools actually run, with real output recorded in the findings: `npm ci`, `npm test` (node's built-in test runner), `npm run coverage` (c8), `npm run lint` (eslint), `npm run check` (trailing whitespace), `npm run check:licenses`, `npm run build` + `npm run check:build`, `npm audit`, `npx madge --circular`, and `gh` queries against the live repository (issues, PRs, CI run logs, the branch-protection ruleset, CodeQL alert history). `npm run a11y` (axe-core via puppeteer-core) was run but could not produce real browser output in this sandbox — no installable Chromium and outbound HTTP returns 403 — the tool detected this correctly and exited 0 with its documented message; this is an unchanged limitation from the 2026-09-21 review, not a new gap.

This review builds directly on the 2026-09-21 review (revision `bca1bbe`): that review's 13 recommendations were checked against the current code rather than re-investigated from scratch, and all were confirmed landed. The 40 commits since then were read in full (`git log --oneline bca1bbe..HEAD`) to scope what, specifically, was new to examine this cycle.
