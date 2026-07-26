# Improvement prompts

One prompt per recommendation, in priority order (severity first, then effort within severity — matching `03-recommendations.md`). Each prompt is self-contained: it can be pasted into a fresh AI agent session with no other context. Ordering dependencies are called out explicitly where they exist; there are none in this batch beyond R-08 subsuming both of its findings' fixes in one pass.

## Prompt for R-01 — Make `changelog-check` an actual merge gate

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic (a Node.js framework that converts .poem plain-text
files to HTML; GitHub Pages + optional Blogger publishing).

Problem: release.yml's `changelog-check` job (added by PR #91) fails a pull
request when package.json's version changed but CHANGELOG.md has no matching
`## [<version>]` heading. However, the repo's branch protection ruleset for
`main` (id 18226786) does not list `changelog-check` in its
required_status_checks — only `build`, `commit-format`, and the two `Analyze`
(CodeQL) contexts are required. Confirm this yourself first:
`gh api repos/Poetic-Poems/poetic/rulesets/18226786 --jq '.rules[] |
select(.type=="required_status_checks") | .parameters.required_status_checks'`.
Because it isn't required, a PR can be squash-merged into `main` while
`changelog-check` shows a red X, and the push-triggered `release` job will
still tag and publish a GitHub release for a version with no CHANGELOG entry
— exactly the failure mode the check exists to prevent.

Goal: add `"changelog-check"` to that ruleset's required_status_checks list,
alongside the four already there. Verify afterwards by re-running the same
`gh api ... rulesets/18226786` query and confirming `changelog-check` now
appears in the list.

Constraints: this is a repository *settings* change (a GitHub ruleset), not a
code change — there is no file in the repo to edit. It requires admin or
maintain permission on Poetic-Poems/poetic. If your credentials do not have
that permission, do not attempt a workaround — instead produce the exact
`gh api --method PUT ...` call (or the equivalent UI steps: Settings → Rules →
Rulesets → the default-branch ruleset → edit its required status checks) for
the repo's maintainer to run, and stop there. Do not change anything else
about the ruleset (do not touch `strict_required_status_checks_policy`, which
CLAUDE.md documents as a deliberate, separate choice).

Verification: `gh api repos/Poetic-Poems/poetic/rulesets/18226786` shows
`changelog-check` in required_status_checks. No code, test, or build changes
are involved, so no other verification is needed.

Work cost-consciously. This entire task suits a low-cost model tier — it is a
single, well-specified API/settings change with no code to write.

Deliverable: either confirmation that the ruleset was updated (with the
before/after API output), or, if you lack permission, the exact command/steps
for the maintainer to run.
```

## Prompt for R-02 — Refactor and test `sync-blogger.js`'s `main()` orchestration

**Bundles:** R-02 only (covers F-CODE-01 and F-TEST-01 together — same file, same fix) · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic, a Node.js framework converting .poem files to
HTML, with an optional src/tools/sync-blogger.js tool that publishes poems to
a live Blogger blog (triggered by .github/workflows/sync-blogger.yml on every
push to main touching src/poems/**).

Problem: sync-blogger.js's `main()` function (roughly 168 lines) is the one
part of this file that is both the most complex code and the only untested
code. Every other function in the file — parseArgs, resolveConfig,
extractSlug, composePost, postNeedsUpdate, selectRemoved, extractContent — is
pure, exported, and unit-tested in test/sync-blogger.test.js. main() itself is
not exported and is not exercised by any test, yet it contains real branching
business logic: a per-poem decision (create-with-date-prefix-then-rename,
update, skip), a separate removal-pass loop (draft/delete/keep, with a
--only-flag interaction that must skip removals entirely under a filtered
run), dry-run vs. live branching for every path, and a top-level catch that
calls diagnoseBloggerFailure() and sets process.exitCode = 1. Because this
code mutates a live, public, third-party blog on every push to main, an
un-caught bug in how main() sequences these decisions would ship straight to
production with nothing in the suite to catch it.

Goal (acceptance criteria):
1. Extract the per-poem create/update/skip decision logic and the
   removal-pass loop body out of main() into named, exported functions —
   mirroring the pattern every other function in this file already follows
   (pure logic exported and testable; main() reduced to a thin orchestrator
   over these named steps plus CLI-arg/exit-code handling).
2. Add an integration-style test (in test/sync-blogger.test.js or a new file)
   that mocks `global.fetch` at the module boundary — the same technique
   fetchWithRetry's existing tests already use — and drives the newly
   extracted orchestration through, at minimum: a new poem (create then
   rename), a changed poem (update), an unchanged poem (skip), a removed poem
   under each of draft/delete/keep, and one failure path that reaches
   diagnoseBloggerFailure().
3. sync-blogger.js's actual CLI behaviour (arguments accepted, console
   output, exit codes, the --only flag's interaction with removals) is
   unchanged — this is a refactor plus new tests, not a behaviour change.
   TD26072602 (sequential per-poem processing) is a separate, already-tracked
   concern; do not fix or touch it as part of this task.

Constraints: do not change fetchWithRetry, composePost, postNeedsUpdate, or
any other already-tested pure helper's behaviour. Do not add new runtime
dependencies. Follow the project's existing JSDoc conventions (see the
existing functions in this file for style) on any newly-exported function.
Commit messages must follow Conventional Commits
(scripts/../.githooks/check-commit-format.sh enforces this); this repo's
CLAUDE.md requires all work to land via a pull request from a dedicated fresh
clone, never a direct commit to main.

Verification: run `npm test` (must still show all pre-existing tests passing
plus the new ones, 0 failures) and `npm run lint` (must be clean) before
declaring this done. Manually trace through the new test's mocked scenario
list against the acceptance criteria above.

Work cost-consciously. Where your environment supports subagents, delegate
well-specified, self-contained subtasks to subagents running the lowest-cost
model tier that has a high probability of completing the subtask correctly at
the first attempt — a failed cheap attempt that must be redone costs more than
doing it right once. The mechanical extraction (moving code into named
exported functions with no logic change) suits a low-cost tier; writing the
new integration test against real Blogger-sync branching logic is closer to
ordinary implementation against clear acceptance criteria and suits a
mid-cost tier; do the final review of the extracted main() and the new tests
yourself at a higher-capability tier before opening the PR, since this code
touches a live external service. Verify all delegated work before
integrating it.

Deliverable: a pull request with the refactor and the new test(s), a
CHANGELOG.md entry under [Unreleased], and a summary of what was extracted
and what the new test covers.
```

