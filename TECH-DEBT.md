# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated. Live items live under the "Current Items"
heading as `### <id> <title>` sections. Once an issue has been resolved, remove
its `### <id> <title>` section from Current Items below — but never remove its
row from the Ledger table at the bottom of this file; see "Ledger" below.

Format:
```
### <id> <short title>

A description of what, why it matters, where, and a suggested fix.

```
Where `<id>` is a literal "TD" then the date followed by a zero-padded
sequential number (starting at 1 for the the first entry of a day). I.e.:
**TD*YYMMDDNN***. `NN` is one more than the highest `NN` already used for
that date **in the Ledger table**, not just what's currently visible above
it — a resolved entry's body is removed, but its Ledger row stays forever,
so the Ledger (not memory or scrollback) is the source of truth for the next
free ID. Compute it with `scripts/next-tech-debt-id.pl --ref origin/main`
(after a `git fetch origin`) rather than counting by hand — the `--ref` makes
the allocation reflect the shared state instead of a possibly stale checkout.
It still cannot see IDs allocated on unmerged branches, so also skim open
pull requests and `td/*` branches when filing.

IDs are only unique within this repository: sister repositories allocate from
the same date-based sequence, so the bare ID may exist in several of them.
When referring to an item anywhere outside this repository (a sister repo's
docs, a cross-repo PR, chat), qualify it with the repo name — e.g.
`poetic TD26071301`.

## Claiming an item

This repository is worked by concurrent agents: autonomous and interactive
sessions may pick up items at the same time, so a claim must be checked and
taken against the shared state, never against what a local checkout happens
to say. Before starting work on an open item:

1. `git fetch origin`, then confirm the item's Ledger row is `open` (not
   `in-progress`) **as of `origin/main`** — e.g. via
   `perl scripts/get-tech-debt-record.pl --ref origin/main <id>`.
2. Confirm nobody holds a claim: `git ls-remote origin "refs/heads/td/<id>"`
   must print nothing, and skim open pull requests for the ID (which also
   catches claims made on unconventionally named branches).
3. Create the claim branch, named exactly **`td/<id>`**, from `origin/main`;
   flip the item's Ledger row Status to `in-progress`; commit and push. The
   branch name is the claim lock: git refuses the push if the branch already
   exists, so a rejected push means another agent won the race — abandon
   quietly; never force-push over it.
4. Open a **draft** pull request right away — before the fix is finished — so
   `gh pr list` shows the claim too. The Ledger status flip can be its first
   commit.
5. Do the work, pushing further commits to the same branch/PR.
6. Once verified, flip the Ledger row to `resolved` (fill in `Resolved` and
   `Ref`), remove the entry's `### <id>` section from Current Items, and mark
   the PR ready for review.

If a claim is abandoned, close the draft PR and delete the `td/<id>` branch —
that releases the lock. The in-progress flip only ever lived on the branch,
so `main`'s Ledger still says `open` and nothing needs reverting.

## Review provenance

Where an item was filed from a project review's recommendation, record the
mapping here, and add the row when the item is filed — not when it is
resolved. A review's recommendations and this register are two channels onto
the same work, and the autonomous pipeline's Co-Ordinator uses exactly this
cross-reference to tell that they are: it skips a recommendation whose `R-NN`
is named in this file, on the grounds that this curated, status-tracked
channel owns it. Without the mapping it has only one other way to know a
recommendation is done — a merged PR referencing it — so work that landed as a
direct commit reads as outstanding forever, and the recommendation is selected
and re-investigated every cycle.

Only record a mapping once the Ledger item is known to cover the
recommendation's whole *Intended end state*. A recommendation that is broader
than the item mirroring it keeps the remainder in the review channel, where it
is still visible; claiming it here would silently retire work nobody has done.

