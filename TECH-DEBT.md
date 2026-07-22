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

## Current Items

The open and in-progress items, each as a `### <id> <title>` section. This
heading is permanent: when there are no current items it stays here (empty), so
it is always obvious where a new item's body belongs.

<!-- Add new items directly below, as `### <id> <title>` sections. -->

### TD26072103 Postscript "See more" toggle is not keyboard-operable

`src/templates/_poem-content.pug`'s postscript preview uses a `display: none`
checkbox + label, which cannot receive keyboard focus — a live WCAG 2.1.1
violation, the same defect class the 2026-07-11 review fixed for sort headers
in a different component. Fix: replace with a real `<button aria-expanded>`
toggle, mirroring the existing analysis/song-embed controls in the same
template.

### TD26072105 Root-level RELEASE_NOTES_*.md files duplicate CHANGELOG.md

Three per-release files duplicate `CHANGELOG.md` content in different prose,
contrary to CLAUDE.md's "CHANGELOG.md is the only place" policy and as-built
principle; drift has already appeared after two releases. Fix: remove the three
files (folding anything not already in CHANGELOG.md into it first), relying on
the GitHub Releases tab's auto-generated notes instead.

### TD26072106 serve-static.js and public/index.js's fixed XSS have no regression tests

`src/tools/serve-static.js` has zero test coverage, including the
`escapeHtml`/`encodeHref`/`generateDirectoryListing` helpers behind a fixed
high-severity stored-XSS CodeQL alert (commit `3eb8bd9`), verified only
manually in that PR. `public/index.js`'s DOM-XSS fix (`8e4d6ac`) is similarly
untested. Fix: add `test/serve-static.test.js` and a DOM-based test for
`renderPoems()`/`appendTitleHtml`, each asserting hostile input is safely
escaped.

### TD26072107 package.json's engines.node floor (>=18) is past EOL

Node 18 and Node 20 are both past end-of-life while CI already runs Node 22;
nothing warns a contributor who installs an EOL runtime. Fix: bump
`engines.node` to `>=22` and update README's prerequisite line; consider
`engine-strict=true` in `.npmrc`.

### TD26072108 Several public/poetic.css text colours fail WCAG AA contrast

