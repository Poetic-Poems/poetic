# Recommendations

Ordered by severity first, then effort (quick wins before long campaigns at equal severity). There is one High-severity item this cycle (the unpatched `markdown-it` advisory), six Medium findings, and a tail of small Low-severity cleanups. Twelve findings — F-ARCH-01/02/03/04, F-CODE-01/02/03, F-TEST-02, F-PERF-01/02, F-GOV-01/02, F-OPS-01, F-DATA-01 — are judged, on consolidation, as not warranting a dedicated recommendation at the project's current scale: each is either purely informational, explicitly judged in its own findings entry as "no action needed"/"not urgent", or (F-CODE-01) a real complexity hot-spot whose own evidence concludes no change is needed to ship today. They remain recorded in `02-findings.md` as watch items, to avoid tracking work nobody intends to do.

| ID | Recommendation | Severity | Effort | Addresses | Issue |
|---|---|---|---|---|---|
| R-01 | Merge the already-open `markdown-it` security-fix PR | High | Small | F-SEC-01, F-DEPS-01 | #297 |
| R-02 | Document the `$ref` postscript-note shape in `YAML-SCHEMA.md` | Medium | Small | F-DOC-01 | #298 |
| R-03 | Fix or retire the stale `_example.yaml` reference file | Medium | Small | F-DOC-02 | #299 |
| R-04 | Give `serve-static.js` a clean `EADDRINUSE` error message | Medium | Small | F-UX-01 | #300 |
| R-05 | Add shell-test coverage for the changelog grammar/assembly scripts | Medium | Medium | F-TEST-01 | #301 |
| R-06 | Sync the PR template and README checklists with the CI gates they claim to mirror | Low | Small | F-TOOL-01, F-DOC-03 | #302 |
| R-07 | Tend to the Dependabot backlog: raise the open-PR cap and consider a stale-rebase nudge | Low | Small | F-DEPS-02, F-CI-01 | #303 |
| R-08 | Run `shellcheck` in CI over the scripts that already assume it | Low | Small | F-CI-02 | #304 |
| R-09 | Bound `blogger-auth.js`'s OAuth redirect wait with a timeout | Low | Small | F-OPS-02 | #305 |
| R-10 | Enable secret-scanning on the repository | Low | Small | F-SEC-02 | #306 |

## R-01 — Merge the already-open `markdown-it` security-fix PR

**Severity:** High · **Effort:** Small · **Addresses:** F-SEC-01, F-DEPS-01 · **Issue:** #297

