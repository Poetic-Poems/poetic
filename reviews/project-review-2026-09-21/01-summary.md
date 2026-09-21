# Summary

## What this project is

`poetic` is a Node.js framework for authoring poems in a plain-text `.poem`
format, converting them to a YAML intermediate representation, and rendering
them to HTML via Pug for publishing to GitHub Pages and/or Blogger. It is the
**framework repo**: a handful of consumer repositories (each an individual
poet's own poem collection) pull framework files from it via
`scripts/sync-framework.sh` and never have their poem content touched by a
sync. The stack is Node.js ≥22 (CommonJS), with four direct production
dependencies (`pug`, `js-yaml`, `markdown-it`, `js-beautify`) and no database
or network service beyond an optional Blogger-publishing integration that
uses Google OAuth. At version 6.4.0, ~10,500 lines of hand-written source
across 35 files in `src/tools/`, backed by 63 test files and 814 tests, it is
a mature, actively maintained solo-maintainer project — 19 commits in the
last 30 days, mostly the maintainer's own feature/fix work plus a steady
stream of Dependabot version bumps.

## Overall assessment

This is a well-run project. Every automated gate this review could run —
`npm ci`, `npm audit`, ESLint, the trailing-whitespace check, the full test
suite with coverage, the license-compatibility check, and the build itself —
passed cleanly from a fresh clone, with no local intervention needed. Five
parallel dimension reviews covering all thirteen checklist dimensions
(architecture, code quality, security, data handling, dependencies, testing,
CI/CD, tooling, performance, usability/accessibility, documentation,
governance, and operations) returned **zero Critical or High findings**, and
the security-focused review in particular found a genuinely sound OAuth
implementation (CSRF-state validation, PKCE, atomic 0600 credential writes,
consistent outbound-fetch timeouts) rather than the more common story of "no
findings because nobody looked hard." The three Medium findings are all
narrow, concrete, and cheap to fix: an undocumented YAML field shape, poem
parse errors that omit a line number, and a small amount of duplicated
parsing logic in the poem parser. Several findings flagged in the prior
review cycle (2026-08-08) — a test-flakiness pattern, a missing
release-rollback doc, a README contributing-checklist gap — are confirmed
resolved in this pass, which is a good sign of the review-to-fix loop
actually closing.

The project's known structural risk — a single maintainer who is also the
required PR reviewer under two GitHub handles, with no succession plan — is
not new information; it is disclosed candidly and consistently in both
`SECURITY.md` and `AGENTS.md`, and this review's job was to check that
disclosure is honest and consistently reflected elsewhere, which it is. No
dimension review manufactured criticism to balance the otherwise clean
result; where a dimension had genuinely nothing to report (SEC, DATA, DEPS),
it says so plainly.

## Headline strengths

- A security-sensitive OAuth/credential-handling surface (`blogger-auth.js`,
  `sync-blogger.js`) that is actually sound on inspection: CSRF state
  checked on every callback branch, PKCE, atomic mode-0600 credential
  writes, and a 30-second timeout with no-retry-on-non-idempotent-calls
  policy applied to every outbound fetch without exception.
- A genuinely tested `.poem` ↔ YAML seam and a genuinely filesystem-free
  browser renderer — both architectural invariants the codebase claims and
  that this review independently verified hold, rather than taking on
  trust.
- A real incremental-build cache (`needs-rebuild.js`) with correct
  add/remove detection via a sidecar manifest, well ahead of what a project
  at this scale strictly needs.
- CI and release engineering that match their own documentation line-for-line
  (verified against `release.yml` and `build-poems.yml` directly), with no
  orphaned required checks and a documented rollback/yank procedure for a
  bad release.
- Zero TODO/FIXME/HACK markers anywhere in `src/` or `scripts/` — deferred
  work is tracked through the GitHub-issue tech-debt process instead, and
  that discipline is visible throughout the code via cited issue IDs.

## Headline risks

- `docs/YAML-SCHEMA.md` omits the `parts` mixed-content segment shape that
  `poem-parser.js` actually emits, leaving anyone hand-editing YAML or
  building a third-party consumer against an incomplete schema [F-DOC-01].
- Poem-parsing errors (`Missing title`, `Missing date`, etc.) carry no line
  number and, on the single-file CLI path, no filename either, making a
  malformed `.poem` file harder to debug than it needs to be [F-UX-01].
- `poem-parser.js`'s label-line detection pattern is duplicated across five
  call sites in a 1,582-line file, a real (if currently harmless) risk that
  a future syntax change is applied inconsistently [F-CODE-01].
- No `CONTRIBUTING.md` or issue template exists, though README's own
  "Contributing" section covers most of the same ground already
  [F-GOV-01].
- A secondary-text colour pair sits right at the WCAG AA contrast threshold
  (~4.53:1 against a 4.5:1 minimum) and could not be confirmed with a real
  contrast tool in this review's sandbox (no headless browser available)
  [F-UX-02].

## Scope and method

Full clone of `main` at commit `bca1bbe`, reviewed on the dedicated branch
`review/2026-09-21`. All automated checks were actually executed against a
fresh `npm ci`, not inferred from CI configuration: `npm audit`, `npm run
lint`, `npm run check` (trailing whitespace), `npm run coverage` (814 tests,
810 passing, 4 environment-gated skips, 88.84% statement coverage against
the project's own 80% gate), `npm run check:licenses` (78 packages, all
allow-listed), `npm run build`, and `npm run check:build`.

The deep review was parallelised across five subagents covering all
thirteen checklist dimensions in three groups by natural adjacency
(architecture+code; security+data+dependencies; testing+CI+tooling;
documentation+governance; performance+usability+operations). Each subagent
was given the project map, its assigned checklist sections, and instructed
to read actual source rather than infer from filenames or trust prior
reviews' conclusions without re-verification — several strengths recorded
here (e.g. the SEC dimension's OAuth findings) were independently
re-confirmed against the current code rather than carried forward from the
2026-08-08 review.

Deep-read in full: `poem-parser.js`, `yaml-to-poem.js` (the two sides of the
`.poem`↔YAML seam), `src/browser/*.js`, `blogger-auth.js`, `sync-blogger.js`,
`serve-static.js`, `path-guard.js`, `poetic-config.js`, `build-poems.js`,
`build-all-poems.js`, `needs-rebuild.js`, `cli-help.js`, `render-core.js`,
`aggregate-render-core.js`, `src/templates/*.pug`, `eslint.config.js`, every
file in `.github/workflows/`, `README.md`, `SECURITY.md`, `CODEOWNERS`,
`AGENTS.md`/`CLAUDE.md`, and a sample of `docs/*.md` cross-checked against
the code they document.

Sampled rather than exhaustive: the 63 files under `test/` (representative
files read for quality; the full suite was run for pass/fail and coverage);
poem fixtures under `src/poems/` and `examples/`; the ~100-file frozen
`tech-debt/` archive (format spot-checked, not read in full); git history
(searched via `git log -p --all` for credential patterns rather than read
sequentially).

Not run: `npm run a11y` (requires a headless Chrome install not available in
this review's sandbox — accessibility was instead assessed by reading
`a11y-check.js`'s own logic and the generated Pug templates/CSS by hand, with
colour-contrast findings explicitly flagged as needing verification with a
real tool). The Blogger live-OAuth flow was not exercised (requires real
Google credentials); its code was reviewed statically instead. Both
limitations are recorded against the specific findings they affect rather
than left implicit.
