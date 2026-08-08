# Improvement prompts

One prompt per recommendation, in priority order (severity first, quick wins first at equal severity), matching `03-recommendations.md`. Each prompt is self-contained and may be pasted into a fresh AI agent session with no other context. There are no ordering dependencies between any of these prompts — they may be run in any order, or in parallel across separate branches, except where a prompt's own text says otherwise.

## Prompt for R-01 — Fix the OAuth loopback server's unescaped error reflection and missing CSRF check

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) framework for authoring poems in a plain-text `.poem`
format, converting them to YAML, and rendering them to static HTML. It
has a Blogger-publishing feature driven by an interactive OAuth helper at
src/tools/blogger-auth.js.

Problem: blogger-auth.js's waitForCode() function (around lines 336-387)
runs a short-lived local HTTP server on 127.0.0.1 that waits for Google's
OAuth redirect. It handles two outcomes: a `code` (success) branch that
checks `returnedState !== expectedState` against a CSRF `state` parameter
before doing anything else, and an `error` branch that does neither — it
never checks `state`, and writes the raw `error` query parameter straight
into its HTML response with no escaping (something like
`res.end(`<html>...<p>${error}</p>...`)`). Because the server accepts any
GET request matching the URL shape from any local process during the
short window it's waiting, another local process could send a crafted
`error` value, get it reflected unescaped into a page rendered in the
user's browser, and abort the legitimate auth flow without a valid state
token. Full details and evidence are in
reviews/project-review-2026-08-08/02-findings.md under finding F-SEC-01,
and in tech-debt/TD-PPpoet-26080802.md.

Goal (acceptance criteria):
1. The `error` branch of waitForCode() HTML-escapes the `error` query
   parameter before interpolating it into the response body. Reuse an
   existing HTML-escaping helper already in this codebase if one is
   suitable (e.g. aggregate-render-core.js's escapeHtml) rather than
   writing a new one from scratch, unless it doesn't fit this file's
   module boundaries — in that case a small local escape function is
   fine.
2. The `error` branch checks `returnedState !== expectedState` the same
   way the `code` branch already does, before acting on the request.
3. A test in test/blogger-auth.test.js covers: (a) the `error` branch's
   HTML output no longer contains unescaped `<`/`>` from a crafted error
   value, and (b) the `error` branch's behaviour when the state parameter
   doesn't match.

Constraints: Don't change the public shape of waitForCode()'s returned
Promise or its success-path behaviour. Don't add new dependencies —
either reuse or replicate existing escaping logic already in this
codebase. Follow this repo's existing code style (see CLAUDE.md and
eslint.config.js).

Verification: Run `npm run lint`, `npm test` (or `node --test
test/blogger-auth.test.js` for just this file), and `npm run coverage` to
confirm nothing regresses and the new test is picked up. All must pass
before you're done.

Work cost-consciously. Where your environment supports subagents,
delegate well-specified, self-contained subtasks to subagents running the
lowest-cost model tier that has a high probability of completing the
subtask correctly at the first attempt — a failed cheap attempt that must
be redone costs more than doing it right once. This is a small,
security-relevant fix: do the fix itself, and its review, at a
high-capability tier even if you delegate writing the new test case to a
cheaper tier. Verify all delegated work before integrating it.

Deliverable: a commit (or PR, following this repo's branch-workflow
conventions in CLAUDE.md) with the fix and its test, plus flip
tech-debt/TD-PPpoet-26080802.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference, leaving its body unchanged.
```

## Prompt for R-02 — Fix `build-poems.test.js`'s flaky mtime-comparison pattern

**Bundles:** R-02 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with a Node built-in test suite
(`node --test`).

Problem: test/build-poems.test.js has two tests (around lines 101-123 and
125-171) that compare an output HTML file's mtime before and after a
rebuild, to assert the rebuild actually touched the file. Both capture
the "before" mtime from the file's real, non-backdated wall-clock value,
then compare with a strict `>` against a value written moments later in
the same test run — a pattern that flakes on filesystems/environments
with coarse mtime resolution (documented as flaking "roughly one run in
three to five locally (WSL2)" in tech-debt/TD-PPpoet-26072901, which
already fixed the identical pattern in test/poem-to-yaml.test.js and
test/poem-to-raw-cli.test.js, but did not cover build-poems.test.js).
Full details in reviews/project-review-2026-08-08/02-findings.md under
F-TEST-01, and tech-debt/TD-PPpoet-26080803.md.

Goal (acceptance criteria): Both tests in test/build-poems.test.js rewind
the output file's baseline mtime into the past via `fs.utimesSync` before
capturing it as the "before" value, exactly matching the pattern already
used in test/poem-to-yaml.test.js (around lines 118-120) and
test/poem-to-raw-cli.test.js (around lines 127-129) — read those two
files first and copy the pattern verbatim, adapted to build-poems.test.js's
variable names.

Constraints: This is a mechanical, self-contained test-only change. Do
not touch src/tools/build-poems.js or any other production code. Do not
change what the tests assert, only how they establish their "before"
baseline.

Verification: Run `node --test test/build-poems.test.js` repeatedly (at
least 5 times in a loop) to build confidence the flake is gone, then run
the full `npm test` and `npm run lint` to confirm nothing else broke.

Work cost-consciously. This whole task is mechanical and suits a
low-cost model tier — if your environment supports subagents, a single
subagent can likely complete this correctly in one pass by copying the
existing pattern from the two sibling files named above. Verify its
output before integrating.

Deliverable: a commit (or PR, following CLAUDE.md's branch-workflow
conventions) with the test fix, plus flip
tech-debt/TD-PPpoet-26080803.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-03 — Add `--help` support across `src/tools/`'s CLIs

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework whose command-line entry points
live in src/tools/*.js (invoked via npm scripts like `npm run build:yaml`,
or directly with `node src/tools/<name>.js`).

Problem: src/tools/blogger-auth.js is the only CLI in src/tools/ that
recognises a `--help` flag and prints usage. The others do not:
src/tools/poem-to-yaml.js and src/tools/yaml-to-poem.js both misread
`--help` as an input filename and crash with a raw
`Error: ENOENT: no such file or directory, open '--help'`; src/tools/
build-poems.js, src/tools/poem-to-raw.js, and src/tools/sync-blogger.js
all silently ignore the flag and run their normal default action instead
(including a real build in build-poems.js's case). Full details in
reviews/project-review-2026-08-08/02-findings.md under F-UX-01, and
tech-debt/TD-PPpoet-26080804.md.

Goal (acceptance criteria): Every CLI entry point under src/tools/ that
has a `main()`/CLI-style invocation recognises `--help` and `-h` (check
`args.includes('--help') || args.includes('-h')`, or equivalent, ahead of
any positional-argument parsing or filesystem access) and, when present,
prints a usage string and exits with code 0, performing no other action
(no file reads/writes, no build). Read src/tools/blogger-auth.js's
existing `--help` handling first and match its style/tone for consistency
across the tool suite. Each tool's usage text should describe its actual
arguments (check each file's existing zero-argument error message, if
any, as a starting point for what the usage text should say).

Constraints: Don't change any tool's default (no-flag) behaviour. Don't
introduce a new shared dependency; a small shared helper function (e.g.
in a new or existing src/tools/ utility module) is fine if it reduces
duplication, but is not required — per-file guards are acceptable too.
Follow this repo's existing code style.

Verification: For each modified tool, run `node src/tools/<name>.js
--help` and confirm it prints usage and exits 0 with no side effects (no
new/changed files). Run the full `npm test` and `npm run lint` to confirm
nothing regresses. Add or extend tests (e.g. in each tool's existing
*-cli.test.js file where one exists) asserting `--help` prints usage and
exits 0.

Work cost-consciously. This is mechanical, well-specified, repeated
across ~5 files — well suited to a low-cost model tier, ideally one
subagent per file (or a few files) run in parallel, each given this exact
prompt plus the specific file to change. Verify each subagent's diff
before integrating; check that no subagent accidentally changed
default-invocation behaviour.

Deliverable: a commit (or PR) adding `--help` handling to all affected
tools plus tests, and flip tech-debt/TD-PPpoet-26080804.md's frontmatter
to `status: resolved` with today's date and the PR/commit reference.
```