## Prompt for R-03 — Route `footer.source`/`blogger.template` config paths through `path-guard`

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic, a Node.js framework converting .poem files to
HTML. src/tools/path-guard.js exists specifically to contain a
config/request-supplied path to an intended root directory (safeJoin,
isWithinRoot), and is used correctly for this purpose in
src/tools/serve-static.js.

Problem: two other places resolve a config-supplied path without using
path-guard.js at all:
- src/tools/footer.js's resolveFooterSourcePath() (near lines 39-42) joins a
  relative footer.source value with the repo root via plain path.join, with
  no ".."-stripping, and uses an absolute footer.source value verbatim. Its
  caller, renderFooter(), then reads that path's content and splices it into
  every generated page's <footer> block, which build-poems.yml's deploy job
  publishes to GitHub Pages.
- src/tools/build-blogger.js's resolveTemplatePath() (near lines 39-43)
  returns config.blogger.template completely unvalidated when set (no
  path.isAbsolute check, no join against any root), and its caller reads that
  path directly to build the Blogger theme upload.

Because .poetic-config.yaml is authored by anyone who can land a merged PR
against a consumer poem-collection repository, a footer.source or
blogger.template value like "/etc/hostname" or "../../../../etc/hosts" causes
the build to read that file's content and publish it verbatim — either into
every page on the public GitHub Pages site, or as the live Blogger theme.
This is a content-disclosure primitive.

Goal: make both resolveFooterSourcePath() and resolveTemplatePath() route
through path-guard.js's safeJoin/isWithinRoot (import it the same way
serve-static.js does), rooted at the repo root (for the footer include) and
at whatever root scope is appropriate for the Blogger template (an
equivalent public/-style scope, or the repo root if no narrower scope makes
sense for this file — read build-blogger.js's surrounding code to judge
which). When a resolved path falls outside that root, reject it (do not read
the file) and either fall back to the module's existing default or raise a
clear, actionable error — pick whichever this file's surrounding error-
handling style already does elsewhere in the same file.

Constraints: do not change path-guard.js itself. Do not change the *valid*-
path behaviour of either function (a footer.source/blogger.template value
that already correctly points inside the intended root must keep working
exactly as before) — this is a containment fix, not a redesign. Preserve
each function's existing return type/signature so callers are unaffected.

Verification: add a test per function (in test/footer.test.js and a
build-blogger test file — check whether one already exists and follow its
existing style, or create test/build-blogger.test.js if not) asserting a
".."-escaping relative path and an absolute path outside the intended root
are both rejected, mirroring test/path-guard.test.js's existing assertions.
Run `npm test` (all tests, including new ones, must pass) and `npm run lint`
(must be clean) before declaring this done.

Work cost-consciously. This is a well-specified, self-contained security fix
following an existing pattern (path-guard.js) already proven elsewhere in the
codebase — a mid-cost model tier should complete it correctly on the first
attempt; delegate the test-writing to a low-cost tier once the containment
logic itself is in place, but review the final containment logic yourself
given this is a security-relevant fix.

