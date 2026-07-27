# Recommendations

Ordered by severity first, then by effort within severity (quick wins before long campaigns). Every Critical and High finding is covered by a recommendation below.

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Make `changelog-check` an actual merge gate | High | Small | F-CI-01 |
| R-02 | Refactor and test `sync-blogger.js`'s `main()` orchestration | High | Medium | F-CODE-01, F-TEST-01 |
| R-03 | Route `footer.source`/`blogger.template` config paths through `path-guard` | Medium | Small | F-SEC-01 |
| R-04 | Test `serve-static.js`'s real request handler, including the traversal guard | Medium | Small | F-TEST-02 |
| R-05 | Export and test `poem-to-yaml.js`/`poem-to-raw.js`'s CLI orchestration | Medium | Medium | F-TEST-03 |
| R-06 | Exempt `createPost` from Blogger sync's rejection-retry to avoid duplicate posts | Medium | Small | F-OPS-01 |
| R-07 | Gate `npm run coverage` in CI with a threshold | Medium | Small | F-CI-02, F-TOOL-01 |
| R-08 | Replace inline `onclick` handlers in the analysis toggle with a delegated listener | Medium | Small | F-ARCH-01, F-CODE-02 |
| R-09 | Add `timeout-minutes` to CI jobs that lack one | Low | Small | F-CI-03 |
| R-10 | Mask the Blogger client-secret terminal prompt | Low | Small | F-SEC-02 |
| R-11 | Add an automated licence-compatibility check | Low | Small | F-DEPS-01 |
| R-12 | Parse each poem's YAML once per aggregate build instead of up to four times | Low | Small | F-PERF-02 |
| R-13 | Add a `<main>` landmark and wire an automated accessibility checker | Low | Small | F-UX-01, F-UX-02 |
| R-14 | File the untracked browser-renderer error-classification debt; tighten the tech-debt closure process | Low | Small | F-UX-03, F-GOV-01 |
| R-15 | Fix three documentation-accuracy gaps | Low | Small | F-DOC-01, F-DOC-02, F-DOC-03 |
| R-16 | Add graceful shutdown to the dev server | Low | Small | F-OPS-02 |
| R-17 | Document a fast-subset/watch-mode test workflow | Low | Small | F-TOOL-02 |

## R-01 — Make `changelog-check` an actual merge gate

**Severity:** High · **Effort:** Small · **Addresses:** F-CI-01

**Current state:** `release.yml`'s `changelog-check` job runs on every PR and correctly detects a version bump with no matching `CHANGELOG.md` entry, but is absent from the branch ruleset's `required_status_checks` list, so it cannot block a merge.

**Intended end state:** `changelog-check` appears in the ruleset's `required_status_checks` alongside `build`, `commit-format`, and the two `Analyze` contexts, so a PR bumping `package.json`'s version cannot be squash-merged while the check is red.

**Approach:** Update the ruleset via the GitHub UI (Settings → Rules → Rulesets) or `gh api --method PUT repos/Poetic-Poems/poetic/rulesets/18226786` with the check added to the existing list. This is a repository-settings change, not a code change — it requires admin/maintain permission on the repo, which the executing agent may not hold; if so, it should produce the exact API call or UI steps for the maintainer to run instead of attempting it directly.

## R-02 — Refactor and test `sync-blogger.js`'s `main()` orchestration

**Severity:** High · **Effort:** Medium · **Addresses:** F-CODE-01, F-TEST-01

**Current state:** `main()` (168 lines) inlines the per-poem create/update/skip decision and the removal-pass loop, unexported and untested, while every other function in the file is a pure, exported, unit-tested helper.

**Intended end state:** The per-poem decision logic and the removal-pass loop body are extracted into named, exported functions callable independently of `main()`; an integration-style test mocks `global.fetch` at the module boundary and drives the extracted orchestration through: a new poem (create + rename), a changed poem (update), an unchanged poem (skip), a removed poem under each of `draft`/`delete`/`keep`, and one failure path reaching `diagnoseBloggerFailure()`.

