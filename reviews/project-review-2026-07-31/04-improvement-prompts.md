# Improvement prompts

One prompt per recommendation, in priority order (severity first, then effort). Each is self-contained and may be pasted into a fresh AI agent session with no other context. Ordering dependencies, where any exist, are noted in each prompt's **Run after** line and repeated inside the prompt text.

## Prompt for R-01 — Correct the stale tech-debt register entry and stop it recurring

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
Context: "poetic" is a Node.js framework for authoring poems as plain text
and building them to static HTML (GitHub: Poetic-Poems/poetic). It has a
mature tech-debt register at TECH-DEBT.md, following a documented Ledger
workflow (see that file's own header and "Claiming an item" section) with
tooling in scripts/ (next-tech-debt-id.pl, get-tech-debt-record.pl,
td-check.pl) and a CI gate (.github/workflows/tech-debt-register.yml).

The problem: TECH-DEBT.md's TD26072604 entry ("changelog-check required
status check missing from branch ruleset") is marked open, and its body
says the fix "needs admin/maintain permission on the repo" as if pending.
But the live GitHub branch-protection ruleset (id 18226786) has actually
included changelog-check as a required status check since 2026-07-28 —
verify this yourself with:
  gh api repos/Poetic-Poems/poetic/rulesets/18226786 --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks'
A stale file, RULESET-CHANGELOG-CHECK.md, sits at the repo root narrating
the fix as already done, which contradicts both the tech-debt register and
CLAUDE.md's documentation principle that other docs are as-built (no
dangling one-off narrative files describing a past action).

There is also an already-filed follow-on item, TD26080101 (see
TECH-DEBT.md's Current Items and Ledger), covering exactly this
recommendation's remaining scope: deleting the stale file, and the absence
of any mechanism that detects drift between this register and live GitHub
repository settings.

The goal — acceptance criteria:
1. TD26072604's Ledger row status is `resolved` (it may already have been
   flipped by an earlier review pass — check first via
   `perl scripts/get-tech-debt-record.pl --ref origin/main TD26072604`;
   if it is already resolved, skip to step 3).
2. If not already done: flip the row, remove its `### TD26072604` body from
   Current Items, per the two-part resolve convention td-check.pl enforces.
3. RULESET-CHANGELOG-CHECK.md is deleted from the repo root.
4. Its substance (that changelog-check is a required status check) is
   folded, if not already present, into CHANGELOG.md's existing v6.2.0
   entry for the relevant tech-debt items (TD26072113/TD26072604) — a
   sentence is enough, do not create a new file.
5. TD26080101 is claimed and resolved per the standard workflow (git fetch,
   confirm open, create branch td/TD26080101, flip in-progress, draft PR,
   do the work, flip resolved) — its resolution is "delete the stale file"
   plus a short written answer (in the resolved entry or a comment in
   TECH-DEBT.md's own instructions) to "how would a future review or
   maintainer notice register-vs-GitHub drift" (a documented manual check
   run periodically is an acceptable answer; new automation is not
   required).

Constraints: follow this repo's TECH-DEBT.md Ledger workflow exactly
(claim via td/<id> branch, draft PR immediately, flip status only once
verified). Do not touch any other tech-debt entries. Do not remove
TD26072604's Ledger row itself — only resolved rows are ever removed from
Current Items, never from the Ledger table.

Verification: run `perl scripts/td-check.pl TECH-DEBT.md` (also
`npm run check:td-register`) and confirm it reports consistency with no
errors. Confirm `git status` shows RULESET-CHANGELOG-CHECK.md deleted and
CHANGELOG.md updated.

Work cost-consciously. This whole task is mechanical (editing a Markdown
register in an established format, deleting a stale file) and suits a
low-cost model tier throughout — no delegation to subagents is needed given
the small scope, but if used, keep them on the same low-cost tier.

Deliverable: a pull request per this repo's branch workflow (feature branch
td/TD26080101, PR titled per Conventional Commits, e.g.
`docs(tech-debt): resolve TD26072604 and file drift-detection gap`),
containing the TECH-DEBT.md and CHANGELOG.md changes and the file deletion.
```

## Prompt for R-02 — Fix `yaml-to-poem.js --all`'s dead-code bug and add test coverage

**Bundles:** R-02 only · **Run after:** no prerequisites

```text
Context: "poetic" is a Node.js framework (github.com/Poetic-Poems/poetic)
converting a plain-text `.poem` format to YAML and back. Two sibling CLI
tools, src/tools/poem-to-yaml.js and src/tools/poem-to-raw.js, each support
a `--all` mode that converts every file in a canonical directory
(src/poems/poem/ or src/poems/yaml/), resolved via the shared REPO_ROOT
constant from src/tools/repo-root.js (anchored to the tools' own file
location, not process.cwd(), so behaviour doesn't depend on the invoking
directory). Both were recently refactored (commit a1d4608) to extract their
`--all` loop into a named, exported, unit-tested function.

