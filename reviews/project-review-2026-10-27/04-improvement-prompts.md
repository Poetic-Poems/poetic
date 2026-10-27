# Improvement prompts

One prompt per recommendation, in `03-recommendations.md`'s priority order. Each prompt is self-contained and may be pasted into a fresh AI agent session with no other context. No prompt in this set depends on another's output, so they may be run in any order or in parallel — the one exception, noted in R-10's prompt, is that its primary fix is a repo-settings toggle outside any agent's reach.

## Prompt for R-01 — Merge the already-open `markdown-it` security-fix PR

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic (a Node.js
framework for authoring/publishing plain-text poems). `npm audit` on `main`
reports a HIGH-severity advisory: `markdown-it` 15.0.0-15.0.2 has a
quadratic-time ReDoS vulnerability (GHSA-vfgh-jcmw-g37q /
GHSA-gfr2-rv44-r23c) in inline HTML parsing, directly applicable because
`src/tools/markdown.js` constructs `new MarkdownIt({ html: true, ... })`.

The fix already exists as open Dependabot PR #291, which bumps
`markdown-it` to 15.0.3 and is reported `MERGEABLE` by
`gh pr view 291 --json mergeable,mergeStateStatus`. Its `build` CI job is
nonetheless failing — not because of the version bump itself, but because
the PR's branch predates commit `c0f8460` (PR #292, "fix(deps): allow
PSF-2.0 licence for argparse 3.0.3+"), which already fixed the actual
cause of the failure on `main`. Confirm this diagnosis yourself before
acting: `gh pr checks 291` and `gh run view <failing-run-id> --log-failed`
should show the `check:licenses` step rejecting `argparse@3.0.3`'s
PSF-2.0 licence — a problem `main` no longer has.

Goal: get `markdown-it` to 15.0.3+ on `main` with `npm audit` reporting
zero vulnerabilities, via PR #291 (or a fresh equivalent PR if #291 can't
be updated directly).

Steps:
1. Try `gh pr comment 291 --body "@dependabot rebase"` first — this is the
   standard, lowest-effort path and needs no local checkout.
2. If that doesn't resolve within a reasonable wait, or you don't have
   comment rights, check out #291's branch locally, rebase it onto current
   `main`, and push with `git push --force-with-lease` (this is the one
   force-push this project's branch-protection conventions explicitly
   allow, specifically to publish a rebase).
3. Re-run `gh pr checks 291` and confirm every check — `build`,
   `changelog-section`, both CodeQL legs, `commit-format`, `changelog-check`
   — is green.