Deliverable: a pull request with both fixes and their tests, and a
CHANGELOG.md entry under [Unreleased] noting the security fix.
```

## Prompt for R-04 — Test `serve-static.js`'s real request handler, including the traversal guard

**Bundles:** R-04 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. src/tools/serve-static.js is a local dev server
(npm start) serving the built public/ directory, with a path-traversal guard
(path-guard.js's isWithinRoot) applied at two call sites inside its
http.createServer request-handler callback.

Problem: test/serve-static.test.js's own file comment explains that
serve-static.js has no module.exports and starts a real server as a
load-time side effect, so the test patches the source in-memory to export
four pure helpers (escapeHtml, encodeHref, generateDirectoryListing,
CORS_HEADERS) with http.createServer stubbed to a no-op. That stub means the
request-handler function itself — the /all-poems endpoint, the
directory-listing branch, both isWithinRoot call sites (traversal guard), the
200/403/404 responses, the SPA-fallback-to-index.html branch, and the
top-level try/catch -> 500 — has never actually run under test. The pure
helpers being 100% covered does not establish that the guard is correctly
wired into the real request path.

Goal: add test coverage that exercises the real request-handler function
(the argument passed to http.createServer), covering at minimum:
1. A path-traversal attempt (e.g. a URL-encoded "../" segment) returns 403.
2. A legitimate, normal file request returns 200 with the correct
   Content-Type.
3. A request for a missing path falls through to the SPA-fallback/404
   behaviour correctly.

Approach: extend the existing in-memory source-patching technique
test/serve-static.test.js already uses — capture the function passed to the
stubbed http.createServer instead of discarding it, and invoke it directly
against a constructed fake req/res pair (or, if that proves awkward, start
the real server on an ephemeral port via listen(0) and drive it with real
http.request calls, then close it in an afterEach/finally). Prefer whichever
approach requires the smaller diff against the test file's existing
structure.

Constraints: do not change serve-static.js's runtime behaviour — this is a
test-only change, unless the handler genuinely cannot be captured for testing
without a small, behavior-preserving refactor (e.g. exporting the handler
function so tests can import it directly), in which case make that the
smallest change that unblocks testing and note it explicitly in the PR
description.

Verification: run `npm test` (new tests plus all existing tests must pass)
and `npm run lint` (must be clean, this project enforces ESLint via `npm run
lint`) before declaring this done. Also run `npm run coverage` and confirm
serve-static.js's function/statement coverage has measurably increased from
its current 55.8% statement / 75% function baseline.

Work cost-consciously. This is mechanical, well-specified test-writing
against an existing, unchanged code path — a low-to-mid-cost model tier
should complete it correctly on the first attempt.

Deliverable: a pull request with the new tests (and, if unavoidable, the
minimal enabling refactor), and a CHANGELOG.md entry under [Unreleased] if
the change is user-visible (it likely is not, being test-only).
```

## Prompt for R-05 — Export and test `poem-to-yaml.js`/`poem-to-raw.js`'s CLI orchestration

**Bundles:** R-05 only (both files share the identical gap and the identical intended fix pattern) · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic, a Node.js framework converting .poem plain-text
files to HTML via an intermediate YAML representation. Every consumer repo's
build runs src/tools/poem-to-yaml.js and src/tools/poem-to-raw.js on every
build.

Problem: both files' main() function — the --all loop, skip-if-up-to-date
counting, stale-artefact detection/warning, and per-file error counting that
process.exit(1)s on failure — is unexported and untested; only the pure
conversion functions each file also exports (convertPoemToYaml,
parsePoemFile, htmlToPlainText, renderPoemText, buildIndex, etc.) have tests.
By contrast, the equivalent orchestration in src/tools/build-poems.js is
exported as buildAllPoems(), and test/build-poems.test.js calls it directly
for the happy path and drives its process.exit(1) paths (missing-field,
empty-slug, slug-collision) via spawnSync of a small inline script. Because
npm run build only ever exercises poem-to-yaml.js/poem-to-raw.js against this
repo's own pristine example poems, the stale-artefact warning, skip-count
reporting, and per-file error-counting/exit(1) branches in both files have,
as far as this review could determine, never executed under any test — only
in production use by consumer repos, where a bug would surface as a silent
build regression rather than a CI failure.

Goal (acceptance criteria): for each of poem-to-yaml.js and poem-to-raw.js —
1. Export the substantive per-file --all-loop logic as a named function
   (mirroring build-poems.js's buildAllPoems() naming/shape), leaving main()
   as a thin wrapper that calls it and sets process.exitCode.
2. Add spawnSync-driven tests mirroring test/build-poems.test.js's existing
   pattern (see its lines ~173-234 for the inline-script/spawnSync
   technique), covering: a per-file conversion failure incrementing the
   error count and causing a non-zero exit, and a positive test that the
   stale-artefact warning fires when it should.

Constraints: do not change either file's CLI argument handling, console
output format, or exit-code values — this is an export-and-test change, not
a behaviour change. Keep both files' newly-exported function names/shapes
reasonably consistent with each other, since they solve the same problem.

Verification: run `npm test` (all tests, old and new, passing) and `npm run
lint` (clean). Run `npm run coverage` and confirm both files' statement
coverage has measurably increased from their current baselines (46.4% for
poem-to-yaml.js, 67.13% for poem-to-raw.js).

Work cost-consciously. This closely follows an existing, already-proven
pattern in the same codebase (build-poems.js/build-poems.test.js) — a
mid-cost model tier should complete it correctly on the first attempt without
needing higher-tier design judgement.

Deliverable: a pull request with both files' exports and new tests, and a
CHANGELOG.md entry under [Unreleased] if warranted (likely not, being
internal refactor plus tests).
```

## Prompt for R-06 — Exempt `createPost` from Blogger sync's rejection-retry to avoid duplicate posts

**Bundles:** R-06 only · **Run after:** no prerequisites (independent of R-02's main() refactor, though both touch sync-blogger.js — if R-02's PR is also in flight, coordinate to avoid a merge conflict, but do not block on it)

```text
Repo: Poetic-Poems/poetic. src/tools/sync-blogger.js publishes poems to a
live Blogger blog. Its fetchWithRetry() helper (near lines 392-404) wraps
every Blogger API call with a 30-second per-attempt timeout and a single
automatic retry whenever the fetch itself rejects (a network failure, or the
timeout firing).

Problem: fetchWithRetry() is applied uniformly to every network call in this
file, including createPost() — the one non-idempotent call among them (a
plain POST that creates a new Blogger post). If the first createPost request
actually reaches Blogger and is processed there, but the response is lost to
the client (a connection reset, or the 30-second timeout firing just as
Blogger finishes), fetchWithRetry retries the identical POST body, creating a
second, duplicate live post for that poem. There is no idempotency key and
no check against the already-fetched list of existing posts (bySlug, built
once per run from listAllPosts() before any create/update decisions) before
or after the retry.

Goal: a retried createPost call cannot result in two live Blogger posts for
the same poem. Achieve this either by (a) excluding createPost specifically
from fetchWithRetry's automatic retry-on-rejection (let a rejected create
surface as a normal per-poem error instead; since the tool is meant to be
safely re-run, the next sync attempt will see the poem as still missing and
try again), or (b) if you judge (a) too disruptive to the current
error-reporting flow, having the retry path re-check for an existing post
with the same slug marker before issuing the second createPost call, and
treating a match as success rather than creating again. Prefer (a) unless it
would materially complicate the existing per-poem success/failure reporting
that main() currently relies on — read main()'s current create-handling
branch before choosing.