**Approach:** Do the refactor first (mechanical extraction, low risk given existing pure-helper tests already cover the logic these call into), then add the integration test against the newly-exported functions. Keep `sync-blogger.js`'s CLI behaviour (arguments, console output, exit codes) unchanged.

## R-03 — Route `footer.source`/`blogger.template` config paths through `path-guard`

**Severity:** Medium · **Effort:** Small · **Addresses:** F-SEC-01

**Current state:** `footer.js`'s `resolveFooterSourcePath()` and `build-blogger.js`'s `resolveTemplatePath()` resolve a config-supplied path with no containment check, unlike `serve-static.js`, which uses `path-guard.js`'s `safeJoin`/`isWithinRoot` for the same class of problem.

**Intended end state:** Both functions reject (or warn and fall back to the default) a `footer.source`/`blogger.template` value that resolves outside the intended root (repo root for the footer include, `public/`-equivalent scope for the Blogger template), using `path-guard.js`'s existing helpers rather than a new containment check.

**Approach:** Import `safeJoin`/`isWithinRoot` from `path-guard.js`; pick the appropriate root for each call site; add a test per function asserting a `../`-escaping or absolute-outside-root path is rejected, mirroring `test/path-guard.test.js`'s existing style.

## R-04 — Test `serve-static.js`'s real request handler, including the traversal guard

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TEST-02

**Current state:** `test/serve-static.test.js` only exercises four pure helpers extracted from the module; the actual `http.createServer` request-handler callback — including both `isWithinRoot` call sites — has never run under test.

**Intended end state:** A test drives the real request handler (either by capturing the function passed to a stubbed `http.createServer`, or via a real `listen(0)` and `http.request`) and asserts: a traversal attempt returns 403, a normal file returns 200 with the right `Content-Type`, and a missing path falls through to 404/SPA-fallback.

**Approach:** Extend the existing in-memory source-patching technique the test file already uses; do not change `serve-static.js`'s runtime behavior, only make the handler capturable for tests if it isn't already via the current stub.

## R-05 — Export and test `poem-to-yaml.js`/`poem-to-raw.js`'s CLI orchestration

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-TEST-03

**Current state:** Both files' `main()` (the `--all` loop, skip-if-up-to-date counting, stale-artefact detection, per-file error counting and `exit(1)`) is unexported and untested; only the pure conversion functions each calls are tested.

**Intended end state:** Each file exports its per-file loop as a testable function (mirroring `build-poems.js`'s `buildAllPoems()`), and `spawnSync`-driven tests (mirroring `test/build-poems.test.js`'s existing pattern) cover the error/exit paths plus a positive test for the stale-artefact warning.

**Approach:** Extract before testing; keep the CLI's argument parsing and console output as thin wrappers around the newly-exported function, matching `build-poems.js`'s existing shape as closely as practical.

## R-06 — Exempt `createPost` from Blogger sync's rejection-retry to avoid duplicate posts

**Severity:** Medium · **Effort:** Small · **Addresses:** F-OPS-01

**Current state:** `fetchWithRetry()` retries any rejected fetch once, applied uniformly to every Blogger API call including the non-idempotent `createPost`.

**Intended end state:** A retried `createPost` cannot create two live posts for the same poem: either `createPost` is excluded from the automatic rejection-retry, or the retry path re-checks for an existing post with the same slug marker before creating a second one.

**Approach:** The simplest safe fix is excluding `createPost` from `fetchWithRetry`'s retry wrapper and letting a failed create surface as a normal error for that poem (consistent with the tool being safely re-runnable — a subsequent sync run will see the poem as still missing and try again). Add a test asserting a rejected `createPost` is not retried, alongside the existing `fetchWithRetry` test block.

## R-07 — Gate `npm run coverage` in CI with a threshold

**Severity:** Medium · **Effort:** Small · **Addresses:** F-CI-02, F-TOOL-01

**Current state:** `c8` is configured and runnable locally (`npm run coverage`), but no workflow runs it, uploads a report, or checks a threshold.