| Review | Recommendation | Ledger ID |
|--------|----------------|-----------|
| [project-review-2026-07-11](reviews/project-review-2026-07-11/) | R-01 — Add a licence | TD26071101 |
| [project-review-2026-07-11](reviews/project-review-2026-07-11/) | R-06 — Complete package.json metadata | TD26071106 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-01 — Fix docs/BUILD.md's three self-contradictions | TD26072101 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-02 — Fix docs/QUICKSTART-VIM.md's broken paths | TD26072102 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-03 — Make the postscript toggle keyboard-operable | TD26072103 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-04 — Document governance reality (solo self-review, bus factor) | TD26072104 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-05 — Retire duplicate RELEASE_NOTES_*.md files | TD26072105 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-06 — Add regression tests for the fixed XSS surfaces | TD26072106 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-07 — Bump the Node engines floor past EOL | TD26072107 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-08 — Fix WCAG AA contrast failures | TD26072108 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-09 — Bring yaml-to-poem.js back in sync with the current YAML shape | TD26072109 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-10 — Split poem-parser.js into focused modules | TD26072110 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-11 — Extract duplicated escape-placeholder/beautify-options code | TD26072111 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-12 — Add a code-coverage tool | TD26072112 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-13 — CI hardening (changelog-bump check, strict status checks) | TD26072113 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-14 — Harden Blogger sync's operational resilience | TD26072114 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-15 — Add missing documentation cross-references | TD26072115 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-16 — Small defensive-hardening batch (config, dev server) | TD26072116 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-17 — Quote-style lint rule and JSDoc completion | TD26072117 |
| [project-review-2026-07-21](reviews/project-review-2026-07-21/) | R-18 — Miscellaneous small fixes | TD26072118 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-01 — Make changelog-check an actual merge gate | TD26072604 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-02 — Refactor and test sync-blogger.js's main() orchestration | TD26072605 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-03 — Route footer/blogger template config paths through path-guard | TD26072606 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-04 — Test serve-static.js's real request handler | TD26072607 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-05 — Export and test poem-to-yaml.js/poem-to-raw.js's CLI orchestration | TD26072608 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-06 — Exempt createPost from Blogger sync's rejection-retry | TD26072609 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-07 — Gate npm run coverage in CI with a threshold | TD26072610 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-08 — Replace inline onclick handlers in the analysis toggle | TD26072611 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-09 — Add timeout-minutes to CI jobs that lack one | TD26072612 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-10 — Mask the Blogger client-secret terminal prompt | TD26072613 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-11 — Add an automated licence-compatibility check | TD26072614 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-12 — Parse each poem's YAML once per aggregate build | TD26072615 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-13 — Add a `<main>` landmark and an automated accessibility checker | TD26072616 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-14 — Track browser-renderer error classification (already filed by this review) | TD26072617 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-15 — Fix three documentation-accuracy gaps | TD26072618 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-16 — Add graceful shutdown to the dev server | TD26072619 |
| [project-review-2026-07-26](reviews/project-review-2026-07-26/) | R-17 — Document a fast-subset/watch-mode test workflow | TD26072620 |

## Current Items

The open and in-progress items, each as a `### <id> <title>` section. This
heading is permanent: when there are no current items it stays here (empty), so
it is always obvious where a new item's body belongs.

<!-- Add new items directly below, as `### <id> <title>` sections. -->

### TD26072102 docs/QUICKSTART-VIM.md references a non-existent vim/ root path

The quickstart's install command and example-poem path predate the
`vim/` → `editors/vim/` move every sibling doc already reflects, so its first
documented command fails. Fix: update all path references to `editors/vim/` and
`src/poems/poem/_example.poem`.

### TD26072104 Governance docs don't state that review is currently self-review

`main`'s code-owner review gate is satisfied by the maintainer's own second
GitHub account (one person, two handles, one email throughout git history); the
project also has a 100% single-person bus factor with no succession plan.
CLAUDE.md's multi-agent tooling solves agent concurrency but doesn't provide
independent review or bus-factor redundancy, and the docs don't say so. Fix:
add a short, honest statement of this to CLAUDE.md/SECURITY.md.
### TD26072103 Postscript "See more" toggle is not keyboard-operable