## Prompt for R-04 — Fix README's YAML round-trip example

**Bundles:** R-04 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. Its README.md documents common
workflows, including converting a `.poem` file to YAML and back.

Problem: README.md's "Convert to YAML (and back)" example (around lines
207-216) shows three commands in one code block: convert a single file
with `poem-to-yaml.js`, then convert all files with `poem-to-yaml.js
--all`, then convert back with `yaml-to-poem.js src/poems/yaml/my-poem.yaml`.
If a reader runs only the first and third commands (reasonably treating
the first two as alternatives, "convert one file" vs "convert all
files"), the third command fails with
`Error: ENOENT: no such file or directory, open
'src/poems/yaml/my-poem.yaml'` — because the single-file form of
poem-to-yaml.js writes its output next to the input file (in
src/poems/poem/), not into src/poems/yaml/, when no explicit output path
is given. Running all three commands verbatim in sequence happens to
work, because the middle `--all` command incidentally also converts the
same file into src/poems/yaml/ first — which is why this has gone
unnoticed. Full details, including a reproduction, are in
reviews/project-review-2026-08-08/02-findings.md under F-DOC-01, and
tech-debt/TD-PPpoet-26080805.md.

Goal (acceptance criteria): Fix the example so it works correctly when a
reader runs exactly the commands shown, in the order shown, and nothing
else. Either (a) change the single-file poem-to-yaml.js command to pass
an explicit output path matching what yaml-to-poem.js expects next
(`node src/tools/poem-to-yaml.js src/poems/poem/my-poem.poem
src/poems/yaml/my-poem.yaml`), or (b) drop the single-file variant from
this example entirely and lead with `--all` (matching how
docs/POEM-TO-YAML.md already documents this correctly — read that file
for the accurate version of this workflow).

Constraints: Documentation-only change to README.md. Don't change any
source code or behaviour. Match this repo's "as-built" documentation
principle (see CLAUDE.md's "Documentation principles" section) — no
"previously"/"used to" phrasing describing the fix.

Verification: Actually run the corrected example's commands, in order, in
a scratch copy of this repo (or a temp directory with a copy of a poem
file), and confirm each command succeeds as documented, with no manual
steps beyond what's shown. Paste the terminal output (or a summary of it)
into your final report as evidence.

Work cost-consciously. This whole task is mechanical documentation work
and suits a low-cost model tier — a single subagent can likely complete
it correctly in one pass, provided it actually runs the commands to
verify rather than eyeballing the fix.

Deliverable: a commit (or PR) with the corrected README.md example, plus
flip tech-debt/TD-PPpoet-26080805.md's frontmatter to `status: resolved`
with today's date and the PR/commit reference.
```

## Prompt for R-05 — Document the local dev/test loop for human contributors

**Bundles:** R-05 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. It has a CLAUDE.md file written
for AI coding agents that documents build/test commands, and a README.md
with a "Contributing" section aimed at human contributors.

Problem: README.md's "Contributing" section (around lines 327-358)
explains the PR/branch-protection process and commit-message format in
detail, but never mentions the local commands CI actually gates on:
`npm test`, `npm run lint`, `npm run coverage`, `npm run check`
(trailing-whitespace check), and `npm run check:licenses`. These are
documented together only in CLAUDE.md, which explicitly targets AI
agents, not a human contributor reading the README. Full details in
reviews/project-review-2026-08-08/02-findings.md under F-TOOL-01, and
tech-debt/TD-PPpoet-26080806.md.

Goal (acceptance criteria): Add a short "Local development" (or similarly
titled) subsection to README.md's Contributing section — or, if you judge
it reads better as a separate file, create docs/CONTRIBUTING.md and link
it from README's Contributing section — listing the five commands above,
each with a one-line description of what it checks. You may mirror
CLAUDE.md's "Build commands" section's list and phrasing, adapted for a
human audience (CLAUDE.md's phrasing is fine as a starting point but
should read naturally in README's voice, not be a verbatim copy-paste of
an AI-agent-facing doc).

Constraints: Documentation-only change. Don't restructure the rest of
README's Contributing section beyond adding this subsection. Match this
repo's "as-built" documentation principle (CLAUDE.md's "Documentation
principles" section) — describe the current state, no historical
phrasing.

Verification: Read the final README.md (or new docs/CONTRIBUTING.md) top
to bottom to confirm it reads naturally and the five commands listed
exactly match package.json's actual script names. Run `npm run check`
(the whitespace gate) since it runs on Markdown files too.

Work cost-consciously. This whole task is mechanical documentation work
and suits a low-cost model tier.

Deliverable: a commit (or PR) with the new documentation, plus flip
tech-debt/TD-PPpoet-26080806.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-06 — Add test coverage for `sync-blogger.js`'s untested orchestration and network helpers

**Bundles:** R-06 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with an optional Blogger-sync
feature at src/tools/sync-blogger.js, tested via test/sync-blogger.test.js
using a mocked `global.fetch` (no real network calls).

Problem: src/tools/sync-blogger.js exports 20 functions; only 15 are
covered by test/sync-blogger.test.js. Untested: `getAccessToken` (around
line 426), `listAccessibleBlogs` (around line 458), `listAllPosts`
(around line 481), `diagnoseBloggerFailure` (around lines 767-777), and
`main()` itself (around lines 885-1012). This code path — sync-blogger.js's
main() — is invoked for real only by a consumer repository's own
production GitHub Actions workflow publishing to a live Blogger blog; this
framework repository's own copy of that workflow always skips it (no
.poetic-config.yaml enables it here), so nothing in this repo's own CI
ever exercises main() or these four helpers, even indirectly. Full
details in reviews/project-review-2026-08-08/02-findings.md under
F-TEST-03, and tech-debt/TD-PPpoet-26080807.md.

Goal (acceptance criteria), in order of priority:
1. Minimum: add direct unit tests for getAccessToken, listAllPosts,
   listAccessibleBlogs, and diagnoseBloggerFailure with `global.fetch`
   mocked, following the exact pattern test/sync-blogger.test.js already
   uses for the existing `createPost` tests (read that test first and
   copy its mocking style).
2. Stretch goal, only if it fits cleanly: refactor main() to accept an
   injectable dependencies object (mirroring src/tools/build-poems.js's
   `{ poemsDir, publicDir }` override pattern — read that file's main()
   for the exact shape to follow), so a test can drive the full per-poem
   sync loop end-to-end with fetch mocked. Only do this if it doesn't
   require restructuring unrelated parts of the file; the minimum goal
   above is an acceptable stopping point on its own.

Constraints: No real network calls in any new test — everything must go
through mocked `fetch`, matching this file's existing test conventions.
Don't change sync-blogger.js's actual production behavior, only add
tests (and, if you attempt the stretch goal, refactor main()'s dependency
injection without changing what it actually does).

Verification: Run `npm test` (or `node --test test/sync-blogger.test.js`)
and `npm run coverage` — confirm sync-blogger.js's line/function coverage
increases meaningfully from the current 80.96% lines / 81.48% funcs, and
the whole suite still passes with 0 failures. Run `npm run lint`.

Work cost-consciously. The minimum-goal unit tests (item 1) are
well-specified, mechanical work suited to a mid-cost model tier working
from the existing createPost test as a template. If you attempt the
stretch-goal refactor (item 2), that's more ambiguous, cross-cutting work
— do that part yourself at a higher-capability tier rather than
delegating it, and have a subagent verify the refactor didn't change
main()'s actual runtime behavior.

Deliverable: a commit (or PR) with the new tests (and, if attempted, the
main() refactor), plus flip tech-debt/TD-PPpoet-26080807.md's frontmatter
to `status: resolved` with today's date and the PR/commit reference —
note in the item's resolution which of the two goals (minimum or stretch)
was completed.
```

## Prompt for R-07 — Claim and resolve the tech-debt-ID-allocation race (`TD-PPpoet-26080801`)

**Bundles:** R-07 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with a per-item tech-debt register
under tech-debt/, allocated via scripts/next-tech-debt-id.pl and claimed
via a td/<id> branch-naming convention documented in TECH-DEBT.md.

Problem: tech-debt/TD-PPpoet-26080801.md (filed 2026-08-08, currently
open, not yet claimed by anyone) documents that
scripts/next-tech-debt-id.pl allocates the next tech-debt ID by scanning
existing filenames, not by reserving one — so two concurrent agents (this
repository is worked by many, per CLAUDE.md's "multi-agent environment"
section) can be handed the same ID and, in the worst case, one writer's
file write can silently overwrite an already-merged item's body as an
ordinary content modification rather than a git add/add conflict, which
no existing CI guard catches. Read tech-debt/TD-PPpoet-26080801.md in
full — it already contains a detailed, specific two-part suggested fix:
(1) an atomic `reserve-tech-debt-id` script that reuses the existing
td/<id> claim-branch push as a race-safe lock (loop: compute a candidate
ID, push a td/<id> branch from origin/main; a rejected push means someone
else got that ID, so retry with the next one; a successful push is the
reservation), and (2) an optional CI guard that fails a PR materially
rewriting an *open* item's body while leaving its status untouched (since
lifecycle edits are meant to be frontmatter-only).

Goal (acceptance criteria): Follow this repository's own "Claiming an
item" workflow exactly, as documented in TECH-DEBT.md:
1. `git fetch origin`, then confirm via
   `perl scripts/get-tech-debt-record.pl --ref origin/main
   TD-PPpoet-26080801` that the item's status is still `open` (not
   already claimed).