4. Do not merge the PR yourself unless you are the repository's own
   maintainer tooling with merge rights under its documented self-review
   process (see `AGENTS.md`'s "Branch workflow" section) — otherwise, leave
   it ready for the maintainer's review.

Constraints: do not touch any file other than what the rebase itself
changes (i.e. don't hand-edit `package.json`/`package-lock.json` outside
what `npm update markdown-it` or the existing Dependabot diff already
does). Do not force-push any branch other than #291's own.

Verification: `npm audit` on the rebased branch shows no markdown-it
advisory; `gh pr checks 291` is all-green; `gh pr view 291 --json
mergeable,mergeStateStatus` reports `MERGEABLE`/not `BLOCKED` on CI
(it may still show `REVIEW_REQUIRED` — that's expected and not yours to
resolve).

Work cost-consciously. This whole task is mechanical (a rebase and a
status check) and suits a low-cost model tier — there is no design
judgement involved. Report back with the PR's final `gh pr checks` output.

Deliverable: PR #291, rebased and green, left ready for review (or merged,
if you hold that authority).
```

## Prompt for R-02 — Document the `$ref` postscript-note shape in `YAML-SCHEMA.md`

**Bundles:** R-02 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic, a Node.js
framework that converts a plain-text `.poem` format to YAML
(`src/tools/poem-to-yaml.js`) and documents that YAML shape in
`docs/YAML-SCHEMA.md`.

The problem: `docs/YAML-SCHEMA.md`'s "Postscript Notes" section documents
postscript array entries as having only `{ label?, params?, content }`.
But `poem-to-yaml.js` also emits a second shape for a `<<<...>>>`
literal-block reference: `{ $ref: "<file>#<jsonPath>" }`. You can see this
yourself by running:
    node src/tools/poem-to-yaml.js src/poems/poem/_example.poem
and inspecting the `postscript:` array in its output — one entry is a
`$ref` object, not a `label`/`content` object. `docs/POEM-TO-YAML.md`
line ~73 already promises "See `docs/YAML-SCHEMA.md` for the exact
shapes," but that shape isn't there. This is the same class of gap a
prior review cycle found and fixed for the `parts` mixed-segment field
(see `docs/YAML-SCHEMA.md`'s existing "parts" subsection for the pattern
to follow).

Goal: add a subsection to `docs/YAML-SCHEMA.md`'s Postscript Notes section
documenting the `$ref` shape, placed alongside the existing
`label`/`params`/`content` documentation, following the same style
(prose + a YAML code block showing a real worked example).

Steps:
1. Find or construct a `.poem` fixture with a `<<<...>>>` postscript
   reference block (the framework's own `src/poems/poem/_example.poem`
   already has one).
2. Run the converter against it and copy its *actual* output into the new
   doc subsection — don't hand-type a guessed shape.
3. Add one or two sentences explaining when the parser produces `$ref`
   instead of a bare `content` string (i.e. when the postscript note is a
   `<<<...>>>` reference to another file/path rather than inline content).

Constraints: this is a documentation-only change — do not modify
`poem-to-yaml.js`, `yaml-to-poem.js`, or any other source file. Match the
existing doc's heading levels, tone, and example style exactly. British
English spelling, consistent with the rest of this repository's docs.

Verification: re-run the converter command above and confirm the doc's new
example matches the real output byte-for-byte. Run `npm run check`
(trailing-whitespace gate) to confirm the new Markdown is clean.

Work cost-consciously; this is a small, mechanical documentation task
suited to a low-cost model tier.

Deliverable: a diff to `docs/YAML-SCHEMA.md` adding the `$ref` subsection,
with a one-line summary of the change.
```

## Prompt for R-03 — Fix or retire the stale `_example.yaml` reference file

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic. Its
`docs/POEM-TO-YAML.md` ("Related Files" section) points to
`src/poems/yaml/_example.yaml` as "Expected YAML output for the example"
(i.e. for `src/poems/poem/_example.poem`). That committed file has drifted
from reality: run
    node -e "const {convertPoemToYaml}=require('./src/tools/poem-to-yaml.js'); console.log(convertPoemToYaml('src/poems/poem/_example.poem'))"
(or the project's own CLI invocation — check `poem-to-yaml.js --help` for
the exact single-file usage) and diff the result against
`src/poems/yaml/_example.yaml`. You should find at least two
discrepancies: a missing escaped-`%` clause in the Stanza 2 text, and a
missing `example.preamble` entry in the `directives` array. By contrast,
`test/golden/_example.yaml` — the fixture `test/golden.test.js` actually
asserts against — matches current output exactly; only the doc-cited copy
in `src/poems/yaml/` is stale.

Goal: `docs/POEM-TO-YAML.md` no longer points a reader at a wrong "expected
output" file. Two acceptable end states — pick whichever is less work once
you've looked at both:
(a) regenerate `src/poems/yaml/_example.yaml` to match current converter
    output exactly, and add a test (alongside the existing
    `test/golden.test.js` pattern) that fails if it drifts again; or
(b) remove `docs/POEM-TO-YAML.md`'s pointer to
    `src/poems/yaml/_example.yaml` and instead point readers at
    `test/golden/_example.yaml`, which is already correct and already
    protected by CI.

Constraints: do not change `poem-to-yaml.js`'s actual conversion behaviour
— this is a docs/fixture consistency fix, not a feature change. If you
choose (a), `src/poems/yaml/_example.yaml` must end up byte-identical to
real converter output; if you choose (b), delete or clearly repurpose the
stale file rather than leaving two reference copies in different states of
correctness.

Verification: run the full test suite (`npm test`) and confirm it still
passes 827+/0 fail. If you chose (a), confirm your new freshness test
actually fails against the *old* (pre-fix) file content, then passes
against the regenerated one (i.e. prove the test would have caught this).
Run `npm run check` for trailing whitespace.

