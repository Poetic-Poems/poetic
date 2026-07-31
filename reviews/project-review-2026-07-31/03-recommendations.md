# Recommendations

Ordered by severity first, then by effort (quick wins before long campaigns at equal severity). Every `Critical` and `High` finding is covered by a recommendation below; several `Medium`/`Low` findings are bundled where they share a fix shape or a file, with the reason stated in each recommendation.

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Correct the stale tech-debt register entry and stop it recurring | High | Small | F-CI-01 |
| R-02 | Fix `yaml-to-poem.js --all`'s dead-code bug and add test coverage | Medium | Small | F-ARCH-01, F-CODE-02 |
| R-03 | Add integration test coverage for `build-blogger.js`'s orchestration | Medium | Medium | F-TEST-02 |
| R-04 | Fix `build-poems.test.js`'s flaky mtime-comparison pattern | Medium | Small | F-TEST-01 |
| R-05 | Fix README's YAML round-trip example | Medium | Small | F-DOC-01 |
| R-06 | Fix two remaining WCAG AA contrast failures in `poetic.css` | Medium | Small | F-UX-02, F-UX-03 |
| R-07 | Document the local dev/test loop for human contributors | Medium | Small | F-TOOL-01 |
| R-08 | Confirm `path-guard.js`'s symlink gap remains correctly tracked | Medium | Small | F-SEC-01 |
| R-09 | De-duplicate small repeated logic: path-containment fallback and date coercion | Low | Small | F-CODE-01, F-CODE-03 |
| R-10 | Make `serve-static.js` importable via a `createServer()` factory | Low | Medium | F-ARCH-02 |
| R-11 | Unit-test `blogger-auth.js`'s OAuth URL construction | Low | Small | F-TEST-03 |
| R-12 | Bump `markdown-it` to v15 | Low | Small | F-DEPS-01 |
| R-13 | Small documentation/polish batch | Low | Small | F-DOC-02, F-CI-02, F-TOOL-02, F-GOV-01 |

`F-DEPS-02` (Node engines floor) and `F-UX-01` (a sandbox limitation of this review, not a project defect) carry no recommendation by design — both explicitly call for no action at this time.

## R-01 — Correct the stale tech-debt register entry and stop it recurring

**Severity:** High · **Effort:** Small · **Addresses:** F-CI-01

**Current state:** `TECH-DEBT.md`'s `TD26072604` is marked `open`, describing a branch-ruleset fix as not yet applied, when the live GitHub ruleset has actually included `changelog-check` (and `register`) as required status checks since 2026-07-28. `RULESET-CHANGELOG-CHECK.md` at the repo root compounds this by narrating the fix as done in a standalone file that contradicts the register.

**Intended end state:** `TD26072604`'s Ledger row reads `resolved`, its Current-Items body is removed, `RULESET-CHANGELOG-CHECK.md` no longer exists (its substance folded into `CHANGELOG.md`'s existing `v6.2.0` entry), and there is a documented answer to "how would we notice next time the register and live GitHub state disagree" — even if that answer is simply a recurring manual check rather than new automation.

**Approach:** This review applies the Ledger flip directly (see the accompanying `TECH-DEBT.md` diff) and files `TD26080101` for the residual scope (deleting the stale file; the drift-detection gap). The recommendation's remaining work is exactly `TD26080101`'s scope — claim and resolve it via the repo's normal tech-debt workflow (`scripts/get-tech-debt-record.pl`, the `td/<id>` branch convention).

## R-02 — Fix `yaml-to-poem.js --all`'s dead-code bug and add test coverage

**Severity:** Medium · **Effort:** Small · **Addresses:** F-ARCH-01, F-CODE-02

**Current state:** `yaml-to-poem.js --all` resolves its input directory to `path.join(process.cwd(), 'src', 'poems')` — a directory that holds no `.yaml` files directly (they live in `src/poems/yaml/`) — so it always converts zero files, silently, with exit code 0. No test exercises this code path.

**Intended end state:** `yaml-to-poem.js --all` converts every YAML file in `src/poems/yaml/` to `.poem` files in `src/poems/poem/`, resolved via the shared `REPO_ROOT` convention (not `process.cwd()`), matching `poem-to-yaml.js`'s and `poem-to-raw.js`'s `--all` behaviour. The loop is extracted into a named, exported function with direct unit test coverage, mirroring the pattern already applied to its two sibling tools.