`src/templates/_poem-content.pug`'s postscript preview uses a `display: none`
checkbox + label, which cannot receive keyboard focus — a live WCAG 2.1.1
violation, the same defect class the 2026-07-11 review fixed for sort headers
in a different component. Fix: replace with a real `<button aria-expanded>`
toggle, mirroring the existing analysis/song-embed controls in the same
template.

### TD26072602 Blogger sync posts poems strictly sequentially

`sync-blogger.js`'s `main()` loop creates, updates and deletes posts one at a
time, so a large collection's first sync takes as long as the sum of every
request's round trip. This is the remaining piece of project review
2026-07-21's R-14 — TD26072114 covered the job/request timeouts and
retry-on-rejection and deliberately left concurrency alone as R-14's
lowest-priority part. Fix: give the `main()` loop a small bounded worker pool
(process N poems concurrently), keeping the per-poem summary output stable;
worth doing only if sync runtimes are actually observed to be a problem.

### TD26072604 changelog-check required status check missing from branch ruleset

`release.yml`'s `changelog-check` job (added by #91) fails a PR that bumps
`package.json`'s version without a matching `CHANGELOG.md` entry, but the
active branch ruleset's `required_status_checks` list only names `build`,
`commit-format`, and the two `Analyze` contexts — `changelog-check` isn't in
it, so "Squash and merge" stays clickable even while it's red, and the
push-triggered `release` job doesn't re-check either. Project review
2026-07-26's R-01/F-CI-01. Fix: add `"changelog-check"` to the ruleset's
`required_status_checks` list (a GitHub settings change, not a code change —
needs admin/maintain permission on the repo).

### TD26072605 sync-blogger.js's main() has zero test coverage and untested complexity

`main()` (168 lines) inlines the per-poem create/update/skip decision and the
removal-pass loop — real branching business logic, unlike every other
function in the file, which is pure, exported, and unit-tested. It's the one
piece of the framework that mutates a live public Blogger blog on every push
to `main` touching `src/poems/**`, and the one part of this file with no test
coverage at all (69.35% stmt / 56% func for the whole file, concentrated in
this gap). Project review 2026-07-26's R-02/F-CODE-01/F-TEST-01. Fix: extract
the per-poem decision and removal-pass loop into named, exported functions,
then add an integration-style test mocking `global.fetch` that drives the
extracted orchestration through create/update/skip/removal/failure branches.

### TD26072606 footer.source/blogger.template config paths bypass path-guard

`footer.js`'s `resolveFooterSourcePath()` and `build-blogger.js`'s
`resolveTemplatePath()` both resolve a config-supplied path with no
containment check, unlike `serve-static.js`, which correctly uses
`path-guard.js`'s `safeJoin`/`isWithinRoot` for exactly this class of
problem. A `.poetic-config.yaml` author (a lower bar in a multi-contributor
poem collection than in this framework repo) can point either at an arbitrary
file, which then gets published verbatim to GitHub Pages or uploaded as the
live Blogger theme. Project review 2026-07-26's R-03/F-SEC-01. Fix: route
both functions through `path-guard.js`'s existing helpers, rooted at the repo
root/`public/`-equivalent scope.

### TD26072607 serve-static.js's real request handler is untested

`test/serve-static.test.js` stubs `http.createServer` to a no-op and only
exercises four pure helpers extracted from the module — the actual request
handler (the `/all-poems` endpoint, directory listing, both path-traversal
guard call sites, the 200/403/404 responses, SPA fallback) has never run
under test, even though `serve-static.js` is the only place in `src/` that
wires `path-guard.js` into request handling. Project review 2026-07-26's
R-04/F-TEST-02. Fix: capture the request-handler function itself (or use a
real `listen(0)`) and assert a traversal attempt returns 403, a normal file
returns 200, and a missing path falls through correctly.

### TD26072608 poem-to-yaml.js/poem-to-raw.js CLI orchestration (main()) is untested

