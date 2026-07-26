# Findings

This is the fourth full project review of poetic (2026-07-07, 2026-07-11, 2026-07-21 preceded it). Nearly all prior findings are resolved — see `TECH-DEBT.md`'s Ledger, which carries only one open item (TD26072602) going into this review. Findings below are therefore weighted towards what changed since 2026-07-21 (30 commits: the `poem-parser.js` split into three modules, `sync-blogger.js`'s timeout/retry fix, several `yaml-to-poem.js` fidelity fixes) and towards a fresh look at dimensions the last review covered more lightly. Where a prior finding was re-verified as still fixed, it is recorded under that dimension's Strengths rather than re-listed.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 7 |
| Low | 18 |

## Architecture and design (ARCH)

**Strengths:** The `poem-parser.js` → `poem-markup.js`/`poem-variables.js`/`poem-metadata.js` split (commits #104, #106, #108) is a genuine decomposition: each extracted module holds only pure functions, has its own dedicated test file, and none requires `poem-parser.js` back — no cycles anywhere in `src/tools/` + `src/browser/` (checked programmatically). The `poem-to-yaml.js`/`yaml-to-poem.js` producer/consumer seam now has a real end-to-end test (`test/yaml-to-poem-roundtrip.test.js`, ~20 tests, round-tripping hand-built poem-data objects through both converters and asserting `deepStrictEqual`), closing the 2026-07-21 review's F-ARCH-01. Config/secrets handling (`blogger-auth.js`'s atomic mode-0600 credential write, `sync-blogger.js`'s permission/enum warnings) remains sound. The filesystem-free "core" shared between the Node and browser render paths stays cycle-free and is verified, not just claimed, by a byte-for-byte parity test.

### F-ARCH-01 — Analysis show/hide/selector controls use inline `onclick` handlers, contradicting the template's own stated rule · **Medium**

**Evidence:** `src/templates/_poem-content.pug` line 2 states: "Do NOT add a `<script>` block here; the embedded-player loader lives in `public/poetic.js`." Yet lines 171–196 build four `onclick` attributes with hand-written, string-interpolated JS, e.g. `onclick=\`document.getElementById('analysis--${slug}').style.display = 'block'; ...\``. This duplicates, less consistently, what `public/poetic.js` already does via delegated `addEventListener('click', ...)` handlers for the song-embed button and the postscript "See more" toggle (the latter a real `<button aria-expanded>` with no inline script, per the TD26072103 fix). The analysis buttons are the one remaining control still wired the old way.

**Impact:** Business logic in the presentation layer: two structurally similar toggle widgets in the same file follow two different architectures, one of which the project already deliberately abandoned for the other. It also forecloses a plausible next requirement cheaply accommodated everywhere else — a Content-Security-Policy header would break the analysis toggle immediately while leaving every other control unaffected.

**Direction:** Replace the `onclick` attributes with `data-*` attributes and one delegated `click` listener in `public/poetic.js`, mirroring the postscript-toggle fix. Addressed by R-08.

### F-ARCH-02 — `poem-parser.js` is still the largest hand-written file, bundling five distinct grammar concerns · **Low**

**Evidence:** After three extraction PRs (TD26072110/TD26072601/TD26072603, all closed), `poem-parser.js` is 1582 lines (down from 1854), still ~3x the next-largest tool file, covering section sequencing, audio-line/shell-word/param-list scanning, postscript parsing, and analysis parsing — all sharing `this.lines`/`this.index`/`this.variables`.

**Impact:** Proportionate for now — one class covering the whole grammar surface below the already-extracted pure-text layer, not a tangled god-object. `scanShellWord`/`parseParamList` already delegate to `poem-variables.js` in the same shape the existing extractions use, so it's the natural next-candidate if the file grows again.

**Direction:** No action needed now; watch if new `.poem` grammar features land here rather than in a sibling module.

## Code quality and maintainability (CODE)

**Strengths:** Zero `TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `src/`/`scripts/` — self-reported debt is tracked in `TECH-DEBT.md` per the project's own convention, and the convention is followed in practice. Error handling is careful: all 7 bare `catch` blocks in `src/tools/` are narrowly-scoped, commented best-effort fallbacks, not silent swallows. JSDoc discipline is strong, including in the newly extracted modules. Only 2 `eslint-disable` comments exist in the whole `src/` tree, both individually justified. Generated files (`poem-templates.js`, `song-handlers-data.js`) were verified byte-for-byte current against `npm run build:generated`.

### F-CODE-01 — `sync-blogger.js`'s `main()` is the project's complexity hot-spot, and the one part of an otherwise well-tested file that isn't tested · **Medium**

**Evidence:** `sync-blogger.js`'s `main()` (168 lines) mixes CLI-arg handling, network calls, and a per-poem create/update/skip decision loop plus a separate removal-pass loop, all inline — unlike the rest of the file, whose header comment states "Pure helpers are exported for unit testing; `main()` runs only when invoked directly." `parseArgs`, `resolveConfig`, `extractSlug`, `composePost`, `postNeedsUpdate`, `selectRemoved`, `extractContent` are all pure, exported, and unit-tested; `main()` itself is not exported and not exercised by any test. The same shape recurs, to a lesser degree, in `poem-to-yaml.js` and `poem-to-raw.js`.

**Impact:** A deliberate, mostly-benign project convention (pure logic factored out and tested; the fs/network-touching entry point left as an untested wrapper) has, in this one file, grown past "thin orchestrator" into containing real branching business logic that isn't factored out the way everything else in the file is — making it simultaneously the file's most complex code and its only untested code. See F-TEST-01 for the test-coverage half of this same gap.

**Direction:** Extract the per-poem create/update branch and the removal-pass loop body into named, exported helper functions, mirroring the rest of the file. Addressed together with F-TEST-01 by R-02.

### F-CODE-02 — A one-line helper is redefined identically inline in two adjacent template attributes · **Low**

**Evidence:** `src/templates/_poem-content.pug` lines 189 and 194 each independently define the same arrow function (`el = name => document.getElementById(...)`, an implicit global — no `const`/`let`) inside an `onclick` string, differing only in the branch logic that follows.

**Impact:** The checklist's "copy-pasted logic that has already begun to diverge" hazard in waiting — the two copies are consistent today, but nothing enforces that the next edit to one is mirrored in the other. Same root cause as F-ARCH-01.

**Direction:** Falls out of F-ARCH-01's fix. Addressed by R-08.

## Security (SEC)

**Strengths:** `npm audit` (default and `--omit=dev`) is clean: 0 vulnerabilities. A targeted secret-pattern scan of the 30 commits since 2026-07-21 found nothing new (a full-history scan was already done in the 2026-07-21 review and came back clean). `blogger-auth.js` implements OAuth `state` (CSRF) + S256 PKCE, redacts credentials from its own console summary, and writes the credentials file atomically at mode 0600 using `wx` so the temp path can't be a pre-planted symlink. `sync-blogger.js`'s `fetchWithRetry()` is a genuinely bounded retry (single retry, fixed delay, only on 429/5xx/network-rejection, 30s per-attempt timeout). `serve-static.js` + `path-guard.js` apply dedicated, unit-tested path-containment consistently at every static-file and directory-listing branch, and the XSS regression tests genuinely exercise hostile filenames on disk, not just happy paths. CI trust boundaries are handled correctly throughout (`pull_request` not `pull_request_target`, `deploy`/Blogger-sync jobs gated to `main` only). Two 2026-07-21 findings (wildcard CORS, unrechecked credential-file permissions) are confirmed fixed in the current code.

### F-SEC-01 — `footer.source`/`blogger.template` config paths bypass `path-guard`'s containment check · **Medium**

**Evidence:** `src/tools/footer.js`'s `resolveFooterSourcePath()` (lines 39-42) joins a relative `footer.source` with no `..`-stripping and uses an absolute one verbatim; `renderFooter()` then reads whatever that resolves to and splices it into every generated page's `<footer>`, published to GitHub Pages. `src/tools/build-blogger.js`'s `resolveTemplatePath()` (lines 39-43) returns `config.blogger.template` completely unvalidated, read directly to build the Blogger theme upload. Neither function uses `path-guard.js`'s `safeJoin`/`isWithinRoot`, which exists specifically for this purpose and is used correctly in `serve-static.js`; `grep -rn "safeJoin\|isWithinRoot" src/` shows the guard wired into `serve-static.js` only.

**Impact:** `.poetic-config.yaml` is authored by whoever can land a merged PR against a consumer poem-collection repo. Setting `footer: { source: "/etc/hostname" }` or a `../../..`-relative path (or the equivalent on the Blogger template path) causes the build to read that file's content and publish it verbatim, either baked into every public GitHub Pages page or uploaded as the live Blogger theme — a content-disclosure primitive, not merely a self-inflicted build break. Capped at Medium (not Critical/High) because it requires the same write access to `.poetic-config.yaml` that already lets someone control the published output entirely, but is flagged above a self-inflicted-only bar because the failure mode (disclosure of files never intended for `public/`) is a more severe kind of harm than a hung build.

**Direction:** Route both functions through `path-guard.js`'s `safeJoin`/`isWithinRoot`, rooted at the repo root or `public/`. Addressed by R-03.

### F-SEC-02 — Blogger client secret is echoed to the terminal during interactive entry · **Low**

**Evidence:** `blogger-auth.js` lines 409-410 prompt for `BLOGGER_CLIENT_SECRET` via a plain `rl.question()` with no output-muting; Node's `readline` echoes typed input by default. The env-var path (`BLOGGER_CLIENT_ID`/`BLOGGER_CLIENT_SECRET`) avoids the prompt entirely, but the interactive fallback has no masking.

**Impact:** Low: a one-time, local, interactively-run setup helper, not a service processing third-party input. Residual risk is terminal scrollback or an accidental screen share/recording during one-time setup.

**Direction:** Mask the client-secret prompt (disable TTY echo around that one `rl.question()` call), or note in `--help` that the env-var path avoids on-screen echo. Addressed by R-10.

## Testing and quality assurance (TEST)

**Strengths:** The suite is fast (~19-23s), deterministic, and has no real network calls or arbitrary sleeps. `test/yaml-to-poem-roundtrip.test.js` is a genuine cross-tool seam test. Regression tests are self-documenting and behavioural: `test/path-guard.test.js` names the exact prior bug it guards against, and `test/serve-static.test.js` writes real hostile filenames to disk and asserts the escaped output. `test/golden.test.js` and the `poem-to-yaml` metadata/audio tests pin converter output against committed golden fixtures with a regeneration command in the failure message. `poem-templates.js`'s low raw coverage number (50.76%) is not a real gap — it's generated, precompiled Pug, verified bit-for-bit current, with the uncovered lines being defensive branches this project's own templates never exercise.

### F-TEST-01 — `sync-blogger.js`'s live-sync orchestration (`main()`) has zero test coverage · **High**

**Evidence:** `sync-blogger.js` measures 69.35% statement / 56% function coverage; the uncovered ranges are exactly `diagnoseBloggerFailure()` and `main()` — the function that decides, for every poem, whether to create/update/skip/draft/delete a Blogger post, including the two-phase post creation (create with a date-prefixed title, then rename back), the `--only`/removal-pass interaction, dry-run vs. live branching, and the top-level failure handler. `test/sync-blogger.test.js` (897 lines) only calls the pure helpers `main()` is built from, in isolation — nothing wires them together the way `main()` does.

**Impact:** This is the one piece of the framework that mutates a live, public, third-party service on every push to `main` touching `src/poems/**`. The individual decision functions being well tested reduces but does not eliminate the risk that a bug in how `main()` *sequences* those decisions ships straight to a live blog with nothing in the suite to catch it. TD26072602 (sequential posting) lives in the same function and is unrelated to this gap.

**Direction:** Add an integration-style test that mocks `global.fetch` at the module boundary and drives `main()` through an end-to-end scenario per branch (create+rename, update, skip, removal under draft/delete/keep, and one failure path). Addressed together with F-CODE-01 by R-02.

### F-TEST-02 — `serve-static.js`'s actual HTTP request handler is completely untested · **Medium**

**Evidence:** `serve-static.js` measures 55.8% statement / 75% function coverage, with the uncovered range being the entire `http.createServer` callback — the `/all-poems` endpoint, directory-listing branch, both path-traversal guard call sites, the 200/403/404 responses, the SPA-fallback branch, and the top-level try/catch → 500. `test/serve-static.test.js`'s own file comment explains why: the module has no `module.exports` and starts a real server as a load-time side effect, so the test patches the source in-memory to export four pure helpers with `http.createServer` stubbed to a no-op — which prevents the request handler itself from ever running under test.

**Impact:** `path-guard.js`'s `isWithinRoot`/`safeJoin` are 100% covered in isolation, and `serve-static.js` is the only place in `src/` that wires that guard into request handling — but no test ever sends a request through the real handler and asserts the 403 actually fires. Severity capped at Medium because `serve-static.js` is explicitly a local dev tool, not the production serving path (GitHub Pages serves `public/` directly).

**Direction:** Extend the existing "stub `http.createServer`, patch in an export" technique to capture the request-handler function itself and invoke it directly against a fake `req`/`res` pair, covering at minimum a traversal attempt (403), a normal file (200), and a missing path (404/SPA-fallback). Addressed by R-04.

### F-TEST-03 — Build-tool CLI entry points (`main()`) are untested where the equivalent logic in `build-poems.js` is · **Medium**

**Evidence:** `poem-to-yaml.js`'s `main()` (the `--all` loop, skip-if-up-to-date counting, stale-YAML-artefact detection, per-file error counting/exit(1)) is entirely inside that file's uncovered range (46.4% stmt). `poem-to-raw.js`'s `main()` is likewise wholly inside its uncovered range (67.13% stmt). Neither file's tests invoke `main()` — only the exported pure functions. By contrast, `build-poems.js` exports its equivalent orchestration as `buildAllPoems()`, and `test/build-poems.test.js` calls it directly for the happy path and drives its `process.exit(1)` paths via `spawnSync` of an inline script.

**Impact:** `npm run build`/CI only ever exercises this code against the project's own pristine corpus, where nothing is stale and nothing fails to convert — so the stale-artefact warning, skip-count reporting, and per-file error-counting/exit(1) branches have, as far as this review can determine, never executed under any test, only in production use by consumer repos, where a bug would surface as a silent build regression rather than a CI failure.

**Direction:** Export the substantive per-file loop from each as a testable function (mirroring `buildAllPoems()`), and add `spawnSync`-driven tests for the error/exit paths plus a positive test for the stale-artefact warning. Addressed by R-05.

## Dependencies and supply chain (DEPS)

**Strengths:** 4 runtime + 3 dev dependencies, all directly exercised, nothing decorative. `package-lock.json` is committed; CI uses `npm ci`; `.npmrc`'s `engine-strict=true` plus pinned `actions/setup-node` versions make a Node-version mismatch fail loudly. `npm audit` is clean across 177 packages, all registry-signature-verified, 22 with provenance attestations. `npm outdated` returns nothing. `.github/dependabot.yml` covers both `npm` and `github-actions` weekly. Recent bumps (js-yaml 5.2.2 DoS fix, eslint 10.8.0) were spot-checked in `package-lock.json` and confirmed correct, with the js-yaml v4→v5 timestamp-quoting risk (TD26071109) confirmed genuinely covered by golden tests exercising quoted date scalars. Node engines floor (`>=22`) is current, not EOL.

### F-DEPS-01 — No automated licence-compatibility check for dependencies · **Low**

**Evidence:** `package-lock.json` records no `license` field for ~45 transitive packages (Babel, Acorn, several `pug` sub-packages). No CI step or script runs a licence-compliance tool. Manual sampling of packages with a recorded licence shows only permissive licences in use, and the unlabelled packages are well-known permissively-licensed tooling — no evidence of an actual conflict today.

**Impact:** The gap is in verification, not current compliance: nothing would catch a future dependency (direct, transitive, or Dependabot-proposed) introducing a copyleft or otherwise MIT-incompatible licence before it lands. Low severity because the project is source-only, not published to npm.

**Direction:** Add a lightweight CI or pre-commit licence check (e.g. `license-checker --onlyAllow`). Addressed by R-11.

## Tooling and developer experience (TOOL)

**Strengths:** The newcomer path was actually traced end-to-end from a fresh clone with no hidden steps — every command CLAUDE.md documents matched its documented behaviour. The WSL wrapper (`scripts/setup-linux.sh`) is a verified transparent pass-through. Editor/lint tooling is deliberate and well-documented (`.editorconfig`'s per-filetype overrides cross-reference `remove-trailing-spaces.sh`'s behaviour by design). Vim integration is structurally consistent with its docs and was actually run (`editors/vim/install.sh` against a scratch `$HOME`, producing real files). Local authoring affordances (`scripts/new-poem`, `scripts/edit-poem`) go beyond a bare build script. No devcontainer exists, and that's judged a reasonable choice given the project's footprint (no database, no external services, `engine-strict` + CI already pin the Node version).

### F-TOOL-01 — Coverage tooling exists locally but is not wired into CI · **Low**

**Evidence:** `package.json` defines `"coverage": "c8 npm test"`, but `build-poems.yml`'s `build` job has no coverage step, threshold gate, or report artifact. `CHANGELOG.md` already flags this at the point the tool was added ("No CI coverage-floor gate yet"). `TECH-DEBT.md`'s Ledger shows TD26072112 as resolved, with no separate open item tracking the CI-enforcement follow-on.

**Impact:** Coverage is measurable locally but nothing prevents it from silently regressing over time. This is the same underlying gap independently identified from the CI dimension as F-CI-02.

**Direction:** Addressed together with F-CI-02 by R-07.

### F-TOOL-02 — No documented fast-subset or watch-mode test workflow · **Low**

**Evidence:** `package.json`'s only test script is `"test": "node --test"` (full-suite, no flags). There is no `test:watch` and no documented way to run a subset, though `node --test test/<file>.test.js` works today — neither `README.md` nor `CLAUDE.md` mentions it.

**Impact:** Minor friction for iterative development; the full suite is fast enough today (≈20s) that this isn't yet a practical bottleneck.

**Direction:** Add a `test:watch` script and a one-line note showing the subset-run pattern. Addressed by R-17.

## CI/CD and release engineering (CI)

**Strengths:** Workflow YAML is unusually well-documented, explaining non-obvious choices (the build skip-guard's deny-list design, the deliberate absence of `paths:` filters on required checks) inline. `gh run list --branch main` confirms the last 8 runs are all green; there is no backlog of open PRs. CodeQL runs against both the source and the workflow YAML itself, backed by real ruleset enforcement (`security_alerts_threshold: high_or_higher`). Commit-message format has one source of truth shared between the local hook and the CI job, and correctly uses `pull_request` (not `pull_request_target`). The release mechanism is idempotent — re-running the workflow cannot double-tag or double-release. `strict_required_status_checks_policy: false` is a deliberate, documented choice per CLAUDE.md and is not flagged as a finding.

### F-CI-01 — `changelog-check` is not a required status check, so the changelog gate it implements can be bypassed by merging past a red X · **High**

**Evidence:** `release.yml`'s `changelog-check` job (added by PR #91) fails when `package.json`'s version changed but `CHANGELOG.md` has no matching `## [<version>]` heading. The active branch ruleset's `required_status_checks` list (`gh api repos/Poetic-Poems/poetic/rulesets/18226786`) is exactly `build`, `commit-format`, and the two `Analyze` contexts — `changelog-check` is not in it. On GitHub, only checks in this list block the merge button; "Squash and merge" remains clickable even with `changelog-check` showing a red X. The push-triggered `release` job does not re-verify the changelog either.

**Impact:** CLAUDE.md's "Release process" section states this check exists so "a release cannot land with the previous release's entries still sitting under `[Unreleased]`" — but as configured, that guarantee is not backed by branch protection. A release PR can be squash-merged while `changelog-check` is failing, after which the push-triggered `release` job will tag and publish a GitHub release for a version with no corresponding `CHANGELOG.md` entry — exactly the failure mode the job was written to prevent.

**Direction:** Add `"changelog-check"` to the ruleset's `required_status_checks` list. Addressed by R-01.

### F-CI-02 — `npm run coverage` exists but is not run or gated anywhere in CI · **Medium**

**Evidence:** No workflow invokes `npm run coverage`, uploads a coverage artifact, or checks a minimum threshold; there is no `.c8rc`/`nyc` config either.

**Impact:** The 2026-07-21 review's R-12 ("add a code-coverage tool") is satisfied only at the "the tool exists" level, not the "CI enforces it" level. This matters more here than in a typical project because several of this framework's riskiest paths (live Blogger sync, the dev server's path-traversal guard — see F-TEST-01/F-TEST-02) already sit at the lower end of the coverage range with no CI tripwire to prevent them sliding further.

**Direction:** Add a `coverage` job with `c8`'s `--check-coverage` and a floor pinned a little below the current 79%/82%/88%. Addressed together with F-TOOL-01 by R-07.

### F-CI-03 — No `timeout-minutes` on most jobs, including the required `build` check · **Low**

**Evidence:** Only `sync-blogger.yml` sets `timeout-minutes` (30). `build-poems.yml`, `codeql.yml`, `commit-format.yml`, `release.yml`, and `sync-framework.yml`'s jobs all default to GitHub Actions' 360-minute ceiling.

**Impact:** `build` is one of the four checks required to merge into `main`. A hang anywhere in its steps would occupy a runner for up to 6 hours before GitHub kills it, holding up that PR's merge for the entire window. No evidence this has happened — a latent-risk finding, not an observed failure.

**Direction:** Add a modest `timeout-minutes` (e.g. 10-15 for `build`, 5 for lighter jobs) to each workflow lacking one. Addressed by R-09.

## Performance and scalability (PERF)

**Strengths:** `needs-rebuild.js`'s incremental staleness tracking is linear and well-tested (14 tests covering every branch). The previously-fixed quadratic escape-restoration loop (TD26071502) is confirmed still linear after moving to `poem-markup.js` in the #104 split — the fix moved intact, not lost. `sync-blogger.yml`'s concurrency group plus 30-minute job timeout bound worst-case CI cost.

### F-PERF-01 — Blogger sync's sequential per-poem processing (tracked as TD26072602) · **Low**

**Evidence:** `sync-blogger.js`'s `main()` loop `await`s each poem's create/update sequentially, as does the removal pass. Already recorded in `TECH-DEBT.md` as open, explicitly deferred "worth doing only if sync runtimes are actually observed to be a problem."

**Impact:** For a real collection of hundreds of poems, full-sync wall time is the sum of every request's round trip. This repo has only 2 example poems, so there is no new evidence the runtime has become an actual problem — the existing deferral calculus stands.

**Direction:** No new recommendation; already tracked as TD26072602.

### F-PERF-02 — `build-all-poems.js` parses every poem's YAML up to four times per aggregate build · **Low**

**Evidence:** `concatenateAllHtmlFiles()` reads+parses each file for metadata, then `loadPoemData()` does a second independent read+parse of the same file; `generateIndexHtml()` does its own independent read+parse of every poem file again; and computing the aggregate's `sources` set for the staleness check parses every poem yet again via `refFilesForPoem()` — before `needsRebuildAggregate()` even runs, so the "up to date, skip" fast path isn't actually O(1).

**Impact:** Linear, not quadratic, and each poem's YAML is small, so the practical cost at a few hundred poems is likely negligible. Still, it's avoidable redundant I/O (~4x per poem) that quietly undercuts the purpose of the incremental-build fast path this same file relies on.

**Direction:** Parse each poem's YAML once per build and share the parsed object across metadata extraction and `$ref` resolution. Addressed by R-12.

## Usability and accessibility (UX)

**Strengths:** Both accessibility defects from the 2026-07-21 review are genuinely fixed, verified by direct inspection: the postscript toggle is now a real `<button aria-expanded>` with a working focus ring, and the WCAG AA contrast failures are fixed with margin (`#767676` ≈ 4.55:1, `#666` ≈ 5.75:1). `poem-page.pug` now uses `h1.poem-title`, fixing the missing top-level heading. `blogger-auth.js` is a strong example of CLI UX (a proper `--help`, human-actionable error text, a pre-save confirmation step). CLI exit-code discipline is solid across every build tool.

### F-UX-01 — No `<main>` landmark on any generated page · **Low**

**Evidence:** `public/index.html`, `public/all-poems.html`, and `poem-page.pug` all go straight from `<body>`/`div.container` to content with no `<main>` anywhere.

**Impact:** Screen-reader/switch-access users relying on landmark navigation have no "jump to main content" region. Each page does have a correct `h1` now, so this is real but secondary.

**Direction:** Wrap the primary content in each template in `<main>` (or `role="main"`). Addressed by R-13.

### F-UX-02 — No automated accessibility checker wired into anything · **Low**

**Evidence:** No reference to `axe`, `pa11y`, or similar in `package.json` or any workflow. Both real a11y regressions this project has had (the keyboard-trap toggle, the contrast failures) were caught by manual review, not tooling.

**Impact:** Nothing in CI would catch a future regression of either class until the next manual review.

**Direction:** A non-blocking `pa11y-ci`/`axe-core` check against one poem page and the index. Addressed by R-13.

### F-UX-03 — Browser-renderer errors are still unclassified plain `Error` objects, and the residual gap is no longer tracked anywhere · **Low**

**Evidence:** `src/browser/render.js`/`render-aggregate.js` still throw bare `Error`s with no `.code`/`.name`. The commit that closed the batch item covering this (`c33fa16`, closing TD26072118) explicitly states the error-classification piece was "left as-is... not a small, safe edit, so out of scope here" — but no new `TD*` entry was filed for the residual piece.

**Impact:** Low priority on its own, but the *tracking* of it fell through, not just the fix. See paired governance finding F-GOV-01.

**Direction:** File a fresh `TECH-DEBT.md` entry for this specific residual item. Addressed together with F-GOV-01 by R-14.

## Documentation (DOC)

**Strengths:** All three doc/path fixes from the 2026-07-21 review hold up under a fresh check (`docs/QUICKSTART-VIM.md`, `docs/VIM-SYNTAX.md`, `docs/BUILD.md`'s filename references). Five documented procedures were live-tested, not just read, and all reproduced exactly what their docs describe. `docs/POEM-TO-YAML.md` now documents the incremental-rebuild/`--force` behaviour the 2026-07-21 review found missing. `CHANGELOG.md` is in good order, matching `package.json`'s version with no stray `RELEASE_NOTES_*.md` duplicates remaining. A repo-wide grep for historical phrasing found only two real violations of CLAUDE.md's as-built principle (both below).

### F-DOC-01 — `scripts/edit-poem`'s documented "no match" exit code doesn't match its actual behaviour · **Low**

**Evidence:** Both `scripts/edit-poem` and `docs/SCRIPTS.md` document the no-match exit code as `-1`. Live-tested: it actually exits `255` (bash wraps a negative `exit` value to unsigned 8-bit).

**Impact:** Minor — a personal-author-facing script, not something automation currently branches on — but a documented, testable claim that is simply wrong in two places.

**Direction:** Document the real value (`255`), or change the script to `exit 1` and update both docs to match. Addressed by R-15.

### F-DOC-02 — `docs/BUILD.md` still carries one migration-narrative sentence contrary to CLAUDE.md's as-built principle · **Low**

**Evidence:** `docs/BUILD.md:163-165` explains current rewrite-on-build behaviour with a parenthetical "(from before this data island existed)" — exactly the "previously"/historical-justification phrasing CLAUDE.md's "Documentation principles" section bans.

**Impact:** Small and isolated, but it's precisely the pattern CLAUDE.md calls out by name, in the same file the 2026-07-21 review already had to fix three other drift issues in.

**Direction:** Drop the historical parenthetical; the behaviour itself can stay documented. Addressed by R-15.

### F-DOC-03 — `docs/BUILD.md`'s File Structure diagram describes `poetic.js` as "Audiomack"-specific and omits its second responsibility · **Low**

**Evidence:** The diagram calls it a "shared Audiomack loader," but the file's own header comment says it's provider-agnostic (Audiomack, YouTube, Spotify, …), and the same file's second half implements the postscript "See more" toggle — a second responsibility not mentioned at all.

**Impact:** Someone using this diagram as a map would look in the wrong conceptual place for either the multi-provider embed logic or the postscript-toggle behaviour.

**Direction:** Reword the comment to reflect both responsibilities. Addressed by R-15.

## Governance and project health (GOV)

**Strengths:** The self-review/bus-factor disclosure from the 2026-07-21 review is still present, accurate, and consistent across `CLAUDE.md` and `SECURITY.md` — re-verified against live GitHub state (`gh api .../collaborators` still shows exactly the two accounts `CODEOWNERS` names), not just re-read. The MIT/CC BY-NC-ND 4.0 licence split remains sound. The absence of CONTRIBUTING.md/issue templates/a formal roadmap was re-checked, not assumed, and still doesn't read as a real gap at this project's scale (all four issues ever filed were opened and closed same-day by the maintainer's own tooling). The tech-debt claiming workflow continues to function as documented, with no stuck items or ID collisions.

### F-GOV-01 — The tech-debt process can mark a multi-part item "resolved" while one part is explicitly left undone, with no new entry tracking the remainder · **Low**

**Evidence:** `TECH-DEBT.md`'s Ledger lists TD26072118 as resolved, but its closing commit's own message says one of the four things the item's title claims were fixed was deliberately not fixed ("Browser-renderer error classification... left as-is"). No new `TD*` ID was filed for that residual piece.

**Impact:** The Ledger is meant to be the authoritative record of what's outstanding, and per CLAUDE.md's "Review provenance" section, the pipeline's tooling relies on exactly this file to decide whether work is done. A "resolved" row that quietly retires a partially-completed item means the next reviewer has to re-discover the gap from scratch.

**Direction:** When closing a batched item with an explicit partial deferral, file the deferred piece as its own new `TD*` entry in the same PR. Addressed together with F-UX-03 by R-14.

## Observability and operations (OPS)

Applicability note: this project is a CLI build tool plus an optional push/cron-triggered sync script, not a long-running service — metrics, tracing, alerting, and health checks are inapplicable, and backup/restore is inapplicable since `sync-blogger.js` is explicitly stateless (it derives all state from Blogger itself each run) and `needs-rebuild.js`'s manifest is an admitted best-effort dev-convenience cache.

**Strengths:** `sync-blogger.js`'s failure-diagnosis functions act as an embedded runbook: every 401/403/404/`invalid_grant` case gets a specific, actionable diagnosis. No secrets are ever logged. `fetchWithRetry` gives every network call a consistent 30s timeout plus one bounded retry — no retry-storm risk — and CI's concurrency group plus job timeout prevent overlapping/runaway runs.

### F-OPS-01 — `fetchWithRetry`'s network-rejection retry can duplicate-post a poem on `createPost` · **Medium**

**Evidence:** `fetchWithRetry()` retries once, unconditionally, whenever the fetch rejects (network failure or the 30s timeout firing) — used uniformly for every network call including `createPost()`, the one non-idempotent call in the set. If the first request actually reaches Blogger and is processed, but the response is lost to the client, the identical POST body is retried, creating a duplicate post. There is no idempotency key and no re-check against existing posts before or after the retry.

**Impact:** Bounded to a single retry (no storm risk), and requires an unlucky timing window that is uncommon but real over any timeout/retry combination on a real network. The failure mode is a silently duplicated live post requiring manual cleanup — a poor outcome for a tool whose own docstring calls it a "stateless" publisher safely re-runnable at any time.

**Direction:** Exempt `createPost` from the rejection-retry path, or re-check for a same-slug post before retrying it. Addressed by R-06.

### F-OPS-02 — `serve-static.js` has no signal handling / graceful shutdown · **Low**

**Evidence:** No `process.on('SIGINT'|'SIGTERM', ...)` anywhere in the file. `package.json`'s `stop` script sends a bare `SIGTERM`; with no listener registered, Node's default behaviour terminates the process immediately without draining in-flight responses.

**Impact:** Low real-world impact — a local, loopback-bound dev server with nothing stateful to flush. Flagged because the checklist asks about graceful shutdown and it's simple to add.

**Direction:** Add a `server.close()` on `SIGINT`/`SIGTERM`. Addressed by R-16.

## Data handling and privacy (DATA)

**Strengths:** The only sensitive data surface — Blogger OAuth credentials — is handled carefully: gitignored, written atomically at mode 0600, re-checked on every read. All Blogger/Google API traffic is HTTPS-only. The one committed credentials-shaped fixture contains only obviously-fake placeholder values. A fresh grep for anything email-shaped across poem sources, examples, and fixtures found only framework-authored placeholders — no real personal data anywhere in the tree. Regulatory exposure remains inapplicable: poem text is user-authored creative content the poet chooses to publish, not personal data collected about a third party.

### F-DATA-01 — Interactive `blogger-auth.js` run prints the refresh token and OAuth access token to the terminal in full · **Low**

**Evidence:** `blogger-auth.js` prints the freshly-minted refresh token unmasked to stdout — deliberate and necessary, since the tool's purpose is to mint that token and hand it to the operator to store as a GitHub Actions secret.

**Impact:** Not miscategorised as an oversight — flagged only because it's the one place in the codebase where a long-lived, high-privilege credential is written to an output stream (terminal scrollback) rather than to the already-hardened credentials file. The later "next steps" summary correctly redacts the same value; only the one-time mint moment is unmasked, which is unavoidable given the tool's purpose.

**Direction:** No code change needed; consider a one-line caveat in the console output about avoiding pasting the value elsewhere. Not assigned a recommendation — informational only, per the finding's own conclusion.