**Intended end state:** A CI step runs `npm run coverage` with `c8 --check-coverage` and a floor set a little below the current 79% statement / 82% branch / 88% function figures, failing the check on a genuine regression.

**Approach:** Add the step to `build-poems.yml`'s existing `build` job (after `npm test`) or a small dedicated job; pin the threshold below today's numbers with headroom for natural fluctuation from adding new, well-tested code, not so tight that an unrelated change trips it.

## R-08 — Replace inline `onclick` handlers in the analysis toggle with a delegated listener

**Severity:** Medium · **Effort:** Small · **Addresses:** F-ARCH-01, F-CODE-02

**Current state:** `_poem-content.pug`'s four analysis show/hide/selector buttons use hand-written, string-interpolated `onclick` JS, including a duplicated inline `el = name => ...` helper — the one control in the template still wired this way, contradicting the template's own "do not add a script block here" comment.

**Intended end state:** The analysis controls use `data-*` attributes and a single delegated `click` listener in `public/poetic.js`, matching the pattern already used for the song-embed button and the postscript toggle. Consider adding `aria-expanded` while making this change (UX-adjacent, same edit).

**Approach:** Mirror the postscript-toggle fix's structure exactly; keep the rendered HTML's visible behaviour identical (same show/hide semantics), verified by loading a built poem page with an analysis section and exercising every button.

## R-09 — Add `timeout-minutes` to CI jobs that lack one

**Severity:** Low · **Effort:** Small · **Addresses:** F-CI-03

**Current state:** Only `sync-blogger.yml` sets a job timeout; every other workflow's jobs default to GitHub's 360-minute ceiling.

**Intended end state:** Every job in `.github/workflows/*.yml` has an explicit, modest `timeout-minutes` (e.g. 10-15 for `build`, 5 for lighter jobs like `commit-format`/`changelog-check`).

**Approach:** Add the key to each job; pick values comfortably above observed run times (the last checked `build` run took 33s) so this only fires on a genuine hang, not natural variance.

## R-10 — Mask the Blogger client-secret terminal prompt

**Severity:** Low · **Effort:** Small · **Addresses:** F-SEC-02

**Current state:** `blogger-auth.js`'s interactive `BLOGGER_CLIENT_SECRET` prompt uses a plain `rl.question()`, so the typed secret echoes to the terminal.

**Intended end state:** The client-secret prompt does not echo the typed value to the terminal (or the `--help`/prompt text notes that the env-var path avoids echoing, as an alternative to a code change).

**Approach:** Disable TTY echo around that one `rl.question()` call (a standard pattern for masked CLI prompts), or add a one-line note to `--help` output pointing at the env-var alternative.

## R-11 — Add an automated licence-compatibility check

**Severity:** Low · **Effort:** Small · **Addresses:** F-DEPS-01

**Current state:** No CI step or script verifies dependency licences; manual inspection today shows only permissive licences in use.

**Intended end state:** A CI or pre-commit step fails if a dependency (direct or transitive) carries a licence outside an explicit allow-list.

**Approach:** Add `npx license-checker --production --onlyAllow 'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD;BlueOak-1.0.0'` (or equivalent) as a CI step; adjust the allow-list only if it flags a real, already-approved dependency.

## R-12 — Parse each poem's YAML once per aggregate build instead of up to four times

**Severity:** Low · **Effort:** Small · **Addresses:** F-PERF-02

**Current state:** `build-all-poems.js` independently reads and parses each poem's YAML in `concatenateAllHtmlFiles()`, again in `loadPoemData()`, again in `generateIndexHtml()`, and again while computing the aggregate's staleness-check `sources` set.

**Intended end state:** Each poem's YAML is parsed once per build invocation and the parsed object is shared across metadata extraction and `$ref` resolution.

**Approach:** Thread the already-parsed object through the call sites that currently re-read from disk; keep behaviour identical (same metadata, same `$ref` resolution), verified against the existing `build-all-poems`/`aggregate-render-core` tests plus a manual before/after diff of the generated `all-poems.html`/`index.html`.

## R-13 — Add a `<main>` landmark and wire an automated accessibility checker

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-01, F-UX-02