2. Confirm nobody holds the claim:
   `git ls-remote origin "refs/heads/td/TD-PPpoet-26080801"` must print
   nothing.
3. Create branch `td/TD-PPpoet-26080801` from origin/main, flip the
   item's frontmatter `status:` to `in-progress`, commit, and push. If
   the push is rejected, another agent won the race — stop here and
   abandon quietly, per TECH-DEBT.md.
4. Open a draft PR immediately.
5. Implement the item's suggested fix: the reserve-tech-debt-id script at
   minimum (part 1); the CI guard (part 2) is explicitly "optional" in
   the item's own text — do it if it fits cleanly within the same PR's
   scope, otherwise note it as follow-up rather than blocking on it.
   Update TECH-DEBT.md's "Filing an item" step 1 to reference the new
   script instead of the current manual-skim prose.
6. Once verified, flip the item's frontmatter to `status: resolved`,
   fill `resolved:` and `ref:` (the PR number), and mark the PR ready
   for review.

Constraints: This item's fix touches shared tooling
(scripts/next-tech-debt-id.pl and/or a new script, TECH-DEBT.md,
docs/TECH-DEBT-REGISTER.md, possibly
.github/workflows/tech-debt-register.yml) — read all of these files
first to understand the existing conventions before changing them. The
item's own text notes this script's canonical copy lives in this repo and
consumer repos hold byte-identical copies guarded by their own
td-tooling-drift workflows — do not break that byte-identical-copy
assumption without also checking (or at least flagging) what that
implies for consumers.

