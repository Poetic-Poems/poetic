# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated. Live items live under the "Current Items"
heading as `### <id> <title>` sections. Once an issue has been resolved, remove
its `### <id> <title>` section from Current Items below — but never remove its
row from the Ledger table at the bottom of this file; see "Ledger" below.

`perl scripts/td-check.pl TECH-DEBT.md` (also `npm run check:td-register`) is
the consistency gate for those rules: every open or in-progress row must have
exactly one body, and no resolved or not-debt row may still have one. CI runs
it on every pull request, so a resolution that flips a row but leaves the body
behind fails its own build. `perl scripts/drop-sections.pl TECH-DEBT.md <id>...`
is the safe way to remove a body — it refuses to touch anything outside
Current Items — and it never edits the Ledger, so flipping the row stays your
job.

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
| [project-review-2026-07-31](reviews/project-review-2026-07-31/) | R-01 — Correct the stale tech-debt register entry and stop it recurring | TD26080101 |

## Current Items

The open and in-progress items, each as a `### <id> <title>` section. This
heading is permanent: when there are no current items it stays here (empty), so
it is always obvious where a new item's body belongs.

<!-- Add new items directly below, as `### <id> <title>` sections. -->

### TD26072801 path-guard.js's containment checks don't resolve symlinks

`safeJoin()` and `isWithinRoot()` compare strings only — neither calls
`fs.realpathSync`, so containment is purely lexical. A symlink committed
inside the root (say `public/theme.html -> /etc/passwd`) resolves to an
in-root path, passes `isWithinRoot()`, and is then read and published
verbatim — to GitHub Pages via `footer.js`'s `footer.source`, as the live
Blogger theme via `build-blogger.js`'s `blogger.template`, or over HTTP by
`serve-static.js`'s two guard sites. Flagged deliberately as out of scope
while fixing TD26072606 (#113), whose work order asked for `path-guard.js`'s
existing helpers rather than a new containment check. Lower severity than
TD26072606 was: it needs a committed file rather than just a config edit, and
someone who can commit a symlink can usually commit its target's contents
directly. Fix: resolve symlinks inside `path-guard.js` so all three call
sites are covered at once. That needs a decision on the
target-does-not-exist case, where `realpath` throws `ENOENT` —
`serve-static.js` must still answer 404, and both config resolvers must still
fall back to their defaults rather than crash.

### TD26072902 generateIndexHtml's self-heal path never adds the `<main>`/`<header>` landmarks

`generateIndexHtml()` (`src/tools/build-all-poems.js`) has two branches: no
`public/index.html` on disk means `renderFreshIndexHtml()` builds one from the
template, which since TD26072616 (#129) carries `<header class="header">` and
`<main>`; an existing `index.html` is instead patched in place (favicon,
subtitle, title, CSS/JS links, poem-data island) and keeps whatever body
structure it already had. So a consumer repo that tracks a hand-customised
`public/index.html` — rather than treating it as a build artefact, as this repo
does via `.gitignore` — never retroactively gains the landmarks, which is the
very defect TD26072616 set out to fix. Deliberately scoped out of #129:
rewriting arbitrary user HTML by regex is riskier than the narrow case
warrants. Mitigated, not hidden — `npm run a11y` checks whatever
`public/index.html` it finds, so such a page reports axe's `region` /
`landmark-one-main` violations non-blockingly in the consumer's own CI. Fix:
self-heal the landmarks too, structurally rather than by regex, or document
that a tracked `index.html` must be re-created from scratch to pick up template
changes.

### TD26080101 Tech-debt register has no way to detect drift against live GitHub state

`TD26072604` sat `open` for three days and five PRs (`#124` through `#136`)
after the branch ruleset it described was actually fixed out-of-band
(GitHub UI, 2026-07-28) — `td-check.pl` checks only *internal* register
consistency (every open/in-progress row has exactly one body, no
resolved/not-debt row has one) and has no way to notice that a resolved
real-world fact (a ruleset, a repo setting, anything outside this
repository's own tracked files) still reads `open` here. Found and the
`TD26072604` entry itself corrected by project-review-2026-07-31
(`reviews/project-review-2026-07-31/`, R-01/F-CI-01); this entry is the
residual: a stale root file, `RULESET-CHANGELOG-CHECK.md`, that narrated
the same fix as already applied and should be deleted (its substance
folded into `CHANGELOG.md`'s existing `v6.2.0` entry for the changelog-check
work), plus the absence of any drift-detection mechanism. Fix: delete
`RULESET-CHANGELOG-CHECK.md`; then decide and document how a future review
or maintainer would notice register-vs-live-GitHub drift again — a
periodic manual check (e.g. a step in the project-review skill's CI
dimension, which this review's own subagent already performed by hand via
`gh api .../rulesets/...`) is an acceptable answer and does not require new
automation.

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
| TD26072602 | Blogger sync posts poems strictly sequentially | not-debt | | #107 |
| TD26072603 | poem-parser.js still has metadata-parsing methods sharing mutable instance state | resolved | 2026-07-26 | #108 |
| TD26072604 | changelog-check required status check missing from branch ruleset | resolved | 2026-07-28 | ruleset 18226786 (out-of-band GitHub settings change; discovered by project-review-2026-07-31) |
| TD26072605 | sync-blogger.js's main() has zero test coverage and untested complexity | resolved | 2026-07-27 | #111 |
| TD26072606 | footer.source/blogger.template config paths bypass path-guard | resolved | 2026-07-27 | #113 |
| TD26072607 | serve-static.js's real request handler is untested | resolved | 2026-07-27 | #114 |
| TD26072608 | poem-to-yaml.js/poem-to-raw.js CLI orchestration (main()) is untested | resolved | 2026-07-28 | #115 |
| TD26072609 | sync-blogger's createPost retry can duplicate-post a poem | resolved | 2026-07-28 | #117 |
| TD26072610 | npm run coverage exists but isn't gated in CI | resolved | 2026-07-28 | #122 |
| TD26072611 | Analysis toggle uses inline onclick handlers instead of delegated listener | resolved | 2026-07-28 | #126 |
| TD26072612 | Most CI jobs have no timeout-minutes | resolved | 2026-07-28 | #119 |
| TD26072613 | Blogger client secret echoed to terminal during interactive entry | resolved | 2026-07-28 | #121 |
| TD26072614 | No automated licence-compatibility check for dependencies | resolved | 2026-07-29 | #127 |
| TD26072615 | build-all-poems.js parses each poem's YAML up to four times | resolved | 2026-07-29 | #128 |
| TD26072616 | No `<main>` landmark on generated pages; no automated accessibility checker | resolved | 2026-07-29 | #129 |
| TD26072617 | Browser-renderer errors are unclassified plain Error objects | resolved | 2026-07-29 | #130 |
| TD26072618 | Documentation-accuracy gaps: edit-poem exit code, BUILD.md phrasing/description | resolved | 2026-07-28 | #120 |
| TD26072619 | serve-static.js dev server has no graceful shutdown | resolved | 2026-07-30 | #132 |
| TD26072620 | No fast-subset/watch-mode test workflow documented | resolved | 2026-07-28 | #125 |
| TD26072801 | path-guard.js's containment checks don't resolve symlinks | open | | |
| TD26072901 | poem-to-raw/poem-to-yaml regeneration tests flake on output-mtime granularity | resolved | 2026-07-31 | #133 |
| TD26072902 | generateIndexHtml's self-heal path never adds the `<main>`/`<header>` landmarks | open | | |
| TD26080101 | Tech-debt register has no way to detect drift against live GitHub state | open | | |