Work cost-consciously; this is a well-specified mechanical task (diff two
files, fix or redirect) suited to a low-cost model tier.

Deliverable: a diff implementing whichever of (a)/(b) you chose, with a
one-line explanation of which you picked and why.
```

## Prompt for R-04 — Give `serve-static.js` a clean `EADDRINUSE` error message

**Bundles:** R-04 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic, a Node.js
framework whose local dev server lives at `src/tools/serve-static.js`
(exported `createServer(rootDir, opts)` plus a CLI entry point invoked via
`npm start`).

The problem: `createServer()` calls `server.listen(PORT, HOST, callback)`
with no `server.on('error', ...)` handler anywhere in the file. If the
chosen port is already bound (e.g. another `npm start` is still running),
the process crashes with Node's raw, internal `EADDRINUSE` stack trace
instead of a clear instruction. Reproduce it yourself: start the server
once, then start a second instance on the same port, and observe the
unhandled-exception output.

Goal: starting the dev server on an already-bound port prints one clear,
actionable line (naming the conflicting port and pointing at the `--port`
flag / `$PORT` env var as the way to pick a different one) and exits with
code 1 — no stack trace, no unhandled exception.

Steps:
1. Add a `server.on('error', (err) => { ... })` handler, registered before
   `server.listen(...)` is called, in the same function/CLI entry point
   that currently calls `listen`.
2. Special-case `err.code === 'EADDRINUSE'` with a one-line
   `console.error(...)` message, then `process.exit(1)`.
3. For any other `error` event, preserve reasonable behaviour (re-throw or
   print the error and exit non-zero) — don't silently swallow unrelated
   listen failures.
4. Match the existing error-message style this tool suite already uses
   elsewhere (e.g. `poem-to-yaml.js`/`yaml-to-poem.js`'s clean one-line
   `Error ...: <reason>` messages) rather than inventing a new format.

Constraints: do not change the server's public behaviour on a *successful*
bind (same startup banner, same graceful-shutdown handling on
SIGINT/SIGTERM — don't touch those). Keep the fix inside
`src/tools/serve-static.js`.

Verification: write or extend a test in `test/serve-static.test.js` that
starts two servers on the same port (bind the first to a fixed port via
`server.listen(0, ...)` won't reproduce this — you need a real, deliberate
collision; consider having the first `createServer` instance bind, grab
its actual port via `server.address().port`, then start a second instance
explicitly asking for that same port) and asserts the second one's
failure path is a clean message, not an unhandled exception, with a
non-zero exit code. Run the full suite (`npm test`) to confirm nothing
else regressed.

Work cost-consciously; implementation is straightforward but the test
needs a moment of care to reliably force the collision — a mid-cost model
tier suits this task; delegate nothing, it's small enough to do directly.

Deliverable: a diff to `src/tools/serve-static.js` plus a new/extended test
in `test/serve-static.test.js`, with a short summary of the change.
```

## Prompt for R-05 — Add shell-test coverage for the changelog grammar/assembly scripts