`.poem-info` (gray, ≈3.95:1), `.poetic-footer`/`.no-content`/`.filter-empty`
(#999, ≈2.85:1), and `#007AFF` text (≈4.0:1) all fall short of the 4.5:1
normal-text threshold, affecting every generated page site-wide. Fix: darken to
at least `#767676`-equivalent or restrict `#007AFF` to large-text/UI contexts.

### TD26072109 yaml-to-poem.js silently drops data the current YAML shape can hold

`writeAudio()`/`writeVersions()` don't handle object-form audio params or
`segment.parts`, and `labels`/`directives` are never written at all — a poem's
whole Metadata section is silently lost on a YAML→`.poem` round trip, untested
at the level that would catch it. Fix: bring the writer functions in line with
`poem-parser.js`'s current output shape, or explicitly error on unsupported
shapes; add a round-trip test mirroring `test/browser-render.test.js`'s
approach.

### TD26072110 poem-parser.js is a 1854-line monolith covering the whole grammar

One `PoemParser` class with ~50 methods implements the entire `.poem` grammar
sharing mutable instance state — more than 3x the next-largest hand-written
tool file, making it the highest-effort file to safely extend. Fix: split by
grammar section (variable substitution, markup conversion, metadata parsing)
following the pattern `render-core.js`/`aggregate-render-core.js` already
establish; do as a sequence of small, independently-verified PRs.

### TD26072111 Escape-placeholder and js-beautify-options code duplicated across files

The `\x00ESCAPE<n>\x00` placeholder mechanism is implemented independently (but
cross-referenced by comment) in `poem-parser.js` and `render-core.js`; the same
`js-beautify` options object is copy-pasted three times across `build-poems.js`
and `build-all-poems.js`. Fix: extract a shared helper/constant for each.

### TD26072112 No code-coverage tool configured

Coverage is only ever estimated by manual inspection, which is how test gaps
like TD26072106 had to be found by hand. Fix: add `c8` (works directly with
Node's built-in test runner) and an `npm run coverage` script; no CI
coverage-floor gate needed yet.

### TD26072113 No CI check ties a version bump to a CHANGELOG entry; status checks aren't strict

Nothing verifies a `package.json` version bump comes with a matching
`CHANGELOG.md` entry (works so far by manual discipline only); `main`'s branch
ruleset also has `strict_required_status_checks_policy: false`. Fix: add a
version/changelog-diff check to the release workflow; consider enabling strict
status checks (a live GitHub setting, not a file change).

### TD26072114 Blogger sync has no request/job timeouts and no network-failure retry

`sync-blogger.yml` sets no job `timeout-minutes`; `sync-blogger.js`'s `fetch()`
calls have no request timeout and only retry on HTTP 429/5xx, not
network-level rejection; the sync loop also posts poems strictly sequentially.
Fix: add a job timeout, wrap fetch calls with `AbortSignal.timeout()` and
retry-on-rejection; bounded concurrency for large collections is optional/
lower priority.

### TD26072115 README and docs/POEM-TO-YAML.md are missing two cross-references

README never mentions the `poetic/browser` library export or
`docs/RENDERER-BROWSER.md` despite it being a real, tested public API;
`docs/POEM-TO-YAML.md` doesn't mention the incremental-rebuild/`--force`
behaviour that applies to the script it documents. Fix: add a short pointer to
each.

### TD26072116 Small config/dev-server hardening gaps (enum validation, CORS, credentials permissions)

An invalid `blogger.removed`/`blogger.content` config value is silently
coerced to its default with no warning (unlike the existing `blog_id`
precedent); `serve-static.js` sets a wildcard CORS header even when
loopback-bound; `sync-blogger.js` never re-checks the Blogger credentials
file's permission bits after creation. (A fourth item, a config-sourced
`RegExp` with no ReDoS guard in `song-handlers.js`, is explicitly optional —
self-authored config is not an external trust boundary here.) Fix: add
warnings/scoping for each; see review R-16 for the full list.

### TD26072117 No quotes ESLint rule; JSDoc discipline weakest in the most complex file

String-quote style drifts by file (each file is internally consistent, the
codebase as a whole isn't); `poem-parser.js` has only 5 `@param`/`@returns`
tags across ~50 methods versus 70 in the similarly-sized `sync-blogger.js`.
Fix: add a `quotes` rule and reformat; bring `poem-parser.js`'s JSDoc up to the
standard already used elsewhere (can be incremental).

### TD26072118 Small independent fixes: poem-page heading level, vim ftdetect placeholder, browser-renderer errors, sync-framework doc callout

Standalone poem pages have no `<h1>` (only `h2.poem-title`);
`editors/vim/ftdetect/poem.vim` still has an unfilled `(maintainer name)`
placeholder and a stale date; the browser-renderer library surfaces plain
unclassified `Error` objects (optional to fix); `scripts/sync-framework.sh`
overwrites a consumer's lockfile with no doc callout about custom
`package.json` edits being clobbered. Fix: four small, independent edits — see
review R-18 for specifics.

### TD26072201 docs/VIM-SYNTAX.md still references a non-existent vim/ root path

TD26072102 fixed the same defect class in docs/QUICKSTART-VIM.md, but
docs/VIM-SYNTAX.md's manual-install and plugin-manager sections still `cp`
from and refer to a bare `vim/` directory (e.g. `cp vim/syntax/poem.vim
~/.vim/syntax/`, "copying the `vim/` directory to your plugin directory"),
predating the `vim/` → `editors/vim/` move. Fix: update those references to
`editors/vim/`.

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
| TD26072103 | Postscript "See more" toggle is not keyboard-operable | open | | |
| TD26072104 | Governance docs don't state that review is currently self-review | resolved | 2026-07-22 | #80 |
| TD26072105 | Root-level RELEASE_NOTES_*.md files duplicate CHANGELOG.md | open | | |
| TD26072106 | serve-static.js and public/index.js's fixed XSS have no regression tests | open | | |
| TD26072107 | package.json's engines.node floor (>=18) is past EOL | open | | |
| TD26072108 | Several public/poetic.css text colours fail WCAG AA contrast | open | | |
| TD26072109 | yaml-to-poem.js silently drops data the current YAML shape can hold | open | | |
| TD26072110 | poem-parser.js is a 1854-line monolith covering the whole grammar | open | | |
| TD26072111 | Escape-placeholder and js-beautify-options code duplicated across files | open | | |
| TD26072112 | No code-coverage tool configured | open | | |
| TD26072113 | No CI check ties a version bump to a CHANGELOG entry; status checks aren't strict | open | | |
| TD26072114 | Blogger sync has no request/job timeouts and no network-failure retry | open | | |
| TD26072115 | README and docs/POEM-TO-YAML.md are missing two cross-references | open | | |
| TD26072116 | Small config/dev-server hardening gaps (enum validation, CORS, credentials permissions) | open | | |
| TD26072117 | No quotes ESLint rule; JSDoc discipline weakest in the most complex file | open | | |
| TD26072118 | Small independent fixes: poem-page heading level, vim ftdetect placeholder, browser-renderer errors, sync-framework doc callout | open | | |
| TD26072201 | docs/VIM-SYNTAX.md still references a non-existent vim/ root path | open | | |