Verification: Run `perl scripts/td-check.pl` (`npm run
check:td-register`) to confirm the register stays consistent. If you add
a new script, test it manually by simulating the race it's meant to
prevent (e.g. two sequential invocations attempting to claim the same
date's next ID). Run the full `npm test` and `npm run lint`.

Work cost-consciously. This is ambiguous, cross-cutting tooling work
that affects a shared, concurrently-used system — do the design and the
core script logic yourself at a high-capability tier rather than
delegating it; a subagent can help with mechanical parts (writing tests
for the new script, updating documentation prose) once the design is
settled.

Deliverable: a PR implementing the fix, with tech-debt/TD-PPpoet-26080801.md's
frontmatter flipped to `status: resolved`, `resolved:` and `ref:` filled
in, its body left unchanged, and the PR marked ready for review.
```

## Prompt for R-08 — Simplify `yaml-to-poem.js`'s heading-conversion duplication

**Bundles:** R-08 (F-ARCH-02 + F-CODE-03 — both live in the same function, discovered in the same review pass; fixing the duplication is a natural side effect of the broader architectural note) · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. src/tools/yaml-to-poem.js
converts a poem's YAML representation back into the plain-text `.poem`
format, including a hand-rolled HTML-to-Markdown-ish conversion for
analysis/postscript sections.

Problem: convertHtmlToPlainText() in src/tools/yaml-to-poem.js (around
lines 583-688) is a ~124-line dispatcher that has grown by point-fixing
specific round-trip bugs over several tech-debt items (cited inline by ID
in its comments). Within it, four consecutive branches (around lines
605-616) handle `<h5>`, `<h4>`, `<h3>`, `<h2>` tags with near-identical
logic — match the tag, strip it, push a markdown heading marker — differing
only in the tag digit and the number of `#` characters emitted (`###`,
`##`, `#`, `#` — note h2 and h3 both collapse to a single `#`, which is
easy to misread as a bug when it's actually intentional). Full details in
reviews/project-review-2026-08-08/02-findings.md under F-ARCH-02 and
F-CODE-03, and tech-debt/TD-PPpoet-26080808.md.

Goal (acceptance criteria): Collapse the four heading branches into a
single small loop or lookup-table-driven check, e.g. a
`HEADING_LEVELS = { h5: '###', h4: '##', h3: '#', h2: '#' }`-shaped
mapping, iterated or looked up by parsed tag name, producing byte-for-byte
identical output to the current four-branch version for every existing
test case. Do not attempt a larger restructure of convertHtmlToPlainText
or the surrounding dispatcher — the review found the function's broader
shape currently well-mitigated by strong test coverage and recommends no
urgent action there; this task is scoped narrowly to the heading-branch
duplication only.

Constraints: The function's other 3 branches (multi-paragraph, "peeled"
tail element, literal-block wrap, plain-text fallback) must be left
untouched. Output must be byte-identical to current behaviour for every
existing fixture — this is a refactor, not a behaviour change.

Verification: Run the full `npm test`, paying particular attention to
test/yaml-to-poem-roundtrip.test.js and test/yaml-to-poem.test.js (the
files most likely to exercise this code path) — every test must still
pass with no output differences. Run `npm run coverage` to confirm
coverage doesn't drop. Run `npm run lint`.

Work cost-consciously. This is a well-specified, mechanical refactor
(replace N near-identical branches with one parameterised implementation)
suited to a mid-cost model tier, provided the agent verifies byte-identical
output against the existing test suite rather than assuming correctness.