**Bundles:** R-05 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic, a Node.js
framework. Its release process depends on three shell scripts added
2026-09-26 (PR #263): `lib/changelog-grammar.sh` (a shared grammar state
machine for parsing a pull request's `## Changelog` section),
`scripts/check-changelog-section.sh` (uses that grammar to back the
required `changelog-section` CI check — i.e. it can block or wrongly pass
a PR), and `scripts/assemble-changelog.sh` (uses the same grammar to fold
every merged PR's description into `CHANGELOG.md`'s `[Unreleased]` section
at release time — a bug here can corrupt a release's changelog with
nothing automated to catch it). None of these three scripts has any
automated test coverage today — confirm with
`grep -rln 'check-changelog-section\|changelog-grammar\|assemble-changelog' test/`
(expect no output).

Goal: `lib/changelog-grammar.sh`'s state machine, and the two scripts that
use it, have automated test coverage exercising their edge cases — so a
future change to the grammar can be checked against a real regression
suite instead of "it worked on the PRs tried so far."

Steps:
1. Read `lib/changelog-grammar.sh` in full first — understand its state
   machine (section-heading detection, the `None.` sentinel, fenced-code
   and HTML-comment handling) before writing tests against it.
2. Follow the existing pattern in `test/sync-framework.test.js`, which
   tests a comparably complex shell script from Node's test runner via
   `child_process.spawnSync` against real (but hermetic/local, never
   networked) fixture input — do the same here rather than introducing a
   new test framework (e.g. bats) unless you have a strong reason to
   prefer it.
3. Cover at minimum: a well-formed `## Changelog` section with multiple
   category sub-headings; the `None.` sentinel case; a fenced code block
   or HTML comment inside the section (to confirm the grammar doesn't
   mis-parse markdown syntax as its own grammar); a malformed/missing
   section (should fail `check-changelog-section.sh` the way it's
   supposed to); and `assemble-changelog.sh`'s `--check`/`--since` flags
   specifically.
4. Where you find a genuine behavioural bug while writing tests (not just
   a documentation gap), fix it as part of this same PR and note the fix
   in your summary — but do not refactor the grammar's actual logic
   beyond what a real bug fix requires.

Constraints: tests must be fully hermetic — no real network calls, no
dependency on the actual GitHub API or a real PR. Do not change
`lib/changelog-grammar.sh`'s behaviour except to fix a genuine bug you
find and can demonstrate with a failing-then-passing test.

Verification: run the new tests (`npm test` or the specific test file) and
confirm they pass; run `npm run check` for trailing whitespace; if you
have `shellcheck` available, run it over the three scripts and fix
anything it flags (this overlaps with R-08 — if that work has already
landed, just confirm your new test files pass shellcheck too).

Work cost-consciously. Writing straightforward test cases against clearly
specified grammar rules suits a mid-cost model tier; reserve a
high-capability tier only if you discover and need to fix a genuine
parsing bug in the grammar itself, since that's exactly the kind of
subtle, consequential logic this task exists to protect.

Deliverable: new test file(s) covering the three scripts, a short summary
of what's covered, and (if applicable) a description of any bug found and
fixed.
```

## Prompt for R-06 — Sync the PR template and README checklists with the CI gates they claim to mirror

**Bundles:** R-06 bundles F-TOOL-01 and F-DOC-03 — both are the same root cause (a checklist meant to mirror CI's actual step list has drifted from it), the fix touches two small, otherwise-unrelated files in one pass, and splitting them into two PRs would just be two tiny PRs about the same oversight. · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic, a Node.js
framework. Two places in this repo claim to list "the same checks CI
runs" and both have drifted from `.github/workflows/build-poems.yml`'s
actual `build` job, which runs, in order: `npm test`, `npm run coverage`,
`npm run lint`, `npm run check:licenses`, `npm run check`, `npm run build`,
`npm run check:build`, then a non-blocking `npm run a11y`.

Problem 1: `.github/PULL_REQUEST_TEMPLATE.md`'s checklist (around lines
27-33) lists only Conventional Commits format, `npm run check`, `npm run
build`, `npm test`, and "Documentation updated" — it's missing `npm run
lint`, `npm run coverage`, and `npm run check:licenses`.

Problem 2: `README.md`'s "Local development" section (around lines
386-394), which explicitly says "run these commands locally to catch
problems CI will gate on," lists only `npm test`, `npm run lint`, `npm run
coverage`, `npm run check`, `npm run check:licenses` — it's missing `npm
run build` and `npm run check:build`.

Goal: both lists name every blocking check `build-poems.yml`'s `build` job
actually runs (you may note `npm run a11y` too, but mark it explicitly
non-blocking since the workflow runs it with `continue-on-error: true`).

Steps:
1. Read `.github/workflows/build-poems.yml`'s `build` job top to bottom
   yourself to confirm the exact, current step list and order — don't
   trust this prompt's summary as the final word; the workflow file is
   ground truth.
2. Update `.github/PULL_REQUEST_TEMPLATE.md`'s checklist to include the
   three missing checks.
3. Update `README.md`'s "Local development" section to include the two
   missing checks.
4. Consider (optional, your judgement): rather than maintaining the same
   list twice, having the PR template point to README's "Local
   development" section instead of repeating the list — this removes the
   duplication that let the two drift independently in the first place.
   Only do this if it doesn't make the template noticeably less
   convenient to use inline on GitHub.

Constraints: documentation-only change; do not modify
`build-poems.yml` itself or any npm script. Keep each file's existing
tone/format (the PR template's checklist style, the README's prose style).

Verification: read both updated files back against the current
`build-poems.yml` step list and confirm every blocking step appears in
both. Run `npm run check` to confirm no trailing whitespace was
introduced.

Work cost-consciously; this is a small, mechanical documentation-sync task
suited to a low-cost model tier.

Deliverable: a diff touching `.github/PULL_REQUEST_TEMPLATE.md` and
`README.md`, with a one-line summary.
```

## Prompt for R-07 — Tend to the Dependabot backlog: raise the open-PR cap and consider a stale-rebase nudge

**Bundles:** R-07 bundles F-DEPS-02 and F-CI-01 — both are Dependabot-queue housekeeping, likely touched in the same pass over `.github/dependabot.yml` and/or a new workflow file. · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic. Its
`.github/dependabot.yml` sets `open-pull-requests-limit: 5` for the `npm`
ecosystem, and at review time exactly 5 npm Dependabot PRs are open —
meaning any *new* npm advisory or release right now would get silently
deferred (no PR opened, no error, no notification) until one of the five
closes. Separately, Dependabot's default rebase behaviour only re-rebases
a PR on a *merge conflict*, never on a red status check against an
unconflicted base — so a PR like #291 (bump markdown-it; see this review's
other recommendation about it) can sit CI-red indefinitely with no bot
action, purely because `main` moved underneath it.