Constraints: do not change fetchWithRetry's retry behaviour for
updatePost/revertPost/deletePost/listAllPosts/getAccessToken — those are all
naturally safe to repeat (idempotent or read-only) and must keep their
current retry behaviour exactly as-is. Do not change the 30-second timeout or
the 429/5xx retry conditions for any other call.

Verification: add a test alongside fetchWithRetry's existing test block in
test/sync-blogger.test.js asserting that a rejected createPost call is not
retried (or, if you took approach (b), that a same-slug post is detected and
no duplicate is created). Run `npm test` (all passing) and `npm run lint`
(clean) before declaring this done.

Work cost-consciously. This is a small, well-specified fix to a single
function's retry-eligibility logic — a mid-cost model tier should complete
it correctly on the first attempt, but review the final logic yourself if
you delegate the implementation, since a mistake here reaches a live public
blog.

Deliverable: a pull request with the fix and its test, and a CHANGELOG.md
entry under [Unreleased] describing the fix.
```

## Prompt for R-07 — Gate `npm run coverage` in CI with a threshold

**Bundles:** R-07 only (covers F-CI-02 and F-TOOL-01 — the identical gap found independently by two dimension passes) · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. package.json already defines a working
"coverage": "c8 npm test" script, runnable locally, but no GitHub Actions
workflow invokes it, uploads a coverage report, or checks a minimum
threshold — the tool exists but nothing gates on it.

Goal: add a CI step that runs coverage and fails the build if coverage drops
meaningfully below today's baseline (79.48% statement / 82.26% branch /
88.41% function, measured via `npm run coverage` at commit 700123a — re-measure
before picking your floor, since this baseline will have moved by the time
you do this work). Use c8's built-in `--check-coverage` flag with `--lines`,
`--branches`, and `--functions` thresholds set a few percentage points below
the current measured numbers, so the gate catches a genuine regression
without tripping on normal fluctuation from adding new, well-tested code.

Approach: add the step to .github/workflows/build-poems.yml's existing
`build` job, immediately after the existing `npm test` step (reuse the same
already-checked-out code and installed dependencies rather than adding a
whole new job with its own npm ci). Read the existing build job's steps
first to match its style (Node version, existing step-naming conventions).

Constraints: do not change what `npm run coverage` or `npm test` do — only
add a new CI step that consumes them. Do not make this check block on the
low-coverage files this same review separately flagged for improvement
(sync-blogger.js, serve-static.js, poem-to-yaml.js, poem-to-raw.js) reaching
any specific number — set the overall floor low enough that today's tree
passes as-is; R-02, R-04, and R-05 (separate recommendations from this same
review) are what actually raise those files' coverage, not this gate.

Verification: push a branch with this change and confirm the new CI step
actually runs and passes against the current tree (a green run is the proof
this works); then deliberately introduce a trivial, uncommitted local
coverage regression (e.g. comment out a small test) and confirm
`npm run coverage -- --check-coverage --lines=<your-floor> ...` (or however
you wire the flags) fails locally, to prove the gate actually gates before
reverting that experiment and committing only the real change.

Work cost-consciously. This entire task suits a low-to-mid-cost model tier —
it is a well-specified CI-configuration addition with no application code
change.

Deliverable: a pull request with the new CI step, and a CHANGELOG.md entry
under [Unreleased] noting that coverage is now CI-enforced (not just
locally available).
```

## Prompt for R-08 — Replace inline `onclick` handlers in the analysis toggle with a delegated listener

**Bundles:** R-08 only (covers F-ARCH-01 and F-CODE-02 — same root cause, same fix) · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. src/templates/_poem-content.pug renders each
poem's "analysis" section, including four interactive controls: a show/hide
toggle and a synopsis/full-text selector pair (two buttons).