**Current state:** No generated page (`index.html`, `all-poems.html`, individual poem pages) has a `<main>` landmark; no automated accessibility tooling runs anywhere.

**Intended end state:** Each of the three templates wraps its primary content in `<main>` (leaving `nav`/`footer` outside it), and a non-blocking accessibility check (`pa11y-ci`/`axe-core` or similar) runs in CI against `public/index.html` and one representative poem page.

**Approach:** Small, independent template edits for the landmark; add the checker as a new, non-blocking CI step (report-only to start, since this project's a11y history is two prior manual-catch regressions with no prior tooling baseline to compare against).

## R-14 — File the untracked browser-renderer error-classification debt; tighten the tech-debt closure process

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-03, F-GOV-01

**Status: already actioned as part of this review.** This recommendation's entire intended end state was filing a tracked entry — since `TECH-DEBT.md` was already being updated in this same review (Step 2 of the project-review process), the entry was filed directly rather than deferred to a future prompt. See `TD26072617` in `TECH-DEBT.md`'s Current Items, which records the browser-renderer error-classification gap itself (the underlying code fix — adding `.code`/`.name` to thrown errors in `src/browser/render.js`/`render-aggregate.js` — remains open work for whoever picks up that tech-debt item, e.g. via `/td 617`).

**Current state (at review time):** `src/browser/render.js`/`render-aggregate.js` still threw unclassified `Error`s, a gap a prior batched fix (TD26072118) explicitly deferred without filing a follow-on entry — so it existed nowhere in the tracked Ledger going into this review.

**Intended end state:** A new `TD*` entry records the browser-renderer error-classification gap specifically, so a future reviewer or contributor finds it tracked rather than re-discovering it — done, as `TD26072617`.

**Approach:** No further action needed for this recommendation itself. Do not re-file a duplicate entry for this gap.

## R-15 — Fix three documentation-accuracy gaps

**Severity:** Low · **Effort:** Small · **Addresses:** F-DOC-01, F-DOC-02, F-DOC-03

**Current state:** `scripts/edit-poem`/`docs/SCRIPTS.md` document a `-1` no-match exit code that is actually `255`; `docs/BUILD.md` carries one "previously"-phrased historical sentence and mislabels `poetic.js` as Audiomack-specific while omitting its postscript-toggle responsibility.

**Intended end state:** `scripts/edit-poem`'s documented exit code matches its real behaviour (either fix the doc to say `255`, or change the script to `exit 1` and update both docs); `docs/BUILD.md`'s historical parenthetical is removed (behaviour description kept); `docs/BUILD.md`'s File Structure diagram accurately describes `poetic.js`'s two responsibilities.

**Approach:** Three small, independent, positive-reason-bundled doc/script edits (same file, same "doc drift" theme, cheap to do together); verify the exit-code fix by actually running `scripts/edit-poem` against a non-matching pattern and checking `$?`.

## R-16 — Add graceful shutdown to the dev server

**Severity:** Low · **Effort:** Small · **Addresses:** F-OPS-02

**Current state:** `serve-static.js` has no `SIGINT`/`SIGTERM` handler; `npm run stop` kills it abruptly with no in-flight-request draining.

**Intended end state:** `serve-static.js` calls `server.close()` on `SIGINT`/`SIGTERM`, allowing in-flight responses to complete before exiting.

**Approach:** A small, self-contained addition to the server's startup code; verify manually that `Ctrl-C` and `npm run stop` both still terminate the process (just more cleanly).

## R-17 — Document a fast-subset/watch-mode test workflow

**Severity:** Low · **Effort:** Small · **Addresses:** F-TOOL-02

**Current state:** `package.json`'s only test script runs the full suite; there is no `test:watch` script and no documented way to run a subset, though `node --test test/<file>.test.js` already works.

**Intended end state:** A `test:watch` script exists (`node --test --watch`), and `CLAUDE.md`'s build-commands section shows the subset-run pattern.

**Approach:** One new `package.json` script and one documentation line; no behavioural change to the existing `test` script.