**Approach:** Small, self-contained fix plus tests; no dependency on other recommendations.

## R-03 — Add integration test coverage for `build-blogger.js`'s orchestration

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-TEST-02

**Current state:** `injectCSSIntoTemplate()` — the function that reads `config.blogger.template`, resolves it through `path-guard.js`'s containment check, validates CSS for unsafe tags, and writes the injected result — is exported but never called by any test or any CI workflow.

**Intended end state:** At least one test exercises `injectCSSIntoTemplate()` end-to-end against a temp directory with a fixture template/CSS/JS, asserting the written output and the unsafe-tag rejection path; consider whether `npm run build:blogger` belongs in a CI step (even non-blocking, matching the `a11y` pattern) so a broken injection surfaces before a maintainer hits it manually.

**Approach:** May require factoring `injectCSSIntoTemplate` to take `publicDir`/`templatePath` as parameters (as sibling build scripts already do) to make it testable against a temp directory rather than the real `public/` tree.

## R-04 — Fix `build-poems.test.js`'s flaky mtime-comparison pattern

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TEST-01

**Current state:** Two tests in `test/build-poems.test.js` (`:102-123`, `:125-171`) compare an output file's mtime before/after a rebuild without backdating the "before" baseline — the exact shape PR #133 proved flaky and fixed in two sibling test files.

**Intended end state:** Both tests rewind the output file's baseline mtime into the past via `fs.utimesSync` before the "before" read, matching `test/poem-to-yaml.test.js`'s/`test/poem-to-raw-cli.test.js`'s pattern exactly.

**Approach:** Mechanical, self-contained; copy the established pattern verbatim.

## R-05 — Fix README's YAML round-trip example

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DOC-01

**Current state:** README's "Convert to YAML (and back)" example runs `poem-to-yaml.js` on a single file, then `yaml-to-poem.js` against `src/poems/yaml/my-poem.yaml` — a path the single-file conversion never wrote to.

**Intended end state:** The example either specifies an explicit output path for the single-file conversion, or uses `--all` before the `yaml-to-poem.js` step, and states that the single-file form writes alongside its input by default. Running the corrected example end-to-end succeeds.

**Approach:** Documentation-only change; verify by actually running the corrected commands.

## R-06 — Fix two remaining WCAG AA contrast failures in `poetic.css`

**Severity:** Medium · **Effort:** Small · **Addresses:** F-UX-02, F-UX-03

**Current state:** `.back-to-top` (white on `#007AFF`, ≈4.02:1) and `.audio-cell:empty::after` (`#ccc` on white, ≈1.6:1) both fall below WCAG AA's 4.5:1 text-contrast threshold; the first reproduces a defect a dedicated prior PR (`#85`) fixed everywhere else it appeared.

**Intended end state:** `.back-to-top` reaches ≥4.5:1 (e.g. `background: #0062CC`, matching the rest of the already-fixed palette); `.audio-cell:empty::after` reaches an acceptable ratio (e.g. `#767676`, already used elsewhere in this file for muted-but-compliant text) or is marked decorative/`aria-hidden` if it conveys no information beyond the column header.

**Approach:** Bundled into one recommendation because both are one-line colour fixes in the same file, discovered in the same pass; a positive reason to fix together, not merely "both are UX."

## R-07 — Document the local dev/test loop for human contributors

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TOOL-01

**Current state:** README's "Contributing" section documents the PR/branch-protection process and commit format but never mentions `npm test`, `npm run lint`, `npm run coverage`, `npm run check`, or `npm run check:licenses` — the five things CI actually gates on. These are documented together only in `CLAUDE.md`, which targets AI agents.

**Intended end state:** A short "Developing poetic itself" subsection (in README or a new `docs/CONTRIBUTING.md`) lists the local commands CI gates on, aimed at a human reader.

**Approach:** Documentation-only; can mirror `CLAUDE.md`'s "Build commands" list.

## R-08 — Confirm `path-guard.js`'s symlink gap remains correctly tracked

**Severity:** Medium · **Effort:** Small · **Addresses:** F-SEC-01