Problem: src/templates/_poem-content.pug's line 2 states "Do NOT add a
<script> block here; the embedded-player loader lives in public/poetic.js" —
but the four analysis controls (roughly lines 171-196) each carry a
hand-written, string-interpolated onclick attribute containing inline JS,
e.g.:
  onclick=`document.getElementById('analysis--${slug}').style.display =
  'block'; document.getElementById('show-analysis--${slug}').style.display =
  'none';`
Two of these onclick attributes (the synopsis/full selector pair, near lines
189 and 194) additionally each independently redefine the identical
one-line helper `el = name => document.getElementById('analysis-' + name +
'--${slug}')` — an implicit global (no const/let) copy-pasted between the two
buttons. This is the one remaining control in this template still wired the
old way: public/poetic.js already implements the same class of interaction
(the song-embed button, and the postscript "See more" toggle) via delegated
document.addEventListener('click', ...) listeners keyed off data-* attributes
or element IDs, with no inline script — read public/poetic.js's existing
postscript-toggle handler (near lines 40-50) as the pattern to follow.

Goal: remove all four onclick attributes from _poem-content.pug's analysis
controls; replace them with data-* attributes (or reuse existing
id/class conventions, whichever public/poetic.js's existing handlers already
lean on) and one delegated click listener added to public/poetic.js that
reproduces the exact same show/hide/selector behaviour these onclick
handlers currently implement. While making this change, add aria-expanded to
the toggle button to reflect its open/closed state, matching the postscript
toggle's existing accessibility treatment (this is a small UX improvement
that falls naturally out of the same edit; do not scope-creep beyond it).

Constraints: the rendered page's visible behaviour must be identical before
and after this change — same show/hide semantics, same synopsis/full
selection behaviour, same slug-based per-poem element targeting (multiple
poems' analysis sections can coexist on the same all-poems page, so any
selector logic must stay scoped per-poem exactly as the current
`--${slug}`-suffixed IDs already ensure). Do not touch the postscript-toggle
or song-embed handlers already in public/poetic.js beyond what's needed to
add the new delegated listener alongside them.

Verification: run `npm run build` and manually inspect a generated poem page
with an analysis section (or write/extend a test if this project has any
template-output assertions covering the analysis section's HTML — check
test/ for existing coverage first) to confirm all four buttons still work:
show/hide toggles the analysis block, and the synopsis/full selector switches
content and updates the "selected" class on the correct button. Run `npm
test` and `npm run lint` (both must pass) before declaring this done.

Work cost-consciously. This closely follows an existing, already-proven
pattern in the same codebase (the postscript-toggle fix) — a mid-cost model
tier should complete it correctly on the first attempt.

Deliverable: a pull request with the template and public/poetic.js changes,
and a CHANGELOG.md entry under [Unreleased].
```

## Prompt for R-09 — Add `timeout-minutes` to CI jobs that lack one

**Bundles:** R-09 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. Only .github/workflows/sync-blogger.yml sets a job
timeout-minutes (30); every job in build-poems.yml, codeql.yml,
commit-format.yml, release.yml, and sync-framework.yml has none, so each
defaults to GitHub Actions' 360-minute per-job ceiling. build-poems.yml's
`build` job is one of the four checks required to merge into main, so an
unbounded hang there would hold up a PR's merge for up to six hours before
GitHub itself kills it.

Goal: add an explicit, modest timeout-minutes to every job in every workflow
under .github/workflows/ that currently lacks one. Pick values comfortably
above each job's observed run time (check recent run durations via `gh run
list` and `gh run view <id>` for each workflow before picking a number) —
e.g. 10-15 for build-poems.yml's build/deploy jobs and codeql.yml's analyze
job, 5 for the lighter commit-format.yml and release.yml's changelog-check
job, and a value consistent with sync-framework.yml's actual typical runtime
for its sync job.

Constraints: do not change sync-blogger.yml's existing timeout-minutes: 30.
Do not change any other job behaviour, trigger, or permission — this is
purely an addition of one key per job.

Verification: after adding the timeouts, push the branch and confirm every
workflow still runs and passes normally (a routine green run on this PR
itself is sufficient proof the chosen timeouts are not too tight).

Work cost-consciously. This entire task suits a low-cost model tier — it is
mechanical, well-specified, and touches only YAML configuration.

Deliverable: a pull request adding timeout-minutes across the listed
workflows, with a one-line CHANGELOG.md entry under [Unreleased] if the
project's convention is to log CI-only changes (check recent CHANGELOG.md
entries for precedent; omit the entry if CI-only changes are not typically
logged there).
```

## Prompt for R-10 — Mask the Blogger client-secret terminal prompt

**Bundles:** R-10 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. src/tools/blogger-auth.js is an interactive CLI
setup wizard that mints Blogger OAuth credentials.

Problem: when BLOGGER_CLIENT_SECRET is not supplied via environment variable,
blogger-auth.js (near lines 409-410) prompts for it interactively via a plain
readline rl.question() call, which echoes the typed value to the terminal by
default — so the client secret appears in cleartext in the terminal and any
scrollback/session-recording. The environment-variable path (BLOGGER_CLIENT_ID
/ BLOGGER_CLIENT_SECRET) already avoids this prompt entirely.