Goal (primary, do this): raise `.github/dependabot.yml`'s
`open-pull-requests-limit` for the `npm` ecosystem from 5 to something
with real headroom (e.g. 8-10), so the queue isn't sitting exactly at
capacity under ordinary conditions.

Goal (optional follow-up, only if you have time/the maintainer wants it):
add a small scheduled GitHub Actions workflow that finds any open
Dependabot PR whose required status check has been failing for more than
a few days and comments `@dependabot rebase` on it, closing the gap the
default rebase trigger leaves.

Steps:
1. Edit `.github/dependabot.yml`'s `npm` ecosystem block's
   `open-pull-requests-limit` value. Leave the `github-actions` ecosystem
   block as-is unless you have reason to believe it has the same problem
   (check `gh pr list --search "is:open author:app/dependabot"` first).
2. If you choose to also build the optional nudge workflow: look at
   `.github/workflows/required-checks-drift.yml` as a model for this
   repo's style of self-maintaining, scheduled GitHub Actions workflow
   (clear inline rationale, minimal permissions, a single well-defined
   job). Use `gh pr list --search "..." --json number,statusCheckRollup`
   (or the GraphQL API) to find candidates, and `gh pr comment <n> --body
   "@dependabot rebase"` to act.

Constraints: do not disable or weaken any existing required check as a
side effect. If you add the nudge workflow, give it the minimum
`permissions:` block it needs (this repo's other workflows are a good
model — read a couple of them for the pattern) and do not have it merge
or approve anything itself.

Verification: for the primary fix, confirm
`.github/dependabot.yml` parses correctly (`yamllint` or just eyeball the
YAML) and the new limit is clearly higher than the current backlog size.
For the optional workflow, if you build it, test it against a real but
harmless case first (e.g. dry-run logging which PRs it *would* comment on
without actually commenting) before enabling the comment action for real.

Work cost-consciously. The primary fix is a one-line config change suited
to a low-cost model tier. The optional nudge workflow is small
cross-cutting CI design work; if you build it, a mid-cost tier should
handle it, but have a human (or a high-capability review pass) check the
permissions scoping before it's allowed to actually post comments
unattended.

Deliverable: a diff to `.github/dependabot.yml` (required), optionally
plus a new workflow file (only if time/judgement supports it), with a
summary of what you changed and why.
```

## Prompt for R-08 — Run `shellcheck` in CI over the scripts that already assume it

**Bundles:** R-08 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic. Several of
its shell scripts under `scripts/` (at least
`scripts/check-changelog-section.sh` and `scripts/assemble-changelog.sh`)
already carry `# shellcheck source=...` / `# shellcheck disable=SC...`
directive comments — meaning whoever wrote them already runs `shellcheck`
locally or in their editor — but no CI job actually runs `shellcheck`
anywhere in this repository (`grep -rn shellcheck .github/workflows/*.yml
package.json` returns nothing today).