Both files' `main()` — the `--all` loop, skip-if-up-to-date counting,
stale-artefact detection, per-file error counting/`exit(1)` — is unexported
and untested, unlike `build-poems.js`'s equivalent (`buildAllPoems()`, tested
via `spawnSync` including its exit paths). Every consumer repo runs this code
on every build, but only the project's own pristine corpus ever exercises it
today. Project review 2026-07-26's R-05/F-TEST-03. Fix: export each file's
per-file loop as a testable function and add `spawnSync`-driven tests
mirroring `test/build-poems.test.js`'s pattern.

### TD26072609 sync-blogger's createPost retry can duplicate-post a poem

`fetchWithRetry()` retries any rejected fetch once, applied uniformly to
every Blogger call including the non-idempotent `createPost`. If a create
request reaches Blogger and is processed, but the response is lost to the
client (timeout/connection reset), the retry creates a second live post for
the same poem — no idempotency key, no re-check against existing posts.
Project review 2026-07-26's R-06/F-OPS-01. Fix: exempt `createPost` from the
rejection-retry path, or re-check for a same-slug post before retrying it.

### TD26072610 npm run coverage exists but isn't gated in CI

`c8` is configured and runnable locally, but no workflow runs it, uploads a
report, or checks a threshold — the 2026-07-21 review's R-12 is satisfied at
the "tool exists" level, not the "CI enforces it" level, and several of this
framework's riskiest paths (see TD26072605, TD26072607) already sit at the
lower end of the coverage range with no tripwire against further slippage.
Project review 2026-07-26's R-07/F-CI-02/F-TOOL-01 (the identical gap found
independently by two dimension passes). Fix: add a `coverage` step to
`build-poems.yml`'s `build` job using `c8 --check-coverage` with a floor a
little below the current 79%/82%/88%.

### TD26072611 Analysis toggle uses inline onclick handlers instead of delegated listener

`_poem-content.pug`'s four analysis show/hide/selector controls use
hand-written, string-interpolated `onclick` JS (including a helper redefined
identically in two adjacent buttons), contradicting the template's own "do
not add a script block here" comment and diverging from the postscript
toggle's already-fixed delegated-listener pattern in `public/poetic.js`.
Project review 2026-07-26's R-08/F-ARCH-01/F-CODE-02. Fix: replace the
`onclick` attributes with `data-*` attributes and one delegated `click`
listener in `public/poetic.js`, mirroring the postscript-toggle fix.

### TD26072612 Most CI jobs have no timeout-minutes

Only `sync-blogger.yml` sets a job `timeout-minutes`; every other workflow's
jobs — including `build-poems.yml`'s required `build` check — default to
GitHub Actions' 360-minute ceiling, so a hang could occupy a runner for up to
6 hours before being killed. No evidence this has happened. Project review
2026-07-26's R-09/F-CI-03. Fix: add a modest `timeout-minutes` (e.g. 10-15 for
`build`, 5 for lighter jobs) to each workflow lacking one.

### TD26072613 Blogger client secret echoed to terminal during interactive entry

`blogger-auth.js`'s interactive `BLOGGER_CLIENT_SECRET` prompt uses a plain
`rl.question()` with no output-muting, so the typed secret appears in
cleartext on screen and in scrollback; the env-var path already avoids this.
Project review 2026-07-26's R-10/F-SEC-02. Fix: mask the prompt (disable TTY
echo for that one question), or document the env-var path as the way to
avoid on-screen echo.

### TD26072614 No automated licence-compatibility check for dependencies

No CI step or script verifies dependency licences; ~45 transitive packages
have no recorded licence field in `package-lock.json` (well-known
permissively-licensed tooling, no evidence of an actual conflict today).
Nothing would catch a future dependency introducing a copyleft or otherwise
MIT-incompatible licence before it lands. Project review 2026-07-26's
R-11/F-DEPS-01. Fix: add a CI step running `license-checker --onlyAllow` (or
equivalent) against the production dependency tree.

### TD26072615 build-all-poems.js parses each poem's YAML up to four times