Goal: the interactive client-secret prompt no longer echoes the typed
characters to the terminal (a standard "masked password prompt" behaviour) —
OR, if implementing TTY-echo suppression proves disproportionate to this
tool's actual usage pattern, add a one-line note to --help output and/or
immediately before the prompt itself, pointing the operator at the
environment-variable path as the way to avoid on-screen echo. Prefer the
masking fix if it can be done with Node's built-in readline/tty APIs without
a new dependency; fall back to the documentation-only approach only if that
proves unreasonably complex.

Constraints: do not change the refresh-token print (near line 477) — that
one-time, unmasked display is deliberate and out of scope (see
F-DATA-01/refresh-token in the review; it does not have a recommendation
attached because the review judged no code change is needed there). Do not
add a new npm dependency for this — Node's core readline module supports
muting stdout during a specific question via existing, documented patterns.

Verification: run `node src/tools/blogger-auth.js` (or whatever invocation
reaches the client-secret prompt without BLOGGER_CLIENT_SECRET set) and
manually confirm typed characters no longer appear on screen at that specific
prompt, while confirming every other prompt in the tool is unaffected. Run
`npm test` and `npm run lint` (both must pass).

Work cost-consciously. This entire task suits a low-cost model tier — a
small, self-contained, well-specified CLI UX fix.

Deliverable: a pull request with the fix, and a CHANGELOG.md entry under
[Unreleased] if the project logs CLI UX fixes there (check recent entries for
precedent).
```

## Prompt for R-11 — Add an automated licence-compatibility check

**Bundles:** R-11 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic, MIT-licensed, private (not published to npm). No
CI step or script currently verifies dependency licences; manual inspection
at the time of this review found only permissive licences in use (MIT, ISC,
Apache-2.0, BSD-2/3-Clause, BlueOak-1.0.0), with roughly 45 transitive
packages (Babel, Acorn, some pug sub-packages) missing a recorded license
field in package-lock.json but being well-known permissively-licensed
tooling.

Goal: add a CI step (or a package.json script runnable both locally and in
CI) that fails if any dependency (direct or transitive) in the production
dependency tree carries a licence outside an explicit allow-list, so a future
Dependabot-proposed bump (or a new direct dependency) that introduces an
incompatible licence is caught before merging.

Approach: add `npx license-checker --production --onlyAllow
'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD;BlueOak-1.0.0'` (adjust the
allow-list only if it flags a dependency you've confirmed is already
correctly in use — do not silently widen the list to make a real problem go
away) as a new CI step, most naturally alongside the existing `npm audit`-
style checks in build-poems.yml's build job, or as a small standalone job.
Consider adding it as an npm script (e.g. "license-check") in package.json
too, so a contributor can run it locally, mirroring how "lint"/"check" already
work.

Constraints: do not add license-checker (or an equivalent tool) as a runtime
dependency — it belongs in devDependencies only, and should not affect the
package's own published dependency footprint (this project is private, so
this is a lower-stakes constraint than for a published package, but keep the
convention anyway).

Verification: run the new check locally against the current tree and confirm
it passes cleanly (given this review's own manual inspection found no actual
conflict today); then push the branch and confirm the new CI step runs and
passes.

Work cost-consciously. This entire task suits a low-cost model tier — a
single, well-specified tooling addition.

Deliverable: a pull request with the new check (CI step and/or npm script),
and a CHANGELOG.md entry under [Unreleased].
```

## Prompt for R-12 — Parse each poem's YAML once per aggregate build instead of up to four times

**Bundles:** R-12 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. src/tools/build-all-poems.js generates the
all-poems.html and index.html aggregate pages from every poem's YAML source.

Problem: for each poem, this file's build path independently reads and
parses the poem's YAML up to four separate times: once directly inside
concatenateAllHtmlFiles() for metadata, a second time via loadPoemData() ->
readPoemFile() (poem-render.js) for the same poem's data, a third time inside
generateIndexHtml()'s own independent read+parse for metadata, and a fourth
time while computing the aggregate's staleness-check `sources` set via
refFilesForPoem() (poem-render.js), which itself parses every poem's YAML to
resolve $ref targets — and this fourth parse happens even when
needsRebuildAggregate() is about to report "nothing changed, skip the
rebuild," meaning the supposedly-fast incremental-build path still pays an
O(n) parse of every poem just to learn nothing changed.

Goal: parse each poem's YAML once per build invocation, and share the parsed
object across metadata extraction, $ref resolution, and any other place that
currently re-reads the same file from disk within a single build run.

Constraints: the generated all-poems.html and index.html output must be
byte-for-byte identical before and after this change for the same source
poems (this is a pure performance refactor, not a behaviour change) — verify
this directly by diffing the generated files before and after your change
against this repo's own example poem(s) in src/poems/. Do not change the
staleness-check logic's actual correctness (needsRebuildAggregate() must
still correctly detect changed/added/removed source poems) — only avoid
redundant re-parsing of files whose content you already have in memory from
earlier in the same build run.

Verification: run `npm run build` before and after your change and diff
public/all-poems.html and public/index.html — they must match exactly. Run
`npm test` (the existing build-all-poems/aggregate-render-core test suites
must all still pass) and `npm run lint` (must be clean).