The problem: src/tools/yaml-to-poem.js's `--all` mode was not part of that
refactor and is currently dead code. At line ~862 it computes
`const poemsDir = path.join(process.cwd(), 'src', 'poems');` and lists
files ending in `.yaml` in that directory. But YAML files live in
src/poems/yaml/, not directly in src/poems/ — so this loop matches zero
files every time. Confirm this yourself:
  node src/tools/yaml-to-poem.js --all
prints "Converted 0 YAML files to .poem format" and exits 0, even though
src/poems/yaml/ contains YAML files. No test in test/yaml-to-poem.test.js
or test/yaml-to-poem-roundtrip.test.js exercises `--all` or `main()` at
all — only the pure converter class and the single-file function are
tested.

The goal — acceptance criteria:
1. `node src/tools/yaml-to-poem.js --all` converts every `.yaml` file
   actually found in src/poems/yaml/ into a corresponding `.poem` file in
   src/poems/poem/, resolving the directory via REPO_ROOT (imported from
   src/tools/repo-root.js), not process.cwd() — matching the convention in
   poem-to-yaml.js's and poem-to-raw.js's `--all` modes exactly.
2. The `--all` loop is extracted into a named, exported function (mirror
   the naming/shape of `convertAllPoemsToYaml`/`convertAllPoemsToRaw` in
   the sibling files — something like `convertAllYamlToPoem`), with the
   thin CLI entry point (`main()`) calling it.
3. A new test (in test/yaml-to-poem.test.js or a new
   test/yaml-to-poem-cli.test.js, matching the existing test file naming
   convention) exercises this function against a temp directory with
   fixture YAML files, asserting the correct `.poem` files are written and
   the correct count is reported — mirroring how
   test/poem-to-raw-cli.test.js or test/poem-to-yaml.test.js test their own
   `--all` orchestration.

Constraints: do not change the single-file conversion behaviour (already
correct and documented in docs/POEM-TO-YAML.md); do not change the output
`.poem` file format itself, only where `--all` looks for input and writes
output. Follow this repo's existing code style (see eslint.config.js) and
test file conventions.

Verification: run `npm test` (all tests pass, including your new one) and
`npm run lint` (0 problems). Manually run
`node src/tools/yaml-to-poem.js --all` against this repo's actual
src/poems/yaml/ example poem(s) and confirm it reports a non-zero converted
count and writes into src/poems/poem/ correctly, then `git checkout` any
files it wrote as a side effect of your manual test so they don't pollute
your PR diff.

Work cost-consciously. This is a well-specified, self-contained bug fix
with a clear existing pattern to mirror (the sibling tools' `--all`
extraction) — a mid-cost tier should complete both the fix and its test in
one pass; delegate only the mechanical "write a test matching this existing
test file's structure" step to a subagent if you use one, and verify its
output before integrating.