`concatenateAllHtmlFiles()`, `loadPoemData()`, `generateIndexHtml()`, and the
staleness-check's `sources`-set computation each independently read+parse
every poem's YAML — including before the "nothing changed, skip" fast path
even runs, so it isn't actually O(1). Linear, not quadratic, and likely
negligible at real-world scale, but avoidable redundant I/O that undercuts
the incremental-build fast path's own purpose. Project review 2026-07-26's
R-12/F-PERF-02. Fix: parse each poem's YAML once per build and share the
parsed object across metadata extraction and `$ref` resolution.

### TD26072616 No `<main>` landmark on generated pages; no automated accessibility checker

None of `index.html`, `all-poems.html`, or individual poem pages contain a
`<main>` landmark (screen-reader/switch-access users have no "jump to main
content" region, distinct from heading navigation), and no automated
accessibility tool (axe/pa11y) runs anywhere — both prior real a11y
regressions (the keyboard-trap toggle, WCAG contrast failures) were caught by
manual review only. Project review 2026-07-26's R-13/F-UX-01/F-UX-02. Fix:
wrap each template's primary content in `<main>`, and add a non-blocking
`pa11y-ci`/`axe-core` CI check against the index and one poem page.

### TD26072617 Browser-renderer errors are unclassified plain Error objects

`src/browser/render.js`/`render-aggregate.js` throw bare `Error`s with no
`.code`/`.name`, so a consumer of the `poetic/browser` export can't
distinguish error kinds programmatically. This was flagged in the 2026-07-21
review's TD26072118 batch, but that item's own closing commit explicitly
deferred this specific piece ("left as-is... not a small, safe edit") without
filing a follow-on entry, so it existed in no tracked register until now —
project review 2026-07-26's R-14/F-UX-03/F-GOV-01 both note the tracking gap
itself as the finding; this entry is that recommendation's entire intended
end state, already actioned as part of this review. Fix: add `.code`/`.name`
classification to thrown errors in both browser-render files.

### TD26072618 Documentation-accuracy gaps: edit-poem exit code, BUILD.md phrasing/description

Three small, independent doc-accuracy gaps: `scripts/edit-poem`/
`docs/SCRIPTS.md` document a `-1` no-match exit code that's actually `255`;
`docs/BUILD.md` carries one "previously"-phrased historical sentence contrary
to CLAUDE.md's as-built principle; and the same file's File Structure diagram
mislabels `poetic.js` as Audiomack-specific while omitting its
postscript-toggle responsibility. Project review 2026-07-26's
R-15/F-DOC-01/F-DOC-02/F-DOC-03. Fix: reconcile the exit-code docs with
reality, drop the historical parenthetical, and reword the `poetic.js`
diagram entry to cover both responsibilities.

### TD26072619 serve-static.js dev server has no graceful shutdown

No `SIGINT`/`SIGTERM` handler; `npm run stop` sends a bare `SIGTERM` that
terminates the process immediately without draining in-flight responses. Low
real-world impact (a loopback-bound dev server with nothing stateful to
flush). Project review 2026-07-26's R-16/F-OPS-02. Fix: call `server.close()`
on `SIGINT`/`SIGTERM`.

### TD26072620 No fast-subset/watch-mode test workflow documented

`package.json`'s only test script runs the full suite; there's no
`test:watch` and no documented way to run a subset, though
`node --test test/<file>.test.js` already works. Minor friction only — the
full suite is fast (~20s) today. Project review 2026-07-26's
R-17/F-TOOL-02. Fix: add a `test:watch` script and a one-line note in
CLAUDE.md's build-commands section.

## Ledger

Every tech-debt ID ever allocated — open, in-progress, resolved, or not-debt —
is listed here forever, in ID order. This is what makes numbering unambiguous:
the next free ID for a given date is one more than the highest `NN` seen
below for that date, regardless of whether the corresponding entry still has
a body above.

A row can also close as `not-debt`: the item was filed here but turned out, on
reflection, not to be a deferred cost at all (e.g. deliberately reserved
syntax awaiting a future feature). Its `### <id>` section is removed like a
resolved one, but nothing was fixed, so the `Resolved` column stays blank; the
`Ref` column instead points to wherever the content moved.

| ID | Title | Status | Resolved | Ref |
|----|-------|--------|----------|-----|
| TD26070801 | `npm test` is not run in CI | resolved | 2026-07-09 | 1ebf92a |
| TD26070802 | `poem.vim` title/end-marker highlighting quirks | resolved | 2026-07-09 | 6e5683a |
| TD26070803 | `sync-framework.sh` `is_skipped` breaks on bash < 4.4 | resolved | 2026-07-09 | 4f0ecd6 |
| TD26071001 | Accept a full mega.nz/file/... share URL for the Mega handler | resolved | 2026-07-10 | 466f98b |
| TD26071002 | Per-handler override of the embed iframe allow / allowfullscreen | resolved | 2026-07-11 | 30643d5 |
| TD26071003 | vim-syntax golden no longer pins the analysis-section markdown | resolved | 2026-07-11 | 55863e5 |
| TD26071101 | No licence | resolved | 2026-07-11 | c5d7825 |
| TD26071102 | Site name "Fragments & Unity" hard-coded in generators | resolved | 2026-07-11 | f155057 |
| TD26071103 | Poem conversion failures do not fail the build | resolved | 2026-07-11 | 48eb62c |
| TD26071104 | blogger-auth and sync-blogger disagree on the credentials-file format | resolved | 2026-07-11 | f8f9500 |
| TD26071105 | Embedded client JS is untested and unlintable | resolved | 2026-07-11 | e105d2a |
| TD26071106 | package.json lacks name, version, license, engines | resolved | 2026-07-11 | c5d7825 |
| TD26071107 | sync-framework.sh never deletes upstream-removed files; dead tools ship | resolved | 2026-07-11 | 94e650f |
| TD26071108 | No linter; commit-format check is opt-in only | resolved | 2026-07-11 | cf0bf26 |
| TD26071109 | js-yaml stuck on v4; v5 changes timestamp-quoting for edge-case date strings | resolved | 2026-07-11 | 7c4c29a |
| TD26071110 | build-check-fallback.yml's path list is a hand-maintained mirror | resolved | 2026-07-11 | #10 |
| TD26071111 | Incremental-rebuild dependency tracking is approximate | resolved | 2026-07-12 | #14 |
| TD26071201 | `\?` escape prefix is reserved but not yet implemented | not-debt | | docs/POEM-SYNTAX.md |
| TD26071202 | Preamble grammar omits comment blocks despite the prose | resolved | 2026-07-12 | #24 |
| TD26071301 | Browser renderer is not yet packaged for consumption | resolved | 2026-07-13 | #33 |
| TD26071302 | Aggregate (index + all-poems) renderers are not browser-safe | resolved | 2026-07-13 | #34 |
| TD26071501 | yaml-to-poem entity decoding is order-fragile, not structurally single-pass | resolved | 2026-07-15 | #47 |
| TD26071502 | convertMarkup's escape-restoration loop is quadratic in the number of escapes | resolved | 2026-07-15 | #49 |
| TD26071701 | blogger-auth cannot overwrite a read-only credentials file | resolved | 2026-07-17 | #57 |
| TD26071901 | All-poems template interpolates the poem title unescaped | resolved | 2026-07-19 | #63 |
| TD26071902 | Index grid and all-poems listing don't render title inline markup | resolved | 2026-07-20 | #72 |
| TD26072101 | docs/BUILD.md describes a superseded build and contradicts itself on two filenames | resolved | 2026-07-22 | 0972e62 |
| TD26072102 | docs/QUICKSTART-VIM.md references a non-existent vim/ root path | resolved | 2026-07-22 | 5655c57 |
| TD26072103 | Postscript "See more" toggle is not keyboard-operable | resolved | 2026-07-22 | #79 |
| TD26072104 | Governance docs don't state that review is currently self-review | resolved | 2026-07-22 | #80 |
| TD26072105 | Root-level RELEASE_NOTES_*.md files duplicate CHANGELOG.md | resolved | 2026-07-22 | #81 |
| TD26072106 | serve-static.js and public/index.js's fixed XSS have no regression tests | resolved | 2026-07-24 | #82 |
| TD26072107 | package.json's engines.node floor (>=18) is past EOL | resolved | 2026-07-24 | #83 |
| TD26072108 | Several public/poetic.css text colours fail WCAG AA contrast | resolved | 2026-07-24 | #85 |
| TD26072109 | yaml-to-poem.js silently drops data the current YAML shape can hold | resolved | 2026-07-24 | #87 |
| TD26072110 | poem-parser.js is a 1854-line monolith covering the whole grammar | resolved | 2026-07-26 | #104 |
| TD26072111 | Escape-placeholder and js-beautify-options code duplicated across files | resolved | 2026-07-25 | #86 |
| TD26072112 | No code-coverage tool configured | resolved | 2026-07-24 | #88 |
| TD26072113 | No CI check ties a version bump to a CHANGELOG entry; status checks aren't strict | resolved | 2026-07-26 | #91 |
| TD26072114 | Blogger sync has no request/job timeouts and no network-failure retry | resolved | 2026-07-26 | #92 |
| TD26072115 | README and docs/POEM-TO-YAML.md are missing two cross-references | resolved | 2026-07-24 | #84 |
| TD26072116 | Small config/dev-server hardening gaps (enum validation, CORS, credentials permissions) | resolved | 2026-07-25 | #93 |
| TD26072117 | No quotes ESLint rule; JSDoc discipline weakest in the most complex file | resolved | 2026-07-25 | #94 |
| TD26072118 | Small independent fixes: poem-page heading level, vim ftdetect placeholder, browser-renderer errors, sync-framework doc callout | resolved | 2026-07-24 | #89 |
| TD26072201 | docs/VIM-SYNTAX.md still references a non-existent vim/ root path | resolved | 2026-07-24 | #90 |
| TD26072401 | yaml-to-poem.js's plain-line writers still mangle content TD26072109 didn't touch | resolved | 2026-07-25 | #98 |
| TD26072501 | Lint rules reach generated `public/*.js` that consumers may track, but `.gitignore` isn't synced | resolved | 2026-07-25 | #99 |
| TD26072502 | convertHtmlToPlainText() still loses a trailing newline for single-block multi-element postscript/analysis content | resolved | 2026-07-26 | #103 |
| TD26072601 | poem-parser.js still has ~46 methods covering variable substitution and metadata parsing | resolved | 2026-07-26 | #106 |
| TD26072602 | Blogger sync posts poems strictly sequentially | open | | |
| TD26072603 | poem-parser.js still has metadata-parsing methods sharing mutable instance state | resolved | 2026-07-26 | #108 |
| TD26072604 | changelog-check required status check missing from branch ruleset | open | | |
| TD26072605 | sync-blogger.js's main() has zero test coverage and untested complexity | open | | |
| TD26072606 | footer.source/blogger.template config paths bypass path-guard | open | | |
| TD26072607 | serve-static.js's real request handler is untested | open | | |
| TD26072608 | poem-to-yaml.js/poem-to-raw.js CLI orchestration (main()) is untested | open | | |
| TD26072609 | sync-blogger's createPost retry can duplicate-post a poem | open | | |
| TD26072610 | npm run coverage exists but isn't gated in CI | open | | |
| TD26072611 | Analysis toggle uses inline onclick handlers instead of delegated listener | open | | |
| TD26072612 | Most CI jobs have no timeout-minutes | open | | |
| TD26072613 | Blogger client secret echoed to terminal during interactive entry | open | | |
| TD26072614 | No automated licence-compatibility check for dependencies | open | | |
| TD26072615 | build-all-poems.js parses each poem's YAML up to four times | open | | |
| TD26072616 | No `<main>` landmark on generated pages; no automated accessibility checker | open | | |
| TD26072617 | Browser-renderer errors are unclassified plain Error objects | open | | |
| TD26072618 | Documentation-accuracy gaps: edit-poem exit code, BUILD.md phrasing/description | open | | |
| TD26072619 | serve-static.js dev server has no graceful shutdown | open | | |
| TD26072620 | No fast-subset/watch-mode test workflow documented | open | | |