Work cost-consciously. This is a self-contained performance refactor with a
clear, mechanically-verifiable correctness bar (byte-identical output) — a
mid-cost model tier should complete it correctly on the first attempt.

Deliverable: a pull request with the refactor, evidence of the before/after
diff being empty, and a CHANGELOG.md entry under [Unreleased] if the
project's convention is to log internal performance work (check recent
entries for precedent).
```

## Prompt for R-13 — Add a `<main>` landmark and wire an automated accessibility checker

**Bundles:** R-13 only (covers F-UX-01 and F-UX-02 — one small template edit, one CI addition, naturally done together as both are the smallest actionable a11y items from this review) · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. Generated pages are produced from
src/templates/poem-page.pug and the aggregate index/all-poems generators;
public/index.html and public/all-poems.html are the built output.

Problem 1: none of the generated pages (public/index.html,
public/all-poems.html, or individual poem pages built from
src/templates/poem-page.pug) contain a <main> landmark element — each goes
straight from <body> to content divs. This leaves screen-reader/switch-access
users with no "jump to main content" region, distinct from heading
navigation (which this project already has correctly, via each page's h1).

Problem 2: no automated accessibility checker (axe, pa11y, or similar) is
wired into this project anywhere — package.json and every workflow under
.github/workflows/ were checked and neither has one. Both real accessibility
regressions this project has previously had (a keyboard-inaccessible toggle,
WCAG AA contrast failures — both since fixed) were caught by manual review in
separate review passes, not tooling, so nothing in CI would catch a
regression of either class today.

Goal:
1. Wrap each of the three templates' primary content in a <main> element (or
   role="main" if a semantic <main> doesn't fit the existing markup
   structure cleanly), leaving nav/footer elements outside it.
2. Add a non-blocking CI step running an automated accessibility checker
   (pa11y-ci, @axe-core/cli, or similar — pick whichever integrates most
   simply as a devDependency + one CI step) against a built public/index.html
   and one representative built poem page.

Constraints: keep the accessibility-checker CI step non-blocking (report
findings, do not fail the build) to start with, since this project has no
existing automated-a11y baseline to compare against — a hard gate risks
false-positive noise on day one. Do not change any other markup/styling
beyond adding the <main> wrapper.

Verification: run `npm run build` and inspect the generated HTML to confirm
<main> now wraps each page's primary content correctly (readers can still
read/scroll everything as before — this is a landmark addition, not a layout
change). Push the branch and confirm the new CI step runs and reports
(reports are fine even if imperfect; the goal is establishing the tooling,
not achieving zero findings in this task). Run `npm test` and `npm run lint`
(both must pass).

Work cost-consciously. Both parts are small, well-specified, low-risk
additions — a low-to-mid-cost model tier should complete this correctly on
the first attempt.

Deliverable: a pull request with the <main> landmark additions and the new
CI step, and a CHANGELOG.md entry under [Unreleased].
```

## R-14 — already actioned during this review

R-14 ("file the untracked browser-renderer error-classification debt")
required only a `TECH-DEBT.md` entry, which was filed directly as part of
this review's own tech-debt update rather than deferred to a prompt — see
`TD26072617` in `TECH-DEBT.md`. No prompt is needed for R-14 itself. The
underlying code fix it tracks (adding `.code`/`.name` to thrown errors in
`src/browser/render.js`/`render-aggregate.js`) is now available as its own
pickable tech-debt item (`TD26072617`) through this repo's normal `/td`
workflow, independent of this review.

## Prompt for R-15 — Fix three documentation-accuracy gaps

**Bundles:** R-15 bundles three findings (F-DOC-01, F-DOC-02, F-DOC-03) for a positive reason: all three are small, independent doc-accuracy fixes discovered in the same review pass, none depends on the others, and doing them as one small PR avoids three near-trivial separate review cycles for a maintainer who reviews everything personally. · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. This project's documentation principle (stated in
CLAUDE.md's "Documentation principles" section) is that docs describe only
the current, as-built state — no "previously"/"used to be"/"now uses"
phrasing; historical substance belongs in CHANGELOG.md instead.