Deliverable: a pull request with the fix, the new test, and a one-line
CHANGELOG.md entry under [Unreleased] (this is user-visible: consumer repos
running `yaml-to-poem.js --all` currently get silent no-ops).
```

## Prompt for R-03 — Add integration test coverage for `build-blogger.js`'s orchestration

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-authoring
framework. src/tools/build-blogger.js injects CSS/JS into a Blogger theme
template (public/blogger-template.html) for consumer repos that publish to
Blogger. It exports several functions: three pure helpers
(resolveTemplatePath, injectBetween, findSkinUnsafeTags) and one
orchestration function, injectCSSIntoTemplate(), which reads the configured
template path (resolved through src/tools/path-guard.js's containment
checks — the same safeJoin/isWithinRoot helpers used by serve-static.js and
footer.js), validates the CSS for disallowed tags, and writes the injected
result back to disk.

The problem: test/build-blogger.test.js imports and tests only the three
pure helpers — injectCSSIntoTemplate itself is never called by any test,
and this file is not invoked by any CI workflow either (confirm with
`grep -rn "build:blogger\|build-blogger" .github/workflows/*.yml`, which
returns nothing). c8 coverage confirms: run `npm run coverage` and check
build-blogger.js's line coverage (was 59.21% at last check, with uncovered
ranges covering essentially the whole orchestration body, lines ~145-244).
This means the path-containment check, the unsafe-CSS-tag rejection gate,
and the actual template-injection logic have no safety net at all — a
regression would only be caught when a maintainer runs
`npm run build:blogger` by hand against their own Blogger theme and it
visibly breaks.

The goal — acceptance criteria:
1. At least one test in test/build-blogger.test.js calls
   injectCSSIntoTemplate() (directly, or via a small refactor — see below)
   against a temporary directory containing a fixture template file plus
   CSS/JS content, and asserts the written output contains the expected
   injected markers/content.
2. A test covers the unsafe-CSS-tag rejection path (injectCSSIntoTemplate
   should refuse to inject CSS containing disallowed tags, per
   findSkinUnsafeTags — confirm the current rejection behaviour by reading
   the function before writing the test).
3. build-blogger.js's line coverage rises meaningfully above its current
   ~59%; re-run `npm run coverage` to confirm, though there is no
   requirement to hit any specific number beyond exercising the paths
   above.

Constraints: injectCSSIntoTemplate currently likely resolves its paths
relative to the real repo (via REPO_ROOT or similar) rather than taking a
directory as a parameter — you may need to refactor it to accept
publicDir/templatePath parameters (following the pattern already used by
sibling build scripts such as build-all-poems.js) purely to make it
testable against a temp directory; if you do this, keep the CLI entry
point's default behaviour (reading real config, writing to the real
public/ dir) unchanged. Do not change path-guard.js's containment logic
itself (that's tracked separately as TD26072801, out of scope here).

Verification: `npm test` passes including your new tests; `npm run lint`
reports 0 problems; `npm run coverage` shows build-blogger.js's coverage
has risen and the overall project thresholds (80/79/88% lines/branches/
functions, defined in package.json's `c8` block) still pass.

Work cost-consciously. The path-containment/security-relevant portion of
this work (verifying the unsafe-tag rejection test is meaningful, not just
present) deserves a high-capability tier's review even if a mid-cost tier
drafts the bulk of the test file; delegate the mechanical "write a
temp-directory fixture test matching this repo's existing test style" step
to a subagent if useful, but review its assertions yourself before
integrating — a shallow test that merely calls the function without
asserting real behaviour would not actually close this gap.

Deliverable: a pull request with the new/expanded tests (and the
parameterisation refactor if you did one), plus a one-line note in
TECH-DEBT.md if you judge any residual gap remains after your change
(e.g., if you decide not to wire build:blogger into CI at all, note that
decision was considered and why).
```

## Prompt for R-04 — Fix `build-poems.test.js`'s flaky mtime-comparison pattern

**Bundles:** R-04 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework. Its test suite previously had a class of flaky tests
that compared a file's modification time (mtime) before and after a fast
in-process rebuild, using a bare `>` comparison — on filesystems with
coarse mtime resolution, or when two writes land in the same timestamp
tick, this comparison can spuriously fail even though the code under test
behaved correctly. PR #133 (commit 5680b5c, resolving TD26072901) fixed
this in test/poem-to-yaml.test.js and test/poem-to-raw-cli.test.js by
rewinding the "before" file's mtime 60 seconds into the past via
fs.utimesSync before capturing the baseline, in addition to bumping the
changed input's mtime into the future — read those two files' relevant
tests (search for "utimesSync" and "mtimeMs") to see the exact pattern
before making any change.

The problem: test/build-poems.test.js has two tests with the identical
"does regeneration bump the output's mtime" shape that were never updated
to match. Specifically (read the file to get current exact line numbers,
approximate locations given here): one test captures
`pageMtimeBefore = fs.statSync(pagePath).mtimeMs` immediately after a first
build call (real wall-clock time, not backdated), then bumps only the
*source* YAML's mtime forward before rebuilding, then asserts the output's
new mtime is `>` the captured baseline (around line 110-122); a second test
does the same thing for a `$ref`-included file's mtime instead (around line
154-171). Both share the exact flaky shape PR #133 fixed elsewhere in this
codebase.

The goal — acceptance criteria: both tests rewind the output file's (not
just the input's) baseline mtime into the past via fs.utimesSync before
capturing pageMtimeBefore, using the same 60-second-offset pattern as
test/poem-to-yaml.test.js/test/poem-to-raw-cli.test.js, so the `>`
assertion can never come down to filesystem timestamp resolution
regardless of how fast the test runs.

Constraints: match the existing fixed pattern exactly (same offset, same
fs.utimesSync usage) rather than inventing a new approach — consistency
with the already-reviewed fix matters more than any alternative technique.
Do not change what the tests assert about (that rebuilding after a source
change bumps the output's mtime) — only how the "before" baseline is
captured.

Verification: run the two affected tests repeatedly to build confidence
they're no longer timing-sensitive, e.g.
`for i in $(seq 1 15); do node --test test/build-poems.test.js || break; done`
and confirm all 15 runs pass (mirroring PR #133's own verification
standard, stated in its description as "15 consecutive runs, 0 flakes").
Also run the full `npm test` suite once to confirm no regression elsewhere.

Work cost-consciously. This is a small, mechanical, well-specified change
that copies an already-reviewed pattern verbatim — it suits a low-cost
model tier entirely; no subagent delegation is really necessary given the
scope, but if used, keep it on the same low-cost tier and verify the
15-run check yourself before declaring done.

Deliverable: a pull request with the two test fixes; no CHANGELOG entry
needed (an internal test-reliability fix, not a user-visible change,
matching how PR #133 itself was categorised).
```

## Prompt for R-05 — Fix README's YAML round-trip example

**Bundles:** R-05 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework with a documented `.poem` <-> YAML conversion pipeline.
README.md has a "Convert to YAML (and back)" section demonstrating this.

The problem: README.md's example (search for "Convert to YAML (and back)")
shows, in order: (1) `node src/tools/poem-to-yaml.js src/poems/poem/my-poem.poem`
(single-file conversion, no explicit output path), (2)
`node src/tools/poem-to-yaml.js --all`, (3)
`node src/tools/yaml-to-poem.js src/poems/yaml/my-poem.yaml`. Command (1)
actually writes its output *alongside the input*, i.e. to
src/poems/poem/my-poem.yaml (an extension swap in the same directory) — not
to src/poems/yaml/. Confirm this yourself: copy an example poem to a temp
name, run command (1) against it, and observe where the .yaml file lands;
then observe that command (3), as literally written, fails with ENOENT
because nothing was ever written to src/poems/yaml/ for that file. (Clean
up any temp files your verification creates before finishing —
`git status` should be clean.) docs/POEM-TO-YAML.md documents command (1)'s
actual behaviour correctly already — only README.md is wrong.

The goal — acceptance criteria: README's example either (a) adds an
explicit output path to command (1), e.g.
`node src/tools/poem-to-yaml.js src/poems/poem/my-poem.poem src/poems/yaml/my-poem.yaml`,
so command (3) reads what command (1) actually wrote, or (b) reorders the
example to run `--all` before the yaml-to-poem.js step and drops the
single-file-then-round-trip framing, whichever reads more naturally in
context — read the surrounding section to judge which fits better. Either
way, add a one-line note that the single-file form writes its output
alongside the input by default.

Constraints: do not change any code — this is a documentation-only fix.
Do not alter docs/POEM-TO-YAML.md, which is already correct.

Verification: after editing, actually run the corrected commands in the
order shown, on a temp copy of an example poem, and confirm the full
sequence completes without error. Run `npm run check` (trailing whitespace
gate) to confirm the edit didn't introduce any.

Work cost-consciously. This is a small, self-contained documentation fix
suited entirely to a low-cost model tier.

Deliverable: a pull request with the corrected README.md section; no
CHANGELOG entry needed (a documentation correction, not covered by this
repo's "notable change" bar for changelog entries).
```

## Prompt for R-06 — Fix two remaining WCAG AA contrast failures in `poetic.css`

**Bundles:** F-UX-02 and F-UX-03 together — both are one-line colour fixes
in the same file (public/poetic.css), found in the same review pass; fixing
them together avoids two near-identical, easily-conflicting small PRs. ·
**Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js framework
that generates static poem-listing HTML pages, styled by public/poetic.css.
A prior fix (PR #85, commit 6f421cc) brought the site's colour palette to
WCAG AA compliance (4.5:1 minimum contrast for normal text) by darkening
every text/background use of the blue accent colour #007AFF to #0062CC,
because white-on-#007AFF (or the reverse) measures only ~4.02:1.

The problem — two selectors in public/poetic.css still fail AA contrast,
missed by that prior fix:
1. `.back-to-top` (around line 481-489): `background: #007AFF; color: white;`
   for a 20px "↑" glyph rendered by public/all-poems.js's back-to-top
   button — the exact colour pair #85 fixed everywhere else, still present
   here. Contrast ≈4.02:1 (below the 4.5:1 threshold; the glyph is normal-
   size text under WCAG's large-text rules, which need ≥24px regular or
   ≥18.66px bold to qualify for the lower 3:1 threshold — 20px doesn't
   qualify).
2. `.audio-cell:empty::after` (around line 465-468): `color: #ccc;
   content: "—";` rendered on a white table background in all-poems.html's
   table of contents — contrast ≈1.6:1, far below even the 3:1 non-text
   floor.

The goal — acceptance criteria:
1. `.back-to-top`'s background changes to `#0062CC` (matching the rest of
   the already-fixed palette; do not touch `.back-to-top:hover`'s
   `#0056CC`, which already passes at ~6.5:1) — OR its `color` changes to a
   sufficiently dark alternative; either reaches ≥4.5:1. Verify your chosen
   colour's contrast against white text using the standard WCAG relative-
   luminance formula (or a contrast-checker tool) before committing to it.
2. `.audio-cell:empty::after`'s colour changes to something already
   established in this file for muted-but-compliant text — e.g. the
   `#767676` used by `.no-content`/`.song-segment` elsewhere in
   public/poetic.css, which measures ≈4.5:1 on white — OR the cell is
   marked `aria-hidden`/decorative if you judge the dash conveys no
   information beyond the column header ("🎵 Audio") and the absent icon in
   the same row (read public/all-poems.html's table markup to confirm this
   reasoning before choosing that route).

Constraints: do not change any other colours in this file — this is a
narrow, targeted fix for exactly these two selectors. Preserve the visual
hierarchy (the back-to-top button should still read clearly as the same
blue-accent brand colour, just the compliant shade already used elsewhere).

Verification: if Chrome/Chromium is available in your environment, run
`npm run a11y` after your change and confirm no `color-contrast` violation
is reported for these two elements (it may report other, pre-existing
findings unrelated to this fix — only confirm these two are clean). If
Chrome is unavailable, compute the contrast ratio by hand for your chosen
colours against their backgrounds and state the numbers in your PR
description.

Work cost-consciously. This is a small, well-specified visual fix suited
to a low-cost model tier.

Deliverable: a pull request with the two CSS changes and a one-line
CHANGELOG.md entry under [Unreleased] (this is a user-visible
accessibility fix, matching how PR #85's original fix was categorised).
```

## Prompt for R-07 — Document the local dev/test loop for human contributors

**Bundles:** R-07 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework. Its root CLAUDE.md file (written for AI coding agents)
has a "Build commands" section listing the commands CI actually gates on:
npm test, npm run test:watch, npm run check (trailing whitespace),
npm run check:build, npm run check:licenses, npm run lint, npm run
coverage, npm start, npm run build, npm run build:all. Read
.github/workflows/build-poems.yml to confirm exactly which of these run as
required CI steps (as of this writing: test, lint, coverage-threshold
check, licence check, and the whitespace check all gate merges).

The problem: README.md's "Contributing" section (search for
"## Contributing") documents the PR-only branch-protection workflow and
the Conventional Commits requirement in detail, but never mentions any of
the commands above — a human contributor fixing a bug in src/tools/ has no
human-facing document telling them what to run locally before opening a
PR, so their first PR iteration routinely surfaces failures CI would have
caught in under a minute, that running these commands locally first would
have caught even sooner.

The goal — acceptance criteria: README.md's "Contributing" section (or a
new, linked docs/CONTRIBUTING.md, whichever fits the existing structure
better — check whether other docs/*.md files are linked from README's
Contributing section already, to match convention) gains a short
subsection listing the local commands a human should run before opening a
PR that touches src/tools/, src/templates/, or test/ — at minimum npm test,
npm run lint, npm run coverage, and npm run check — with one line each on
what they check.

Constraints: do not duplicate CLAUDE.md verbatim — that file is agent-
facing (a different audience/tone); write this section for a human reading
README on GitHub's web UI. Do not remove or restructure the existing
PR-process content in "Contributing" — add to it.

Verification: proofread that every command you list actually exists in
package.json's "scripts" block and actually appears as a CI step in
.github/workflows/build-poems.yml (or explain if you intentionally include
one that CI doesn't gate, e.g. test:watch, as a recommended-but-not-gated
local habit).

Work cost-consciously. This is a small, self-contained documentation
addition suited entirely to a low-cost model tier.

Deliverable: a pull request with the new README (or new CONTRIBUTING.md)
section; no CHANGELOG entry needed (documentation-only, not a "notable
change" for poem authors or site publishers per this repo's changelog
policy).
```

## Prompt for R-08 — Confirm `path-guard.js`'s symlink gap remains correctly tracked

**Bundles:** R-08 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework with a tech-debt register at TECH-DEBT.md. One open
item, TD26072801, describes src/tools/path-guard.js's containment checks
(safeJoin/isWithinRoot) as purely lexical — they never call
fs.realpathSync, so a symlink committed inside a served/config root can
point outside the root while still passing the lexical containment check.

The problem: this is not a new problem — a recent independent review
re-verified TD26072801's description is still accurate against current
code (all four call sites — serve-static.js's two guard sites,
build-blogger.js's template-path resolver, and footer.js's source-path
resolver — still rely on the lexical check alone) and confirmed the item's
severity/scope judgement (requires an attacker to first get a symlink
committed, at which point they could usually commit the target's content
directly instead) still holds. This prompt exists only to have that
re-verification acted on formally, since project reviews recommend but do
not themselves claim tech-debt items.

The goal — acceptance criteria: either (a) pick up TD26072801 and actually
fix it — resolve symlinks once inside path-guard.js so all current and
future call sites are covered, handling the ENOENT case sensibly (404 for
serve-static.js, fall back to the configured default for the two config
resolvers, rather than crashing) — or (b) if you judge it's still
correctly scoped as deferred work, leave it as is and do nothing; either
outcome is an acceptable, deliberate answer to this prompt, and doing
nothing is not a failure if you conclude (a) isn't warranted right now.

Constraints: if you do fix it, follow TD26072801's own claiming workflow
(TECH-DEBT.md's "Claiming an item" section: fetch origin, confirm still
open, branch td/TD26072801, flip in-progress, draft PR immediately). Do not
silently downgrade or delete the item without fixing it — if you decide not
to act, leave it exactly as is.

Verification (if you fix it): add a test that commits a symlink inside a
temp served/config root pointing outside it, and confirms path-guard.js's
containment check now rejects it (or serve-static.js 404s / the config
resolvers fall back, per which call site you're testing). Run `npm test`
and `npm run lint` to confirm no regression.

Work cost-consciously. If you fix it, this touches security-relevant
containment logic shared by three files — do the fix itself and its review
at a high-capability tier; a mid-cost tier can draft the accompanying
tests once the approach is decided.

Deliverable: either a pull request implementing and testing the fix (with
TD26072801 flipped to resolved per the standard workflow), or, if you
decide not to act, no changes at all and a one-sentence note in your final
report explaining why deferral remains the right call.
```

## Prompt for R-09 — De-duplicate small repeated logic: path-containment fallback and date coercion

**Bundles:** F-CODE-01 and F-CODE-03 together — both are "extract and reuse
a shared helper" fixes discovered in the same code-quality review pass, not
because they touch the same file. · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework.

Problem 1: src/tools/footer.js's resolveFooterSourcePath and
src/tools/build-blogger.js's resolveTemplatePath each independently
implement the same three-step shape — resolve a config-supplied path via
src/tools/path-guard.js's safeJoin(), check isWithinRoot(), and fall back
to a default if the check fails — but with two different fallback
strategies (footer.js returns one computed default immediately;
build-blogger.js falls through a separate multi-step priority chain). Read
both functions in full before changing anything, to understand exactly
what each fallback strategy currently does — the goal is to share the
containment-check shape, not necessarily to unify the two different
fallback behaviours, which may be intentionally different.

Problem 2: src/tools/sync-blogger.js (search for `raw.date instanceof
Date`) reimplements src/tools/date-utils.js's toISODate() inline, but
without that function's `isNaN(date.getTime())` guard — an actually-invalid
Date instance would throw inside toISOString() here, where every other
date-consuming call site in the codebase degrades gracefully instead.

The goal — acceptance criteria:
1. Add a shared helper to path-guard.js (e.g.
   `resolveContainedConfigPath(repoRoot, configuredPath, { fallback })`)
   that performs the safeJoin + isWithinRoot + warn-and-fall-back-to-a-
   caller-supplied-value shape once; update footer.js's and
   build-blogger.js's resolvers to call it, preserving each file's own
   distinct fallback *value/strategy* (pass build-blogger.js's multi-step
   fallback chain as a function/thunk if the current API needs a single
   fallback value — read both current implementations closely enough to
   decide the right shape before writing the helper, rather than guessing).
2. Replace sync-blogger.js's inline Date-coercion branch with a call to
   date-utils.js's toISODate(raw.date), falling back to '' to preserve
   current behaviour on a missing date — i.e. `toISODate(raw.date) || ''`
   (confirm this preserves existing behaviour for every value sync-blogger.js
   currently handles by reading its call site's surrounding code first).

Constraints: do not change either file's *behaviour* for any currently-
passing test — this is a pure refactor plus a bug-for-bug-compatible
replacement (except that the date branch gains a validity guard it lacked
before, which is a strict improvement, not a behaviour change any existing
test should notice). Run the full test suite before and after to confirm.

Verification: `npm test` (all pass, 0 new failures), `npm run lint` (0
problems), `npm run coverage` (thresholds still pass). If you add tests for
the new shared helper, follow this repo's existing test file conventions
(see test/path-guard.test.js if it exists, or the pattern used by other
src/tools/*.test.js files).

Work cost-consciously. Both changes are mechanical, well-specified
refactors with a clear existing pattern to generalise from — suited to a
mid-cost tier; delegate the "read both current fallback implementations and
summarize their exact behavioural difference" research step to a subagent
first if useful, then do the extraction yourself once you're confident you
understand both current behaviours precisely.

Deliverable: a pull request with both changes (they can land together or
as two small commits in one PR, since they're bundled here only for review
efficiency, not because they share code); no CHANGELOG entry needed
(internal refactor, no user-visible behaviour change).
```

## Prompt for R-10 — Make `serve-static.js` importable via a `createServer()` factory

**Bundles:** R-10 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework. src/tools/serve-static.js is its local dev server
(`npm start`). It currently has no module.exports and starts listening as a
side effect of being loaded — so test/serve-static.test.js's own header
comment explains that it works around this by compiling the file's source
into a throwaway Module per test, rather than requiring it directly. A
recent addition (graceful SIGINT/SIGTERM shutdown, PR #132) had to key its
handler registration off a `Symbol.for('poetic.serveStatic.shutdownHandlers')`
on the global `process` object specifically so that re-loading the module
once per test (via that same compile-from-source trick) replaces the
previous listener pair instead of accumulating new ones each test run —
read serve-static.js's current shutdown-handler code and
test/serve-static.test.js's header comment in full before starting, to
understand exactly what both workarounds currently do.

The problem: every feature this module gains has had to invent a fresh
accommodation for its own untestability, rather than the module simply
being importable like the rest of this codebase's tools (most of which
export their core logic and gate startup behind
`require.main === module`).

The goal — acceptance criteria: serve-static.js exports a
`createServer(options)` function that constructs and returns an http(s)
server with all routes and signal handlers wired up, WITHOUT calling
`.listen()` — the caller decides when/whether to start listening.
`require.main === module` guards a small block at the bottom of the file
that calls `createServer(parsedCliArgs).listen(port, host)`, matching the
CLI-entry/pure-logic split already used elsewhere in this codebase (e.g.
build-blogger.js's exported helpers vs its CLI entry). test/serve-static.test.js
is updated to `require('../src/tools/serve-static.js')` directly and call
`createServer()` per test, removing the source-compilation workaround
entirely; the `Symbol.for(...)` global-listener-dedup workaround becomes
unnecessary once each test gets its own fresh server instance via
createServer() rather than reloading the whole module, and can be removed
if your refactor confirms it's no longer needed (verify this rather than
assuming it).

Constraints: preserve every current CLI flag (--port, --dir, --host) and
every current route/behaviour (directory listing, path-traversal guards,
CORS header logic, graceful shutdown) exactly — this is a structural
refactor, not a behaviour change. Do not change serve-static.js's public
CLI interface (`npm start -- --port 9000` etc. must keep working
identically).

Verification: `npm test` passes, including every existing
test/serve-static.test.js case (rewritten to use the new interface but
asserting the same behaviours); `npm run lint` reports 0 problems; manually
run `npm start` and confirm the dev server still works (serves a poem page,
responds to Ctrl+C with a clean shutdown).

Work cost-consciously. This is a structural refactor touching a file with
existing test-suite workarounds — do the core refactor decision (the
createServer API shape) at a mid-to-high-capability tier given it affects
both production code and test infrastructure, but the mechanical parts
(updating each existing test call site to the new API) can be delegated to
a low-cost tier subagent once the new shape is settled; verify its output
against the full test suite before integrating.

Deliverable: a pull request with the refactored serve-static.js, the
updated test suite, and a one-line CHANGELOG.md entry under [Unreleased]
only if you judge this affects anything a consumer-repo maintainer might
notice (likely not, since the CLI interface is unchanged — use your
judgement).
```

## Prompt for R-11 — Unit-test `blogger-auth.js`'s OAuth URL construction

**Bundles:** R-11 only (optional recommendation — low priority) · **Run
after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework. src/tools/blogger-auth.js is a one-off interactive CLI
script a maintainer runs by hand to mint a Blogger OAuth refresh token,
never invoked by CI or any other script in this repo. Its security-
sensitive helper functions (generateState, generatePkce, waitForCode,
promptHidden, saveFileMode0600) already have direct, thorough unit tests in
test/blogger-auth.test.js. What's untested is main()'s orchestration —
specifically, building the OAuth consent URL from the generated state/PKCE
values and the configured client ID/scopes.

The goal — acceptance criteria: a new or extended test in
test/blogger-auth.test.js constructs the OAuth consent URL the same way
main() does (read main() to find exactly how it assembles the URL — likely
a helper function or inline URL/URLSearchParams construction) and asserts
its query parameters are present and correct: state matches the generated
value, code_challenge is derived correctly from the PKCE verifier,
code_challenge_method=S256 is present, and the requested scopes match what
the script needs. Do this WITHOUT mocking fetch() or requiring a live
network call — this is pure string/URL construction, testable in
isolation.

Constraints: do not test main()'s interactive prompting or token-exchange
network calls — those are out of scope for this optional, low-priority
recommendation. If, on reading main(), you find the URL construction isn't
cleanly separable into a testable unit without a larger refactor, it's
acceptable to extract just that piece into a small named function first
(e.g. `buildAuthorizationUrl(...)`), as long as you don't change its
behaviour.

Verification: `npm test` passes including your new test; `npm run lint`
reports 0 problems.

Work cost-consciously. This is small, optional, well-specified work suited
entirely to a low-cost model tier — if it turns out to need more than a
trivial extraction to test cleanly, stop and reconsider whether it's worth
doing at all, since this recommendation was explicitly marked optional
given the script's low usage frequency.

Deliverable: a pull request with the new test (and the extraction, if
needed); no CHANGELOG entry needed.
```

## Prompt for R-12 — Bump `markdown-it` to v15

**Bundles:** R-12 only · **Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework. It depends on markdown-it (currently pinned ^14.2.0,
resolved to 14.3.0) to render GFM-style Markdown in poem postscript/analysis
sections. Version 15.0.0 is available; `npm audit` shows no vulnerability
motivating urgency — this is routine dependency hygiene, not a security fix.

The goal — acceptance criteria: package.json's markdown-it dependency is
bumped to ^15.0.0 (or whatever the current latest 15.x is at the time you
do this), package-lock.json is regenerated accordingly, and the full test
suite — which includes markdown round-trip/rendering tests — passes with
no output drift.

Constraints: check markdown-it's own changelog/release notes between 14.x
and 15.x for any breaking change relevant to how this codebase uses it
(search src/ for `require('markdown-it')` or `require("markdown-it")` to
find every usage site first) before bumping — if a breaking change affects
this codebase's usage, note it in your PR description even if you work
around it; do not silently paper over a behaviour change.

Verification: `npm test` (all pass, paying particular attention to any test
that asserts exact Markdown-rendered HTML output — a byte-for-byte diff in
rendered output would be a regression worth catching, not just a test
failure to silence), `npm run lint`, `npm audit` (still 0 vulnerabilities),
`npm run build` (completes and produces output).

Work cost-consciously. This is routine, mechanical dependency-bump work
suited entirely to a low-cost model tier, unless the changelog check above
surfaces a real breaking change to reason about — escalate only that
specific judgement call to a higher tier if it comes up.

Deliverable: a pull request with the package.json/package-lock.json bump;
no CHANGELOG entry needed for a routine dev-dependency-adjacent bump with
no user-visible behaviour change (only add one if your changelog check
above finds an actual behaviour difference a poem author or site publisher
would notice).
```

## Prompt for R-13 — Small documentation/polish batch

**Bundles:** F-DOC-02, F-CI-02, F-TOOL-02, and F-GOV-01 together — four
independent, few-line documentation/config additions with no shared code
path; bundled purely because reviewing four one-line diffs together is more
efficient than four separate PR round-trips for changes this small. ·
**Run after:** no prerequisites

```text
Context: "poetic" (github.com/Poetic-Poems/poetic) is a Node.js poem-
authoring framework, single-maintainer, MIT-licensed. This prompt bundles
four small, independent polish items found during a routine project review.
Treat each as a separate, independently-committable change within one PR —
do not let any one of them block the others if it turns out to be more
involved than expected; skip it and note why in your PR description rather
than stalling the whole batch.

Item 1 — docs/YAML-SCHEMA.md's segment-label example is wrong: it shows
`label: "[Verse 1]"` (with literal square brackets) in its "Versions
Format" section, but real generated YAML never stores brackets in a
segment label (confirm by reading src/poems/yaml/_example.yaml, which has
e.g. `label: Stanza 1` with no brackets) — the visible `[...]` wrapping is
added only at HTML-render time by src/templates/_poem-content.pug. Fix:
change the example to `label: "Verse 1"` (no brackets), and optionally add
a one-line note that the renderer adds the visual brackets itself.

Item 2 — no documented rollback/yank path for a bad tagged release:
.github/workflows/release.yml's release job tags and publishes the moment
package.json's version changes on main, with no corresponding "if this
release was bad" procedure documented anywhere. Fix: add a short paragraph
to docs/BUILD.md (or README's release/versioning section, whichever this
repo's existing structure fits better — check both first) describing the
supported path if a release needs correcting — most repos of this shape
simply document "cut a patch release with the fix" as the only supported
path; state that explicitly if you judge it's the right answer here, rather
than inventing a more complex rollback mechanism this project doesn't need.

Item 3 — no CI/coverage status badge in README: add a build-poems.yml
status badge (shields.io or GitHub's native badge markdown) near the top of
README.md, next to the existing logo/screenshot. A coverage badge is
optional — only add one if you can wire it to a real, currently-published
coverage report; do not add a badge pointing at data that doesn't exist.

Item 4 — no .github/PULL_REQUEST_TEMPLATE.md exists. Add a short one
covering: a reference to the Conventional Commits PR-title requirement (see
README's "Contributing" section and CLAUDE.md's "Commit messages" section
for the exact convention to reference), and a brief reminder of what CI
gates (tests/lint/coverage/licence-check) — cross-reference R-07's work if
it has already landed (a "Developing poetic itself" section in README or a
CONTRIBUTING.md), otherwise write this to stand alone.

Constraints: these are all documentation/config changes; no application
code should change. Match this repo's existing documentation conventions
(as-built docs, no historical "previously"/"now uses" phrasing — see
CLAUDE.md's "Documentation principles" section) in whatever you write.

Verification: `npm run check` (trailing whitespace gate) passes on every
file you touch. For item 3, verify the badge actually renders correctly by
checking the badge URL resolves (e.g. via curl) before committing it.

Work cost-consciously. All four items are small, independent, well-
specified documentation/config additions suited entirely to a low-cost
model tier; if using subagents, one per item in parallel is a reasonable
way to work through this batch quickly, each verified before you integrate
its output.

Deliverable: a single pull request containing whichever of the four items
you complete (all four, ideally), each as its own commit for clarity; no
CHANGELOG entry needed for any of these (documentation/polish, not a
"notable change" per this repo's changelog policy).
```