Deliverable: a commit (or PR) with the refactor, plus flip
tech-debt/TD-PPpoet-26080808.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference. Note in the item's resolution
that only the heading-duplication part (F-CODE-03) was addressed, not a
broader restructure of convertHtmlToPlainText (F-ARCH-02's larger
observation, which the item's own text says needs no urgent action).
```

## Prompt for R-09 — De-duplicate path-containment fallback and date-coercion logic

**Bundles:** R-09 (F-CODE-01 + F-CODE-02 — both are small "extract and reuse an existing/shared helper" fixes discovered in the same CODE-dimension pass; bundled for reviewing efficiency, not because they share a file) · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with a shared path-containment
module at src/tools/path-guard.js (exporting `safeJoin`/`isWithinRoot`)
and a shared date-coercion helper at src/tools/date-utils.js (exporting
`toISODate()`).

Problem, two independent small duplications:
1. src/tools/footer.js (around lines 48-60, function
   resolveFooterSourcePath) and src/tools/build-blogger.js (around lines
   49-86, function resolveTemplatePath) each independently reimplement
   "resolve a configured path via safeJoin, check isWithinRoot, fall back
   on containment failure" on top of the same path-guard.js primitives,
   but with different fallback shapes (footer.js: one fallback;
   build-blogger.js: a four-tier cascade).
2. src/tools/sync-blogger.js (around lines 936-940) reimplements
   date-utils.js's toISODate() coercion inline
   (`raw.date instanceof Date ? raw.date.toISOString().slice(0, 10) :
   String(raw.date || '')`), but without toISODate()'s `isNaN` validity
   guard — so an actually-invalid Date instance would throw a RangeError
   here instead of degrading to null the way toISODate() does.
Full details in reviews/project-review-2026-08-08/02-findings.md under
F-CODE-01 and F-CODE-02, and tech-debt/TD-PPpoet-26080809.md.

Goal (acceptance criteria):
1. Add a shared helper to src/tools/path-guard.js, something like
   `resolveContainedConfigPath(repoRoot, configuredPath, { fallback })`
   (adjust the exact signature to whatever composes cleanly with
   build-blogger.js's multi-tier fallback cascade — it may need to accept
   an array of fallback candidates rather than a single one, to cover
   both call sites' actual needs). Update footer.js and build-blogger.js
   to use it instead of their own hand-rolled versions, preserving each
   call site's existing observable behaviour (footer.js's single
   fallback; build-blogger.js's four-tier cascade) exactly.
2. Replace sync-blogger.js's inline date-coercion branch (around lines
   936-940) with a call to date-utils.js's `toISODate(raw.date) || ''`
   (or equivalent, matching whatever the surrounding code expects on an
   invalid/missing date).

Constraints: No observable behaviour change at either footer.js's or
build-blogger.js's call sites — same fallback outcomes for the same
inputs, just implemented once instead of twice. The date-coercion change
in sync-blogger.js should only change behaviour on the invalid-Date edge
case (degrading gracefully instead of throwing) — verify this against
whatever downstream code handles the empty-string case already.

Verification: Run the full `npm test`, particularly
test/footer.test.js, test/build-blogger.test.js, and
test/sync-blogger.test.js (or their currently-named equivalents — check
actual filenames), plus test/path-guard.test.js if you extend path-guard.js's
exports. Run `npm run coverage` and `npm run lint`.

Work cost-consciously. Both changes are mechanical "extract to a shared
helper" refactors suited to a mid-cost model tier, provided the agent
checks each call site's existing test file to confirm no behaviour
changed.

Deliverable: a commit (or PR) with both fixes, plus flip
tech-debt/TD-PPpoet-26080809.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-10 — Unit-test `blogger-auth.js`'s OAuth URL construction

**Bundles:** R-10 only, though convenient to do alongside R-01 or R-12 since all three touch blogger-auth.js · **Run after:** no prerequisites (but check whether R-01's and R-12's prompts have already been run against this file, to avoid merge conflicts — if either is in flight, coordinate or wait)

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with an interactive OAuth helper
at src/tools/blogger-auth.js, tested via test/blogger-auth.test.js.

Problem: blogger-auth.js exports 10 functions; test/blogger-auth.test.js
covers only 6 (waitForCode, generateState, generatePkce,
describeBlogAccess, saveFileMode0600, promptHidden). Untested: parseArgs
(a small pure function, around line 88), exchangeCodeForTokens,
lookupBlogId, listMyBlogs (network-calling helpers), and all of main()
— specifically its construction of the OAuth consent URL (which query
parameters it includes: state, PKCE code_challenge/code_challenge_method,
requested scopes). Full details in
reviews/project-review-2026-08-08/02-findings.md under F-TEST-02, and
tech-debt/TD-PPpoet-26080810.md.

Goal (acceptance criteria): Add a test (or tests) asserting the OAuth
consent URL that main() constructs contains the correct query parameters
— state (matching whatever generateState() produced), PKCE
code_challenge and code_challenge_method=S256 (matching whatever
generatePkce() produced), and the expected scopes — without mocking
`fetch` and without performing a live OAuth round-trip. You will likely
need to extract the URL-construction logic into a small testable
function if it's currently inline in main() and hard to isolate — read
main()'s current structure first to decide the least invasive way to
make this testable. Adding parseArgs test coverage (it's a small pure
function) is also in scope, since it's free once you're already testing
this file.

Constraints: No real network calls or live OAuth flow. If you extract a
new function from main() to make the URL construction testable, keep
main()'s actual runtime behaviour unchanged (same URL constructed, same
console output, same control flow).

Verification: Run `node --test test/blogger-auth.test.js`, then the full
`npm test` and `npm run coverage` to confirm blogger-auth.js's coverage
improves from the current 49.83% lines / 57.14% funcs baseline. Run `npm
run lint`.

Work cost-consciously. This is well-specified test-writing work suited
to a mid-cost model tier — the main judgment call (whether/how to extract
a testable URL-construction function) is small enough not to need a
high-capability tier, but verify the extraction didn't change main()'s
behaviour before integrating.

Deliverable: a commit (or PR) with the new tests, plus flip
tech-debt/TD-PPpoet-26080810.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-11 — Bump `markdown-it` to v15

**Bundles:** R-11 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework using markdown-it (currently
pinned `^14.2.0` in package.json) to render analysis/postscript sections,
via a single construction site at src/tools/markdown.js (around lines
21-29: `new MarkdownIt({ html: true, typographer: true })`).

Problem: markdown-it 15.0.0 is available; this repo is still on 14.x.
This review's changelog analysis (recorded in
reviews/project-review-2026-08-08/02-findings.md under F-DEPS-01, and
tech-debt/TD-PPpoet-26080811.md) found v15's breaking changes (removed
lib/* subpath exports; linkify-it v6 default behaviour changes;
validateLink/normalizeLink/normalizeLinkText moved to prototype methods;
ESM/CJS resolution changes) don't appear reachable from this codebase's
actual usage — no linkify option is set, no subpath import exists, no
validateLink/normalizeLink override exists — but this was a static read,
not a live-tested confirmation.

Goal (acceptance criteria): Bump markdown-it to `^15.0.0` in package.json,
regenerate package-lock.json, and confirm the full test suite passes with
no rendering-output drift — particularly test/markdown.test.js and
test/yaml-to-poem-roundtrip.test.js, which exercise this dependency's
output most directly.

Constraints: Don't change src/tools/markdown.js's construction options
unless the test suite reveals an actual behavioural difference that needs
accommodating — the goal is a clean version bump, not a feature change.
If the test suite does reveal drift, investigate whether it's a genuine
v15 behaviour change (in which case, fix the calling code to
accommodate) or a real regression worth reporting upstream before
proceeding.

Verification: Run `npm install` (or `npm update markdown-it` per your
package manager's convention) to bump the lockfile, then `npm test` (full
suite), `npm run coverage`, `npm run build` (to confirm the actual poem
corpus renders with no visible diff — compare public/ output before and
after if practical), and `npm run lint`. All must pass.

Work cost-consciously. This whole task is a routine dependency bump
suited to a low-cost model tier — the only judgment call is what to do
if tests fail, which should escalate to you deciding rather than
guessing.

Deliverable: a commit (or PR) with the version bump, updated lockfile,
and confirmation all checks pass, plus flip
tech-debt/TD-PPpoet-26080811.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-12 — Add outbound-call timeouts to `blogger-auth.js`

**Bundles:** R-12 only, though convenient alongside R-01/R-10 since all three touch blogger-auth.js · **Run after:** no prerequisites (coordinate with R-01/R-10 if run concurrently, to avoid merge conflicts on the same file)

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. src/tools/sync-blogger.js has a
shared fetchWithRetry() helper (around lines 405-418) that wraps outbound
calls to the Google/Blogger APIs with a 30-second timeout
(AbortSignal.timeout()) and a single retry on 429/5xx responses.
src/tools/blogger-auth.js makes three real network calls to the same
Google OAuth/Blogger endpoints — exchangeCodeForTokens() (around lines
174-178), lookupBlogId() (around lines 192-194), listMyBlogs() (around
lines 217-219) — but uses plain `fetch(url, init)` with no timeout and no
retry for any of them.

Problem: a hung DNS resolution or an endpoint that accepts the connection
but never responds would leave blogger-auth.js (a manually-run,
interactive script) hanging indefinitely with no indication anything is
wrong. Full details in reviews/project-review-2026-08-08/02-findings.md
under F-OPS-02, and tech-debt/TD-PPpoet-26080812.md.

Goal (acceptance criteria): The three fetch() calls in blogger-auth.js
gain a timeout, bounding how long the script can hang on any one of them.
Reuse or mirror sync-blogger.js's fetchWithRetry() timeout pattern
(AbortSignal.timeout() with the same or a similar duration) — read that
function first. Retry logic is optional and not required here (this is a
one-shot interactive tool where a human can Ctrl-C if something looks
wrong) — the timeout alone satisfies this task; only add retry if it's a
trivial extension of whatever you build for the timeout.

Constraints: Don't change these calls' success-path behaviour or error
messages beyond what's needed to report a timeout clearly. If you extract
a shared helper usable by both blogger-auth.js and sync-blogger.js,
that's a reasonable improvement, but not required — a local
timeout-wrapping helper in blogger-auth.js alone is an acceptable, smaller
scope for this task.

Verification: Run test/blogger-auth.test.js and the full `npm test` to
confirm the three call sites' existing tests still pass (you may need to
update mocked fetch calls in tests if they don't already account for a
signal/timeout option being passed). Manually verify the timeout actually
fires by temporarily pointing one call at an unreachable host/port and
confirming it errors out within the timeout window rather than hanging
(then revert that manual test change). Run `npm run lint`.

Work cost-consciously. This is a small, well-specified, low-risk
robustness fix suited to a low-to-mid-cost model tier.

Deliverable: a commit (or PR) with the timeout added to all three call
sites, plus flip tech-debt/TD-PPpoet-26080812.md's frontmatter to
`status: resolved` with today's date and the PR/commit reference.
```

## Prompt for R-13 — Small documentation/config polish batch

**Bundles:** R-13 (F-CI-03 + F-CI-04 + F-GOV-01 + F-DOC-02 — four standalone, few-line documentation/config additions with no shared code path; bundled because reviewing four tiny diffs together is more efficient than four separate PR round-trips) · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. This task is four small,
independent documentation/config additions, detailed in
reviews/project-review-2026-08-08/02-findings.md under F-CI-03, F-CI-04,
F-GOV-01, F-DOC-02, and tech-debt/TD-PPpoet-26080813.md. Do all four in
one PR since each is tiny; they don't depend on each other and can be
done in any order.

1. Add a CI status badge near the top of README.md (after the title/logo,
   before the description), for the `build` workflow defined in
   .github/workflows/build-poems.yml. Use the standard GitHub Actions
   shields.io-style badge markdown
   (`![build](https://github.com/Poetic-Poems/poetic/actions/workflows/build-poems.yml/badge.svg)`
   linking to the workflow's Actions page), matching whatever style
   conventions the rest of README.md's header area already uses.

2. Add a short paragraph to docs/BUILD.md (or README.md, whichever
   already documents the release process — check CLAUDE.md's "Release
   process" section and follow wherever it points) describing what to do
   if a tagged release turns out to be bad: at minimum, note that
   consumer repos pin to a specific tag via `.poetic-version` and so
   aren't force-upgraded, and describe the expected remediation path
   (e.g. cut a new patch release with the fix; there is no support for
   deleting/retagging a published release). Keep this to a few sentences.

3. Add a `.github/PULL_REQUEST_TEMPLATE.md` with a minimal template
   consistent with this repo's actual PR conventions — read CLAUDE.md's
   "Branch workflow" and "Commit messages" sections first, since PR
   descriptions here feed directly into the squash-merge commit body
   (GitHub's `squash_merge_commit_message: PR_BODY` setting) and titles
   must be Conventional-Commits-formatted. The template should prompt for
   a summary and (where relevant) a test plan, without being heavyweight
   — this is a single-maintainer, mostly-self-review repository, not one
   soliciting complex external contribution.

4. Fix docs/YAML-SCHEMA.md's segment-label example (around lines 23 and
   27), which currently shows `label: "[Verse 1]"` and
   `label: "[Chorus]"` with brackets baked into the value. Real generated
   YAML never stores brackets in this field (check
   src/poems/yaml/_example.yaml and examples/example-blockquote.yaml for
   the actual bracket-free format, e.g. `label: Verse 1`) — the visible
   `[...]` wrapping is added only at render time in
   src/templates/_poem-content.pug. Change the example to bracket-free
   values matching every other label example already in the same file.

Constraints: All four are documentation/config-only changes — no source
code changes. Match this repo's "as-built" documentation principle
(CLAUDE.md's "Documentation principles" section).

Verification: Run `npm run check` (trailing-whitespace gate, applies to
Markdown too). For item 1, confirm the badge markdown resolves to a valid
image URL by checking the workflow file name and repo path are correct.
For item 4, diff your corrected example against real generated YAML to
confirm it now matches.

Work cost-consciously. This whole batch is mechanical documentation/config
work suited to a low-cost model tier — four independent subagents (one
per item) could run in parallel if your environment supports it, since
none of the four touch the same file.

Deliverable: a single commit (or PR) with all four changes, plus flip
tech-debt/TD-PPpoet-26080813.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-14 — Make `serve-static.js` importable via a `createServer()` factory

**Bundles:** R-14 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework with a local dev static-file
server at src/tools/serve-static.js, tested via test/serve-static.test.js.

Problem: serve-static.js has no module.exports — it calls
directoryExists(ROOT_DIR)/process.exit(1) and http.createServer(...) as
module-load side effects (around lines 224-229), and its graceful-shutdown
signal handlers are keyed off a Symbol.for(...) on the global `process`
object (around lines 399-411) purely to survive test/serve-static.test.js
reloading the module's source into a throwaway Module object per test
(around line 65), rather than being able to require() it directly. This
finding has recurred, unaddressed, across three consecutive project
reviews. Full details in reviews/project-review-2026-08-08/02-findings.md
under F-ARCH-01, and tech-debt/TD-PPpoet-26080814.md.

Goal (acceptance criteria): serve-static.js exports a
`createServer(rootDir, opts)` factory function that builds and returns
the HTTP server (and its route handlers, and — if opts requests it — its
graceful-shutdown signal handlers) without calling `.listen()` and without
binding SIGINT/SIGTERM handlers at module-load time. The file's CLI entry
point (the code that currently runs eagerly) becomes conditional on
`require.main === module`, calling createServer() and then `.listen()`
explicitly, so `node src/tools/serve-static.js` still works exactly as
before from the command line. test/serve-static.test.js is updated to
`require('../src/tools/serve-static.js')` directly and call
createServer() itself instead of compiling the file's source into a
throwaway Module — this will likely let you delete the
Symbol.for(...)-based re-registration guard entirely, since each test can
now get an independent server instance without module-cache tricks.

Constraints: `node src/tools/serve-static.js` (the CLI invocation) must
behave identically to today — same routes, same graceful shutdown on
SIGINT/SIGTERM, same startup output/errors. Preserve every existing test
assertion in test/serve-static.test.js; you're changing *how* the module
under test is loaded, not what's being asserted about its behaviour,
unless a specific assertion was itself testing the Module-compilation
workaround (in which case it can be removed, since the workaround is
gone).

Verification: Run test/serve-static.test.js specifically first to iterate
quickly, then the full `npm test`, `npm run coverage` (confirm coverage
doesn't drop), and `npm run lint`. Manually start the server
(`node src/tools/serve-static.js`) and confirm it serves pages and shuts
down cleanly on Ctrl-C, since this is exactly the path most likely to
regress silently under test-only verification.

Work cost-consciously. This is a refactor with test-suite implications —
have a high-capability tier do the createServer() extraction and the
CLI-entry-point conditional (since getting the require.main===module
guard and signal-handler lifecycle right matters for the module's only
real caller, the CLI), and a lower-cost tier can handle mechanically
updating the test file to call the new factory once the production shape
is settled. Verify the test-file changes preserve every original
assertion before integrating.

Deliverable: a commit (or PR) with the createServer() factory, the
require.main-gated CLI entry point, and the updated test suite, plus flip
tech-debt/TD-PPpoet-26080814.md's frontmatter to `status: resolved` with
today's date and the PR/commit reference.
```

## Prompt for R-15 — Fix the poem `$ref` caching subsystem's staleness and redundant-parse gaps

**Bundles:** R-15 (F-PERF-01 + F-PERF-02 + F-OPS-01 — all three concern the same `$ref`-resolution/caching subsystem shared across poem-render.js, build-all-poems.js, and serve-static.js; fixing them together avoids three separate PRs touching the same functions in sequence) · **Run after:** no prerequisites

```text
You are working in the "poetic" repository (Poetic-Poems/poetic), a
Node.js (>=22) poem-authoring framework. Poems can `$ref` shared partial
YAML files (labels, common stanzas, footers); resolution and caching of
these live in src/tools/poem-render.js, consumed by
src/tools/build-all-poems.js (the batch build) and src/tools/serve-static.js
(a long-running local dev server).

Problem, three related gaps in this subsystem, in priority order (do #3
first if you need to trim scope — it has the most user-visible impact):

1. (Lower priority) build-all-poems.js's "skip if up to date" fast path
   (around lines 466-476) computes a staleness-check source list by
   calling collectRefFiles() for every poem, which fully parses every
   poem's YAML and recursively yaml.load()s every $ref target —
   unconditionally, even when the build is about to conclude "nothing
   changed, skip." This cost grows linearly with corpus size and $ref
   fan-out and currently can't be skipped even on a no-op run.

2. (Lower priority) Within collectRefFiles() (poem-render.js, around
   lines 206-211), a $ref target is read via a bare
   `yaml.load(fs.readFileSync(fullPath, 'utf8'))` instead of via the
   shared readYamlCached() helper — even though the caller
   (refFilesForPoem(), poem-render.js around lines 234-242) already has
   access to the shared yamlCache passed down from build-all-poems.js. A
   $ref target shared by N poems gets parsed N times during this pass
   instead of once, compounding problem #1.

3. (Higher priority — most user-visible) serve-static.js's `/all-poems`
   route (around lines 235-253) re-renders on every HTTP request via
   concatenateAllHtmlFiles(), which reaches poem-render.js's
   resolveRefs() — but resolveRefs() consults a module-level, never-
   evicted refCache (poem-render.js line 37) that's cleared only by
   clearRefCache() (lines 286-288), which serve-static.js never calls.
   Since serve-static.js is a long-running process (started by `npm run
   build:all` and kept running via `npm run stop`'s counterpart), a poet
   editing a shared $ref'd partial while the dev server is running will
   see the *first*-resolved version of that partial on every subsequent
   `/all-poems` page load, however many times they save the source file,
   until they restart the server — with no error, warning, or
   documentation of this behaviour.

Full details in reviews/project-review-2026-08-08/02-findings.md under
F-PERF-01, F-PERF-02, and F-OPS-01, and tech-debt/TD-PPpoet-26080815.md.

Goal (acceptance criteria):
- Fix #3 (staleness): either have resolveRefs() accept an optional
  request-scoped cache parameter that serve-static.js's `/all-poems`
  handler creates fresh per request (bypassing the shared module-level
  refCache for this one live-render path only, while leaving
  build-poems.js's/tests' existing use of the module-level cache
  unaffected), or have the `/all-poems` route handler call
  clearRefCache() at the top of the request — trading away the shared
  cache's cross-request memoisation for this route specifically, in
  exchange for correctness. Pick whichever is the smaller, less invasive
  change once you've read resolveRefs()'s current signature and callers;
  document your choice's tradeoff in a code comment.
- Fix #2: thread the caller's cache parameter through to
  collectRefFiles()'s internal yaml.load call (via readYamlCached()),
  matching how refFilesForPoem() already does this for a poem's own
  top-level file.
- Fix #1, if time/scope allows after #2 and #3: this is the most
  involved of the three (persisting a ref-graph cache alongside the
  build manifest, invalidated on a poem's own mtime/size change) — if it
  doesn't fit cleanly in the same change as #2/#3, it's acceptable to
  leave it as follow-up scope in the resolved tech-debt item's notes,
  since #2 already reduces its cost somewhat by removing the redundant
  re-parsing.

Constraints: build-poems.js's existing per-process cache-clearing
behaviour (clearRefCache() at its own entry point) must be unaffected.
Don't change resolveRefs()'s behaviour for any caller other than
serve-static.js's `/all-poems` route. This is a live-service-style
correctness fix (#3) plus two build-performance fixes (#1, #2) — treat
#3 as the one that actually needs a regression test; #1/#2 are more
about not making an existing negative property worse, and are lower risk
if left partially done.

Verification: For #3, add a test (likely to test/serve-static.test.js)
that starts a server, requests `/all-poems`, changes a $ref'd partial's
content, requests `/all-poems` again, and asserts the second response
reflects the change — this test should fail against current code and
pass after your fix (verify this by checking it fails on the
unmodified code first). For #2, confirm via a coverage or a
targeted assertion that a shared $ref target is read from cache on the
second and subsequent references within one build's sources-computation
pass. Run the full `npm test`, `npm run coverage`, `npm run build`
(confirm a real build still succeeds and produces identical output for
the existing example corpus), and `npm run lint`.

Work cost-consciously. Fix #3 (the live-server staleness bug) is the one
most likely to have subtle cache-lifetime implications — do that one
yourself at a high-capability tier, including its regression test. Fix
#2 (threading an existing cache parameter through one more call site) is
mechanical and can be delegated to a mid-cost tier. Fix #1, if
attempted, is a genuine design decision (what does the persisted
ref-graph cache's invalidation key look like) and should stay with you
or a high-capability tier rather than being delegated.

Deliverable: a commit (or PR) with fixes for #3 and #2 at minimum (and
#1 if it fit), plus flip tech-debt/TD-PPpoet-26080815.md's frontmatter to
`status: resolved` with today's date and the PR/commit reference — note
in the item's resolution which of the three sub-problems were actually
fixed, if not all three, so any remainder is visible rather than silently
dropped.
```