Fix 1 — scripts/edit-poem and docs/SCRIPTS.md both document the "no poems
matched PATTERN" exit code as -1, but running `bash scripts/edit-poem
nonexistentxyz123` (or any non-matching pattern) actually exits 255 (bash
wraps a negative `exit` value to unsigned 8-bit). Reconcile these: either
update both docs to say 255 (the simpler fix, since the script's current
behaviour is otherwise fine), or change the script to `exit 1` and update
both docs to say 1 — pick whichever the surrounding exit-code scheme in
docs/SCRIPTS.md's table suggests is more consistent with this script's other
documented codes (read that table first).

Fix 2 — docs/BUILD.md (near lines 163-165) describes the current, correct
behaviour that an old-format index.html gets rewritten automatically on next
build, but adds a parenthetical, historical justification: "(from before this
data island existed)". Per CLAUDE.md's documentation principle, remove this
historical parenthetical; keep the description of the current
rewrite-on-build behaviour itself, since that part is accurate and useful.

Fix 3 — docs/BUILD.md's File Structure diagram (near line 104) describes
public/poetic.js as "Framework JS — shared Audiomack loader (synced)". Read
public/poetic.js's own header comment: it explicitly describes itself as a
provider-agnostic embed loader (Audiomack, YouTube, Spotify, and others), not
Audiomack-specific, and its second half implements the postscript "See more"
toggle logic — a second responsibility the diagram doesn't mention at all.
Reword the diagram's one-line description to reflect both responsibilities
accurately (e.g. something like "Framework JS — embed lazy-loader + postscript
toggle (synced)" — adjust wording to match the diagram's existing style).

Constraints: these are documentation-only changes; do not modify any other
behaviour. For Fix 1, if you choose to change the script's exit code rather
than the docs, verify no other script or CI workflow depends on the current
-1/255 value (grep for references to scripts/edit-poem's exit code before
deciding).

Verification: for Fix 1, actually run `bash scripts/edit-poem
<nonexistent-pattern>` and check `$?` matches whatever you documented. For
Fixes 2 and 3, re-read the edited docs/BUILD.md sections and confirm they no
longer contain historical phrasing and accurately describe poetic.js's two
responsibilities. Run `npm run check` (this project's trailing-whitespace
gate) since it runs against all tracked files including docs.

Work cost-consciously. This entire task suits a low-cost model tier — three
small, independent, mechanically-verifiable documentation corrections.

Deliverable: a single pull request with all three fixes (bundled per the
stated reason above), and a CHANGELOG.md entry under [Unreleased] if this
project's convention is to log doc-only fixes (check recent CHANGELOG.md
entries — prior doc-fix PRs like the 2026-07-21 review's BUILD.md/
QUICKSTART-VIM.md fixes are useful precedent to check).
```

## Prompt for R-16 — Add graceful shutdown to the dev server

**Bundles:** R-16 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. src/tools/serve-static.js is a local development
server (npm start) serving the built public/ directory, loopback-bound by
default.

Problem: serve-static.js registers no SIGINT/SIGTERM handler. package.json's
"stop" script (`pkill -f 'node src/tools/serve-static.js' || true`) sends a
bare SIGTERM; with no listener, Node's default behaviour terminates the
process immediately without draining any in-flight HTTP response or closing
the server's sockets cleanly.

Goal: serve-static.js calls server.close() (and process.exit() once closed,
or lets the process exit naturally once the server has no more open
connections) on receiving SIGINT or SIGTERM, so `Ctrl-C` and `npm run stop`
both allow any in-flight response to complete before the process exits,
rather than dropping it abruptly.

Constraints: this is a small, local addition to the server's startup code —
do not change the server's routing, path-traversal guard, or any other
request-handling logic. Preserve the server's current behaviour when no
signal is received (i.e., don't add any new timeout or health-check
behaviour beyond the graceful-shutdown handler itself).

Verification: manually start the server (`npm start`), send it a SIGINT
(Ctrl-C in the foreground, or `kill -INT <pid>` if backgrounded) and confirm
it still exits (just via the new clean path rather than an abrupt kill); do
the same for `npm run stop` (SIGTERM). Run `npm test` and `npm run lint`
(both must pass) — check whether test/serve-static.test.js's existing setup/
teardown needs any adjustment given the server now handles these signals
explicitly (it likely does not, since tests probably don't send real OS
signals to the server, but verify this assumption before finishing).

Work cost-consciously. This entire task suits a low-cost model tier — a
small, well-specified, standard Node.js graceful-shutdown pattern.

Deliverable: a pull request with the fix, and a CHANGELOG.md entry under
[Unreleased] if the project logs dev-server-only changes there (check recent
entries for precedent; omit if not customary).
```

## Prompt for R-17 — Document a fast-subset/watch-mode test workflow

**Bundles:** R-17 only · **Run after:** no prerequisites

```text
Repo: Poetic-Poems/poetic. package.json's only test script is `"test": "node
--test"`, which runs the full suite (currently ~574 tests, ~20 seconds).
Node's built-in test runner supports both a --watch flag and running a
specific file/subset (e.g. `node --test test/golden.test.js`), but neither is
documented anywhere in this repo, and there is no dedicated watch-mode npm
script.

Goal: add a `"test:watch": "node --test --watch"` script to package.json,
and add a short note to CLAUDE.md's "Build commands" section (near the
existing `npm test` documentation) showing how to run a single test file or
subset, e.g. `node --test test/<file>.test.js`.

Constraints: do not change the existing `"test"` script's behaviour. Keep the
new documentation note brief and consistent with CLAUDE.md's existing style
in that section (a short fenced code block with a one-line comment, matching
the surrounding examples).

Verification: run `npm run test:watch`, confirm it starts in watch mode
(re-running on file changes) and then exits cleanly when interrupted (Ctrl-C).
Run `node --test test/golden.test.js` (or any single test file) and confirm
it runs only that file's tests. Run `npm run check` (trailing-whitespace
gate) since it covers CLAUDE.md as a tracked file.

Work cost-consciously. This entire task suits a low-cost model tier — a
one-line package.json addition and a short documentation note.

Deliverable: a pull request with both changes; a CHANGELOG.md entry is
likely unwarranted for a dev-workflow-only addition (check recent entries for
precedent before deciding either way).
```