Goal: a CI job runs `shellcheck` over this repo's shell scripts
(`scripts/*.sh` and `.githooks/*`) on every pull request, and fails the
build on a new warning/error.

Steps:
1. List every shell script that should be checked: everything under
   `scripts/` and `.githooks/` (check `file scripts/* .githooks/*` or
   look for `#!/usr/bin/env bash`/`#!/bin/bash`/`#!/bin/sh` shebangs to be
   sure you've got them all, including any without a `.sh` extension).
2. Add a step to `.github/workflows/build-poems.yml`'s existing `build`
   job (simplest; keeps everything in one place) — or, if you judge a
   separate lightweight workflow fits this repo's existing style better
   (look at how narrowly-scoped `required-checks-drift.yml` is as a
   precedent), create a new one. Use a maintained shellcheck GitHub Action
   (e.g. `ludeeus/action-shellcheck` or the equivalent official
   `shellcheck` binary via `apt`) rather than hand-rolling the
   installation.
3. Run it locally first (install `shellcheck`, run it over the same file
   list) and fix any warnings it raises on the *existing* scripts before
   wiring it into CI — the point is to land with a clean baseline, not to
   file a dozen new findings against the maintainer's existing code.

Constraints: do not change any script's actual runtime behaviour while
fixing shellcheck warnings — these should be no-op style/safety fixes
(quoting, `[[ ]]` vs `[ ]`, etc.), not functional changes. If a warning
requires a real behavioural judgement call to fix properly, leave it as
an explicit `# shellcheck disable=SC... reason` with a comment explaining
why, rather than guessing at a fix.

Verification: run the new CI step's exact command locally and confirm it
exits 0 against the current script set before you wire it in. After
wiring it in, push to a throwaway branch and confirm the new job appears
and passes in `gh pr checks` (or `gh run list`) on a real PR.

Work cost-consciously. Adding a CI step for an already-standard tool, and
fixing mechanical shellcheck warnings, suits a low-cost model tier; this
whole task is appropriate for that tier.

Deliverable: a diff adding the shellcheck CI step, plus any no-op fixes to
existing scripts needed to pass it cleanly, with a summary of what was
fixed.
```

## Prompt for R-09 — Bound `blogger-auth.js`'s OAuth redirect wait with a timeout

**Bundles:** R-09 only · **Run after:** no prerequisites

```text
You are working in the GitHub repository Poetic-Poems/poetic, a Node.js
framework. Its `src/tools/blogger-auth.js` is an interactive CLI tool
(`npm run blogger:auth`) that opens a local OAuth loopback listener and
waits for the user's browser to complete a Google OAuth consent flow and
redirect back. The relevant function is `waitForCode(port, expectedState)`
(around lines 344-395) — it returns a Promise that only resolves/rejects
when the loopback server actually receives a callback (success, error, or
a CSRF `state`-mismatch) or the request handler throws. There is no
timeout: if the user closes the browser tab, the consent screen fails
silently, or they simply walk away, `main()`'s `await waitForCode(...)`
(around line 492) blocks forever with the listener still bound. This is
the only outbound-call-adjacent path in this file/`sync-blogger.js` that
doesn't share the rest of the Blogger tooling's consistent 30-second
timeout discipline (see `fetchWithRetry()` in `sync-blogger.js` and
`FETCH_TIMEOUT_MS` in this same file for the pattern already in use
elsewhere).

Goal: an abandoned `npm run blogger:auth` run self-terminates with a
clear message after a generous, user-visible timeout (a few minutes —
this is a human clicking through a browser consent flow, not a
machine-to-machine call, so don't reuse the 30-second machine-call
timeout verbatim) instead of hanging indefinitely.

Steps:
1. Read `waitForCode()` and its caller in `main()` in full first.
2. Add a bounded wait around the existing `waitForCode()` call — e.g.
   `Promise.race([waitForCode(...), timeoutPromise])` where
   `timeoutPromise` rejects after a constant like `OAUTH_WAIT_TIMEOUT_MS =
   5 * 60 * 1000` (pick a sensible name consistent with the existing
   `FETCH_TIMEOUT_MS` naming convention).
3. On timeout, close the loopback HTTP server (the same cleanup path the
   existing success/error branches already use — don't leave the listener
   bound) and print a clear message: something like "Timed out waiting
   for the browser redirect after 5 minutes. Rerun `npm run
   blogger:auth` to try again." then exit non-zero.
4. Do not change the timeout/retry behaviour of any other function in
   this file or in `sync-blogger.js` — this fix is scoped to the one
   OAuth-wait path.

Constraints: this is an interactive CLI tool, never run unattended or in
CI (confirm this yourself by checking `docs/BLOGGER.md` and
`.github/workflows/sync-blogger.yml` — this tool is not invoked from
CI). Don't add retry logic (a human doesn't want their browser flow
silently retried); a clean timeout-and-exit is the whole fix.