**Current state:** `markdown-it` is pinned at a version range (15.0.0-15.0.2) with a published high-severity ReDoS advisory (GHSA-vfgh-jcmw-g37q / GHSA-gfr2-rv44-r23c), directly applicable to this project's `html: true` configuration (`src/tools/markdown.js:29`). Dependabot PR #291 already bumps to the fixed version (15.0.3) and is `MERGEABLE`, but its `build` job is red — not on the bump itself, but on `npm run check:licenses` rejecting `argparse@3.0.3`'s PSF-2.0 licence, a problem `main` already fixed (commit `c0f8460`/#292) after #291's branch point.

**Intended end state:** `markdown-it` is at 15.0.3 (or later) on `main`, `npm audit` reports zero vulnerabilities, and PR #291 (or its successor) is merged clean.

**Approach:** rebase #291 onto current `main` (`@dependabot rebase` or an equivalent manual rebase + `git push --force-with-lease`) so its `build` job picks up the already-landed licence-allowlist fix, then merge once green and reviewed. No code change beyond the dependency bump itself is required.

## R-02 — Document the `$ref` postscript-note shape in `YAML-SCHEMA.md`

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DOC-01 · **Issue:** #298

**Current state:** `docs/YAML-SCHEMA.md`'s "Postscript Notes" section documents only the `{ label?, params?, content }` shape. `poem-to-yaml.js` also emits a `{ $ref: "<file>#<path>" }` form for `<<<...>>>` literal-block references, and `docs/POEM-TO-YAML.md` explicitly (but wrongly) promises this shape is documented in `YAML-SCHEMA.md`.

**Intended end state:** `docs/YAML-SCHEMA.md` has a subsection documenting the `$ref` postscript-entry shape, with a worked example generated from real converter output (the same approach the prior review's R-01/#226 used for the `parts` field).

**Approach:** run `node src/tools/poem-to-yaml.js` against `src/poems/poem/_example.poem` (or a fixture with a `$ref` postscript block) and use the real output as the worked example; add it alongside the existing `label`/`params`/`content` documentation.

## R-03 — Fix or retire the stale `_example.yaml` reference file

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DOC-02 · **Issue:** #299

**Current state:** `docs/POEM-TO-YAML.md` points to `src/poems/yaml/_example.yaml` as "Expected YAML output for the example," but that file hasn't been regenerated since `_example.poem` was last edited (2026-07-19) and now disagrees with the real converter output in two places (a missing escaped-`%` clause; a missing `example.preamble` directive entry). `test/golden/_example.yaml` is the fixture CI actually protects and is correct.

**Intended end state:** either `src/poems/yaml/_example.yaml` matches current `convertPoemToYaml()` output exactly and a test guards that it stays that way, or `docs/POEM-TO-YAML.md`'s "Related Files" pointer is removed/redirected to `test/golden/_example.yaml` as the single documented reference.

**Approach:** the lower-effort route is to drop the stale pointer and rely on the already-correct, already-tested `test/golden/_example.yaml`; the alternative (regenerate `_example.yaml` + add a freshness test) duplicates work `golden.test.js` already does. Pick whichever the maintainer prefers; both are small.

## R-04 — Give `serve-static.js` a clean `EADDRINUSE` error message

**Severity:** Medium · **Effort:** Small · **Addresses:** F-UX-01 · **Issue:** #300

**Current state:** `createServer()`/`main()` in `src/tools/serve-static.js` has no `server.on('error', ...)` handler, so a port collision on `npm start` crashes with a raw Node.js stack trace instead of a clear instruction.

**Intended end state:** starting the dev server on an already-bound port prints a one-line message naming the conflict and pointing at `--port`/`$PORT`, then exits 1 — no unhandled exception, no stack trace.

**Approach:** add a `server.on('error', (err) => { ... })` handler before `server.listen(...)` that special-cases `err.code === 'EADDRINUSE'` with a `console.error(...)` + `process.exit(1)`, matching the clean-error style `poem-to-yaml.js`/`yaml-to-poem.js` already use elsewhere in the tool suite.

## R-05 — Add shell-test coverage for the changelog grammar/assembly scripts

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-TEST-01 · **Issue:** #301

**Current state:** `lib/changelog-grammar.sh`, `scripts/check-changelog-section.sh`, and `scripts/assemble-changelog.sh` (added 2026-09-26, PR #263) implement a non-trivial hand-written grammar walker with zero automated test coverage. `check-changelog-section.sh` backs a required status check; `assemble-changelog.sh` is release-critical.

**Intended end state:** a test suite (bats, or `node --test` cases that `spawnSync` the scripts — `test/sync-framework.test.js` already does this for a comparably complex shell script) exercises `lib/changelog-grammar.sh`'s state machine directly: fenced-code/HTML-comment edge cases, `None.` vs category sections, duplicate categories, and the `--check`/`--since` paths of `assemble-changelog.sh`.

**Approach:** start from the edge cases the scripts' own comments already anticipate (their `# shellcheck` annotations and inline rationale are a good source of "what should I test"); keep tests hermetic (no real git network calls — `sync-framework.test.js`'s pattern of building throwaway local repos applies here too).

## R-06 — Sync the PR template and README checklists with the CI gates they claim to mirror

**Severity:** Low · **Effort:** Small · **Addresses:** F-TOOL-01, F-DOC-03 · **Issue:** #302

**Current state:** both `.github/PULL_REQUEST_TEMPLATE.md`'s checklist and `README.md`'s "Local development" section claim to list the same checks CI runs, but each omits different items from `build-poems.yml`'s actual step list (`lint`/`coverage`/`check:licenses` missing from the template; `build`/`check:build` missing from the README).

**Intended end state:** both lists name every blocking check `build-poems.yml`'s `build` job actually runs (optionally noting `npm run a11y` as non-blocking), so a contributor who follows either list precisely won't be surprised by CI.

**Approach:** positive reason to bundle: both findings are the same root cause (a checklist meant to mirror CI's step list has drifted from it) and the fix touches two small, unrelated files in one pass. Either hand-expand both lists to match `build-poems.yml`, or replace one of them with a pointer to the other so there's a single place this list is maintained.

## R-07 — Tend to the Dependabot backlog: raise the open-PR cap and consider a stale-rebase nudge

**Severity:** Low · **Effort:** Small · **Addresses:** F-DEPS-02, F-CI-01 · **Issue:** #303

**Current state:** `.github/dependabot.yml`'s `open-pull-requests-limit: 5` for the `npm` ecosystem is currently exactly saturated (5 open PRs), so Dependabot will silently skip opening a PR for any new advisory until one closes. Separately, Dependabot's default rebase trigger (merge conflict only) never fires for a PR like #291 that's unconflicted but CI-red against a moved base.

## Default: raise `open-pull-requests-limit` to give headroom; leave the rebase-nudge workflow for a follow-up only if staleness recurs often enough to be annoying

**Intended end state:** the `npm` ecosystem's cap has enough headroom that a new advisory isn't silently deferred by a full queue; optionally, a scheduled workflow comments `@dependabot rebase` on any open Dependabot PR whose required check has been red for more than a few days.

**Approach:** bundled because both are Dependabot-queue housekeeping likely touched in the same pass over `.github/dependabot.yml` and/or a new lightweight workflow. Raising the cap (e.g. to 8-10) is the lower-effort half and should land regardless; the rebase-nudge workflow is optional follow-up, not required this cycle.

## R-08 — Run `shellcheck` in CI over the scripts that already assume it

**Severity:** Low · **Effort:** Small · **Addresses:** F-CI-02 · **Issue:** #304

**Current state:** several scripts under `scripts/` already carry `# shellcheck source=`/`# shellcheck disable=` directives, implying the author runs `shellcheck` locally, but no CI job runs it.

**Intended end state:** a CI step (in `build-poems.yml` or its own lightweight workflow) runs `shellcheck` over `scripts/*.sh` and `.githooks/*` and fails the build on a new warning.

**Approach:** add a `shellcheck-action`-style step (or a plain `shellcheck scripts/*.sh .githooks/*` invocation) scoped to the files that already carry directives; the directives themselves mean this should pass clean on day one.

## R-09 — Bound `blogger-auth.js`'s OAuth redirect wait with a timeout

**Severity:** Low · **Effort:** Small · **Addresses:** F-OPS-02 · **Issue:** #305

**Current state:** `waitForCode()` (`src/tools/blogger-auth.js:344-395`) waits indefinitely for the browser's OAuth redirect, with no timer — the one outbound-call-adjacent path in this tool that doesn't share the 30-second timeout discipline the rest of the Blogger tooling applies consistently.

**Intended end state:** an abandoned `npm run blogger:auth` run (browser tab closed, consent screen errored silently) self-terminates after a generous bound (e.g. 5 minutes) with a clear "timed out waiting for the browser redirect, rerun the command" message, instead of requiring a manual Ctrl-C.

**Approach:** wrap the existing `waitForCode()` promise with a timeout (e.g. `Promise.race` against a `setTimeout`), closing the loopback listener on timeout the same way the existing code/error paths already do.

## R-10 — Enable secret-scanning on the repository

**Severity:** Low · **Effort:** Small · **Addresses:** F-SEC-02 · **Issue:** #306

**Current state:** no `.github/workflows/` job runs a secret scanner (gitleaks/trufflehog), and `SECURITY.md` documents CodeQL but not secret scanning. GitHub's own repository-settings secret-scanning/push-protection feature may or may not already be on — that setting isn't visible from a clone.

## Default: enable GitHub's native secret-scanning + push-protection feature for the repository

Owner decision: yes

**Intended end state:** the repository has an auditable secret-scanning gate — either GitHub's native feature (toggled in repo Settings → Code security) or, if that's unavailable, a `gitleaks-action` CI step — that would catch an accidental credential commit even when the one required reviewer (self-review, by this repo's own design) misses it.

**Approach:** two candidate fixes: (a) toggle on GitHub's built-in secret scanning + push protection — no code change, but requires repo-admin access to the Settings UI, hence the owner-decision marker; or (b) add a `gitleaks-action` step to CI if the native feature isn't available on this repository's plan/visibility tier. (a) is the default since it needs no new CI dependency and GitHub's native scanning already covers public and (on paid tiers) private repos.