**Current state:** `TD26072801` already tracks this exact gap (`path-guard.js`'s lexical-only containment checks), with an accurate description and a clear deferred-scope rationale.

**Intended end state:** No new work from this review — `TD26072801` remains open, accurately describing the current code, until someone picks it up via the normal tech-debt claiming workflow. This recommendation exists only to confirm, on the record, that this review re-verified the item against current code rather than silently assuming it was still accurate.

**Approach:** None required; this is a verification-only recommendation.

## R-09 — De-duplicate small repeated logic: path-containment fallback and date coercion

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-01, F-CODE-03

**Current state:** `footer.js` and `build-blogger.js` each reimplement "resolve via `safeJoin`, check `isWithinRoot`, fall back" with slightly different fallback strategies; `sync-blogger.js` reimplements `date-utils.js`'s `toISODate()` inline, missing its validity guard.

**Intended end state:** A shared `resolveContainedConfigPath(repoRoot, configuredPath, { fallback })` helper in `path-guard.js`, used by both `footer.js` and `build-blogger.js`; `sync-blogger.js`'s inline date branch replaced with `toISODate(raw.date) || ''`.

**Approach:** Bundled because both are small "extract and reuse an existing/shared helper" fixes discovered in the same CODE-dimension pass, not because they touch the same file.

## R-10 — Make `serve-static.js` importable via a `createServer()` factory

**Severity:** Low · **Effort:** Medium · **Addresses:** F-ARCH-02

**Current state:** `serve-static.js` starts a server as a module-load side effect with no exports, forcing its test suite to compile the file's source into a throwaway `Module`, and forcing production code (the graceful-shutdown handler) to guard against being re-registered on every test's module reload via a global `Symbol`.

**Intended end state:** `serve-static.js` exports a `createServer(options)` factory that wires routes and signal handlers and returns the server without starting it; `.listen()` is called only under `require.main === module`. The test suite can `require()` the module directly instead of compiling its source.

**Approach:** A refactor with test-suite implications — budget time to update `test/serve-static.test.js` alongside the production change.

## R-11 — Unit-test `blogger-auth.js`'s OAuth URL construction

**Severity:** Low · **Effort:** Small · **Addresses:** F-TEST-03

**Current state:** `main()`'s orchestration (building the consent URL, driving prompts, deciding when to persist credentials) is untested; the security-sensitive helper functions it calls are already well-tested individually.

**Intended end state:** A test asserting the OAuth consent URL's query parameters (state, PKCE challenge/method, scopes) are constructed correctly, without mocking `fetch` or requiring a live OAuth round-trip.

**Approach:** Optional, given this script's low usage frequency and out-of-CI nature; do only if convenient alongside other `blogger-auth.js` work.

## R-12 — Bump `markdown-it` to v15

**Severity:** Low · **Effort:** Small · **Addresses:** F-DEPS-01

**Current state:** `package.json` pins `^14.2.0`; v15.0.0 is available and `npm audit` shows no vulnerability motivating urgency.

**Intended end state:** `markdown-it` at `^15.0.0`, full test suite (including markdown round-trip tests) passing with no rendering-output drift.

**Approach:** Let Dependabot's routine PR handle it, or bump manually; either way, run the full suite before merging given this dependency's role in postscript/analysis rendering.

## R-13 — Small documentation/polish batch

**Severity:** Low · **Effort:** Small · **Addresses:** F-DOC-02, F-CI-02, F-TOOL-02, F-GOV-01

**Current state:** Four small, independent gaps: `docs/YAML-SCHEMA.md`'s segment-label example shows brackets the real schema doesn't store; there's no documented rollback/yank path for a bad release; README has no CI/coverage badge; there's no `.github/PULL_REQUEST_TEMPLATE.md`.

**Intended end state:** `docs/YAML-SCHEMA.md`'s example corrected to `label: "Verse 1"`; a short "if a release is bad" paragraph added to `docs/BUILD.md` or README; a CI status badge added near README's top; an optional PR template added under `.github/`.

**Approach:** Bundled as one batch because each item is a standalone, few-line documentation or config addition with no shared code path — the positive reason being that reviewing four one-line diffs together is more efficient than four separate PR round-trips for changes this small.