Verification: there's no good way to test a 5-minute real wait in a fast
test suite — instead, structure the timeout as an injectable/configurable
value (or extract the race logic into a small testable function taking
the timeout duration as a parameter) so a test can use a tiny timeout
(e.g. 50ms) and a `waitForCode` that never resolves, and assert the
timeout path fires, cleans up the listener, and exits/rejects as
expected. Add this test to `test/blogger-auth.test.js`. Run the full
suite (`npm test`) to confirm nothing else regressed.

Work cost-consciously; this is a small, well-specified task suited to a
low-cost-to-mid-cost model tier — the only subtlety is making the timeout
testable without a real 5-minute wait.

Deliverable: a diff to `src/tools/blogger-auth.js` plus a new test in
`test/blogger-auth.test.js`, with a short summary.
```

## Prompt for R-10 — Enable secret-scanning on the repository

**Bundles:** R-10 only · **Run after:** no prerequisites

```text
This recommendation's default fix is a GitHub repository-settings change
(toggling on native secret scanning + push protection under Settings →
Code security), which only a repository owner/admin can do — it is
explicitly an owner decision, not something any agent (including you) can
execute directly. Do not attempt to work around this by changing repo
settings via the API if you don't have administrative credentials for it;
that's the point of the owner-decision marker.

What you CAN usefully do in this repository (Poetic-Poems/poetic) if the
owner has decided the native GitHub feature isn't available or wanted
(e.g. due to the repository's visibility/plan tier) and asks for the
fallback instead: add a `gitleaks-action` (or equivalent maintained
secret-scanning action) step to this repo's CI.

If asked to implement the fallback:

Context: this is a Node.js framework repository with 8 existing GitHub
Actions workflows under `.github/workflows/`, each with unusually
thorough inline comments explaining its own design choices (read 2-3 of
them, e.g. `codeql.yml` and `commit-format.yml`, to match the house
style before adding a new one).

Goal: a CI job scans every pull request's diff (and, ideally, a baseline
scan of the full history once) for accidentally-committed secrets, and
fails the build if it finds one.

Steps:
1. Add a new workflow (or a step in an existing one — your judgement,
   following this repo's existing patterns) that runs `gitleaks` (via
   `gitleaks/gitleaks-action` or the standalone binary) against the PR's
   diff.
2. Scope its `permissions:` block minimally (read-only `contents`, same
   as this repo's other workflows default to) — do not give it write
   access to anything.
3. Document the new check in `SECURITY.md`'s "Automated scanning" section,
   alongside the existing CodeQL description, in the same style.

Constraints: do not touch repository Settings yourself — this prompt's
CI-level fallback is additive only. Do not add this check to
`.github/required-checks.txt` without the owner's sign-off, since marking
a new check "required" is itself a branch-protection/ruleset change this
repo's own conventions reserve to the owner (see `AGENTS.md`'s "Branch
protection in this repository" section).

Verification: push a throwaway test commit containing an obviously-fake
secret-shaped string on a scratch branch (never on `main`) and confirm the
new job catches it; then remove that commit/branch. Confirm the workflow
passes cleanly against the current, secret-free `main`.

Work cost-consciously. Wiring up a well-documented, pre-built GitHub
Action is mechanical and suits a low-cost model tier.

Deliverable (fallback only): a diff adding the new CI step/workflow and
updating `SECURITY.md`, with a summary. If the owner decision instead
favours the native GitHub feature, your deliverable is simply confirming
that to the owner — there's no code change to make.
```
