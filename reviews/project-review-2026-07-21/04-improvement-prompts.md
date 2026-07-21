# Improvement prompts

One prompt per recommendation, in priority order (severity first, then effort). Each prompt is
self-contained and may be pasted into a fresh AI agent session with no other context. Ordering
dependencies, where they exist, are noted in both the preamble here and the prompt's own
**Run after** line. There are no hard dependencies between these 18 prompts — they touch
different files and can be executed in any order or in parallel — except that R-11 and R-17
both touch formatting/lint config and are best done as separate PRs in either order, not
simultaneously, to avoid merge conflicts on `eslint.config.js`.

## Prompt for R-01 — Fix `docs/BUILD.md`'s three self-contradictions

**Bundles:** F-DOC-01, F-DOC-02, F-DOC-04 — all three are inaccuracies within the same single
file, found together, and naturally fixed in one pass over that file. · **Run after:** no
prerequisites

```text
Project: "poetic", a Node.js framework (github.com/Poetic-Poems/poetic) for authoring poems in
a plain-text .poem format and building them to HTML for GitHub Pages / Blogger. CommonJS,
Node >=18. The file to fix is docs/BUILD.md.

The problem: docs/BUILD.md has three internal inaccuracies, found by a project review dated
2026-07-21 (see reviews/project-review-2026-07-21/02-findings.md, findings F-DOC-01, F-DOC-02,
F-DOC-04, for full evidence):

1. Lines 37-46 ("Main Build Script") describe src/tools/build-all-poems.js as scanning the
   public/ directory for HTML files and extracting metadata from them. This is a superseded
   (v0.1) implementation. The actual code's own header comment (build-all-poems.js lines 1-9)
   says: "Changes vs. v0.1: Renders poem fragments in-memory via poem-render (no longer reads
   <slug>.html files)." The real source of truth is src/poems/yaml/ (confirmed at
   build-all-poems.js line 353), rendered in-memory.
2. Lines 62, 91, and the file-structure diagram at line 110 name the Blogger template file
   "fragments-and-unity.template.html". The actual default, used by the code
   (src/tools/build-blogger.js lines 31-46: `path.join(publicDir, "blogger-template.html")`) and
   by this same doc's own config-key table (line 481) and by docs/BLOGGER.md throughout, is
   "blogger-template.html".
3. The file-structure diagram at line 122 lists "_shared.poem" (underscore prefix). The real
   file, and every other reference to it in this same document (lines 70, 74) and elsewhere
   (README.md:219, docs/YAML-SCHEMA.md, docs/SCRIPTS.md, docs/POEM-SYNTAX.md, the code itself),
   is ".shared.poem" (dot prefix).

The goal: rewrite the "Main Build Script" section to accurately describe the current in-memory,
YAML-sourced rendering pipeline (read build-all-poems.js yourself to get this right — don't
just take this prompt's summary as authoritative prose to copy in). Replace all three
"fragments-and-unity.template.html" references with "blogger-template.html". Fix the diagram
entry to ".shared.poem". No other content in the file should change unless you find it's also
inaccurate while you're in there (if so, note what you found and why in your PR description).

Constraints: this repository's documentation principle (CLAUDE.md, "Documentation principles")
is that all docs are as-built only — no "previously"/"used to"/"now uses" phrasing. Describe the
current pipeline directly; don't narrate the change from the old to the new description. Do not
touch any other file.

Verification: after editing, run `npm run check` (trailing-whitespace gate) and manually
cross-read your rewritten section against build-all-poems.js and build-blogger.js line by line
to confirm every claim is accurate. There is no automated doc-accuracy check, so careful manual
cross-reading is the verification here.

Work cost-consciously. This whole task is well-specified, mechanical documentation correction —
it suits a low-cost model tier directly; no subagent delegation is needed for a change this
small and localized.

Deliverable: a PR against this repo (this repo's CLAUDE.md describes the branch/PR workflow —
follow it: fresh clone, feature branch, PR titled in Conventional Commits format, e.g.
`docs(build): fix superseded description and filename typos in BUILD.md`). Mark
TD26072101 (see TECH-DEBT.md) resolved in the same PR if this fully addresses it — check that
file's current entry for the exact ID and wording before closing it out, since the ID was
allocated at review time and may have shifted if other tech-debt items landed first.
```

## Prompt for R-02 — Fix `docs/QUICKSTART-VIM.md`'s broken paths

**Bundles:** R-02 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework for authoring poems in a plain-text .poem format. The
file to fix is docs/QUICKSTART-VIM.md.

The problem: this quickstart's very first documented command doesn't work. It references a
"./vim/install.sh" path and a "src/poems/_example.poem" file (lines 9, 12, 20, and again at
93, 98-105 in a file-structure diagram and doc-pointer). Neither path exists in this repo. The
actual paths are editors/vim/install.sh and src/poems/poem/_example.poem — confirmed present on
disk, and used correctly by every sibling document (README.md:42, docs/VIM-SYNTAX.md:228, and
this repo's root CLAUDE.md directory map). This file alone appears to predate a vim/ ->
editors/vim/ directory move that every other doc already reflects.

The goal: every path reference in docs/QUICKSTART-VIM.md matches the actual repository layout.
Specifically: replace all "vim/" root references with "editors/vim/", and fix the example-poem
path to "src/poems/poem/_example.poem".

Constraints: do not change anything else in the file — this is a path-correction task only, not
a rewrite. Do not touch any other file.

Verification: literally run the quickstart's own documented commands from this repository's
root after your fix (e.g. `bash editors/vim/install.sh`, then open
`src/poems/poem/_example.poem` in vim) and confirm no "no such file or directory" error occurs.
Also run `npm run check` for the trailing-whitespace gate.

Work cost-consciously. This is a small, mechanical, well-specified fix — a low-cost model tier
is sufficient for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits PR title, e.g.
`docs(vim): fix quickstart paths to editors/vim/`). Mark TD26072102 resolved in the same PR if
this fully addresses it (check TECH-DEBT.md for the current entry and exact wording first).
```

## Prompt for R-03 — Make the postscript "See more" toggle keyboard-operable

**Bundles:** R-03 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework that renders poems to HTML via a Pug template
(src/templates/). The relevant file is src/templates/_poem-content.pug, plus its accompanying
CSS in public/poetic.css and any client-side JS it depends on.

The problem: a project review dated 2026-07-21 found (finding F-UX-01,
reviews/project-review-2026-07-21/02-findings.md) that the postscript preview's "See more"
toggle is implemented as a `display: none` checkbox (src/templates/_poem-content.pug lines
155-158) paired with a `<label for=...>`. `public/poetic.css` lines 11-13 define
`.hidden { display: none !important; }`. A form control with `display: none` cannot receive
keyboard focus in any browser, and the label itself is never in the tab order either, so
keyboard-only users and many screen-reader users cannot expand or collapse a postscript preview
at all on any poem page that has one — a WCAG 2.1.1 (Keyboard) violation. This is the same class
of defect the prior review (2026-07-11) fixed for the all-poems sort headers (commit f3b98c5),
recurring here in a component that fix didn't cover.

The goal: the postscript toggle is reachable via Tab and activatable via Enter/Space, and
communicates its expanded/collapsed state to assistive technology (e.g. via `aria-expanded`).
Same-template precedent already exists: the analysis and song-embed show/hide controls in the
same file (src/templates/_poem-content.pug, roughly lines 120-137 and 166-190) already use a
real button-based toggle pattern — read those and follow the same approach for consistency
rather than inventing a new pattern.

Constraints: preserve the existing visual appearance and CSS classes as much as possible — this
is an accessibility fix, not a redesign. Do not change the postscript preview's actual
show/hide *behaviour* (what content appears/disappears), only how it's triggered and exposed to
assistive tech. Keep working without JavaScript where the current analysis/song-embed pattern
already requires JS (i.e., it's acceptable if this feature already assumes JS is enabled,
consistent with its siblings).

Verification: run `npm run build` and inspect the generated HTML for a poem with a postscript
to confirm a real, focusable control (not a `display:none` input) drives the toggle, with
`aria-expanded` present and updating on click. Add or extend a test (check test/ for existing
Pug-template rendering tests, e.g. how the sort-header fix was tested, and follow the same
pattern) asserting the rendered markup contains a focusable, `aria-expanded`-bearing element
for the postscript toggle rather than a hidden checkbox. Run `npm test` and `npm run lint`.

Work cost-consciously. This is accessibility-relevant UI work — have a mid-to-high-capability
tier implement the actual markup/script change and review it, since a subtly wrong ARIA pattern
would defeat the fix's purpose; test-writing can be delegated to a lower-cost tier once the
pattern to follow is clear.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix(a11y): make postscript toggle keyboard-operable`). Mark TD26072103 resolved in the same
PR if this fully addresses it (check TECH-DEBT.md for the current entry first).
```

## Prompt for R-04 — Document governance reality: solo self-review and bus factor

**Bundles:** F-GOV-01, F-GOV-02 — both are about the same underlying reality (a solo maintainer
with no independent reviewer) and are naturally fixed by the same documentation change. · **Run
after:** no prerequisites

```text
Project: "poetic", a Node.js framework repository (github.com/Poetic-Poems/poetic). Files to
edit: CLAUDE.md (repo root) and/or SECURITY.md.

The problem: a project review dated 2026-07-21 (findings F-GOV-01, F-GOV-02 in
reviews/project-review-2026-07-21/02-findings.md) found that CLAUDE.md's documented branch
protection requires code-owner review on every PR to main, and CODEOWNERS lists two GitHub
handles (@warwickallen, @Warwick-Allen) — but both belong to the same person (one email
throughout git history, one account's display name is empty, consistent with an alt account).
Every sampled PR is authored by one handle and approved by the other, typically within minutes.
That person is also 100% of human-authored commit history and the sole repository admin, with
no documented succession plan. The elaborate multi-agent claim-branch/dedicated-clone workflow
CLAUDE.md describes solves concurrency between AI agents, but does not provide independent human
review or bus-factor redundancy — it is easy to read the documented process as implying more
independent oversight than actually exists.

The goal: CLAUDE.md and/or SECURITY.md state plainly, in a sentence or two, that this is
presently a solo-maintainer project where the code-owner review requirement is satisfied by the
maintainer's own second account (i.e., self-review by design), so a reader — human or AI agent —
doesn't infer independent peer review where none currently exists. Optionally, add a short
statement of the succession/backup situation (even "there is currently no succession plan" is
an acceptable, honest answer — don't invent a plan that doesn't exist).

Constraints: this is a documentation-honesty fix, not a request to change the actual review
process, add a second human reviewer, or alter branch protection settings — those are larger,
separate decisions for the repository owner to make if and when they choose to. Do not remove or
weaken the existing branch-protection description; add clarity about what the gate currently
achieves, without editorializing about whether that's good or bad.

Verification: re-read your added text once from the perspective of a new AI agent onboarding to
this repo for the first time — would it now correctly understand that PR approval here is
self-approval, not independent review? Run `npm run check` for the trailing-whitespace gate
(these are Markdown files, tracked by that check).

Work cost-consciously. This is a short, judgment-light documentation addition — a low-cost model
tier is sufficient, but have the exact wording reviewed once by a mid-capability tier since it
touches how a governance fact is characterized (avoid unintentionally overstating or understating
the situation).

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`docs: clarify solo-maintainer review reality`). Mark TD26072104 resolved in the same PR if this
fully addresses it (check TECH-DEBT.md for the current entry and wording first).
```

## Prompt for R-05 — Retire duplicate `RELEASE_NOTES_*.md` files

**Bundles:** F-CI-01, F-GOV-03, F-DOC-05 — three independent findings (from the CI, governance,
and documentation review angles) that all point at the same root cause: three duplicate files.
· **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework repository. Files: RELEASE_NOTES_v6.0.1.md,
RELEASE_NOTES_v6.1.0.md, RELEASE_NOTES_v6.1.1.md (all at repo root), and CHANGELOG.md.

The problem: a project review dated 2026-07-21 found (findings F-CI-01, F-GOV-03, F-DOC-05 in
reviews/project-review-2026-07-21/02-findings.md) that these three files duplicate
CHANGELOG.md's content in different prose, were only created for 3 of the project's many
releases (not v6.0.0 or earlier ones), and contradict this repo's own CLAUDE.md documentation
policy: "CHANGELOG.md is the only place for recording what changed and when" plus an "as-built
only" principle (no historical/"previously" narrative in docs). RELEASE_NOTES_v6.1.1.md already
contains exactly the kind of drift-prone historical narrative that policy is meant to prevent
(it explains how v6.1.0's shipped behaviour was superseded). Nothing else in the repo references
these three files.

The goal: the three RELEASE_NOTES_*.md files no longer exist, and no future release creates a
new one (unless CLAUDE.md is explicitly updated to declare the practice intentional — that is
this task's fallback only if you find a reason the maintainer would want to keep them; default
to removal).

Constraints: before deleting, confirm nothing else in the repo (docs, workflows, README) links
to or requires these files — grep the whole repository for "RELEASE_NOTES" first. Check whether
any content in them isn't already captured in CHANGELOG.md's corresponding version sections; if
you find something materially missing from CHANGELOG.md that the release-notes file records
(e.g. a caveat or correction), fold that content into the matching CHANGELOG.md section before
deleting the release-notes file, rather than losing it. Do not modify .github/workflows/release.yml
unless you find it references these files (per the review, it doesn't — it uses
`gh release create --generate-notes`, which is independent of these files).

Verification: after deleting, run `grep -rn "RELEASE_NOTES" .` from the repo root to confirm no
remaining references exist. Run `npm run check`. Confirm CHANGELOG.md's [6.0.1], [6.1.0], and
[6.1.1] sections are complete and don't need anything folded in from the deleted files.

Work cost-consciously. This is simple, well-specified cleanup work (verify no references, delete
three files, maybe fold in a sentence) — suits a low-cost model tier for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`docs: remove duplicate RELEASE_NOTES files in favour of CHANGELOG.md`). Mark TD26072105
resolved in the same PR if this fully addresses it (check TECH-DEBT.md for the current entry
and exact wording first, since it cross-references all three source findings).
```

## Prompt for R-06 — Add regression tests for the fixed XSS surfaces

**Bundles:** F-TEST-01, F-TEST-02 — both are "a previously-fixed XSS alert has no regression
test," found in the same review pass, naturally fixed together since both involve adding tests
for security-fix commits that predate this task. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: src/tools/serve-static.js (a local dev server)
and public/index.js (client-side JS for the generated index page), plus new test files under
test/.

The problem: a project review dated 2026-07-21 (findings F-TEST-01, F-TEST-02 in
reviews/project-review-2026-07-21/02-findings.md) found two previously-fixed, high-severity
CodeQL-flagged XSS vulnerabilities with no automated regression test:

1. src/tools/serve-static.js has zero test coverage of any kind (confirmed: no test/*.js file
   requires it). Its generateDirectoryListing() function and escapeHtml()/encodeHref() helpers
   (around line 108+ and 124) were the subject of a stored-XSS fix in commit 3eb8bd9
   ("fix(serve-static): resolve stored XSS in directory listing"), verified only manually in
   that PR's description, never via an automated test.
2. public/index.js's renderPoems() (and its appendTitleHtml helper) had a DOM-XSS fix in commit
   8e4d6ac ("fix(public/index.js): resolve DOM XSS in poem card rendering"). The current
   implementation is safe (uses createElement/textContent, not innerHTML, for untrusted title
   content — confirmed by reading the file), but no test exercises it with a hostile title to
   lock that in.

The goal: test/serve-static.test.js exists, importing and directly unit-testing
escapeHtml/encodeHref/generateDirectoryListing (no need to spin up a real HTTP server — call the
exported functions directly) with filenames containing `<script>`, `"`, `&`, and `'`, asserting
the output is safely escaped. A test (new or added to an existing public/index.js-related test
file — check test/ for one first) exercises renderPoems()/appendTitleHtml with a poem title
containing `<script>` or similar and asserts the resulting DOM/HTML contains no unescaped tag,
i.e. the hostile string appears only as inert text.

Constraints: do not change serve-static.js's or public/index.js's actual behaviour — this task
is adding missing test coverage for already-fixed code, not fixing new bugs. If your new tests
reveal an actual regression (the fix doesn't hold), stop and report that clearly rather than
"fixing" it as an afterthought — that would be a more significant, separate finding.

Verification: run `npm test` and confirm the new tests pass against the current code. As a sanity
check that the tests actually test something, temporarily revert the relevant fix commit's
diff locally (e.g. `git show 3eb8bd9` to see what changed, then manually reintroduce the
unescaped version) and confirm your new test fails against that reverted version, then restore
the fix. Do not commit the reverted state.

Work cost-consciously. This is well-specified test-writing against a known, described
vulnerability class — suits a low-cost-to-mid-cost model tier; no need for a high-capability
tier since the fix itself isn't changing, only test coverage is being added.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`test(security): add regression tests for serve-static and index.js XSS fixes`). Mark
TD26072106 resolved in the same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-07 — Bump the Node `engines` floor past EOL

**Bundles:** R-07 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: package.json, README.md.

The problem: a project review dated 2026-07-21 (finding F-DEPS-02 in
reviews/project-review-2026-07-21/02-findings.md) found that package.json's `engines.node` is
">=18", and README.md's prerequisite says "Node.js 18 or later" — but Node 18 reached end-of-life
2025-04-30 and Node 20 reached end-of-life 2026-04-30 (per nodejs.org/en/about/eol), while this
project's own CI already runs on Node 22 (.github/workflows/build-poems.yml and
sync-blogger.yml both pin node-version: "22"). Nothing warns a contributor who installs an EOL
Node version.

The goal: package.json's engines.node reads ">=22" (matching CI), and README.md's prerequisite
line is updated to match. Optionally, add a .npmrc with `engine-strict=true` so npm actually
warns/errors on an unsupported Node version rather than silently proceeding (verify current npm
behaviour first — engine-strict's exact effect varies by npm version).

Constraints: do not change any other package.json field. If you add engine-strict, verify it
doesn't break `npm ci` in this project's own CI (check the Node version pinned in
.github/workflows/*.yml — it should already be >=22 everywhere, so this should be a no-op there).

Verification: run `npm ci` and `npm test` locally after the change to confirm nothing in the
toolchain silently depended on the old floor. Run `npm run check`.

Work cost-consciously. This is a small, mechanical, well-specified two-file edit — a low-cost
model tier is sufficient for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`build(deps): bump Node engines floor to >=22, matching CI`). Mark TD26072107 resolved in the
same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-08 — Fix WCAG AA contrast failures

**Bundles:** R-08 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework that generates static HTML poem pages. File:
public/poetic.css.

The problem: a project review dated 2026-07-21 (finding F-UX-02 in
reviews/project-review-2026-07-21/02-findings.md) found several text colours in
public/poetic.css fail WCAG AA contrast against their (white) background:
- `.poem-info { color: gray; ... }` (lines 69-72, also reused ~514, 533) — #808080 ≈ 3.95:1,
  below the 4.5:1 normal-text threshold (the 90% font-size rules out the large-text exemption).
- `.poetic-footer { color: #999; }` (lines 733-739) — #999999 ≈ 2.85:1, fails even the 3:1
  large-text threshold.
- `.no-content` (lines 27-29) and `.filter-empty` (lines 361-363) also use #999.
- `#007AFF` used as link/text colour in several places (lines 197, 209, 344, 450, 469) ≈ 4.0:1,
  marginally under the 4.5:1 normal-text threshold.
This affects every generated poem page site-wide (the byline and footer appear on all of them),
not an edge case.

The goal: `.poem-info`, `.poetic-footer`, `.no-content`, `.filter-empty` all reach at least
4.5:1 contrast against white; `#007AFF` reaches 4.5:1 wherever used as normal-size body text (a
darker shade is acceptable), or its use is restricted to contexts where the 3:1 large-text/UI
threshold genuinely applies (verify this per use-site — don't assume).

Constraints: preserve the overall visual design intent (these are subdued/secondary-text roles
by design) — darken the specific colours only as much as needed to clear 4.5:1, don't redesign
the colour scheme. A commonly-cited AA-safe grey on white is #767676 or darker; use a contrast
checker to verify your chosen values against the actual white background used, not just this
one reference value.

Verification: compute the actual contrast ratio for each changed colour against its real
background (some elements may not be on pure white — check computed backgrounds, not just
assumed ones) and confirm each meets 4.5:1 (or 3:1 if genuinely large text/UI component, stated
explicitly if you rely on that exemption). Run `npm run build && npm start` and visually inspect
a poem page and the all-poems page to confirm the change reads correctly. Run `npm run check`.

Work cost-consciously. This is small, well-specified CSS work with an objective pass/fail
criterion (a computable contrast ratio) — a low-cost model tier is sufficient.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix(a11y): raise poetic.css text colours to WCAG AA contrast`). Mark TD26072108 resolved in the
same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-09 — Bring `yaml-to-poem.js` back in sync with the current YAML shape

**Bundles:** R-09 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework converting plain-text .poem files to a YAML
intermediate representation (src/tools/poem-to-yaml.js, driven by src/tools/poem-parser.js) and
back (src/tools/yaml-to-poem.js). Read poem-parser.js and yaml-to-poem.js in full before
starting — this task requires understanding both sides of the seam, not just the description
below.

The problem: a project review dated 2026-07-21 (finding F-ARCH-01 in
reviews/project-review-2026-07-21/02-findings.md) found yaml-to-poem.js has not kept pace with
poem-parser.js's current YAML output shape, and silently drops data rather than erroring:

1. writeAudio() (yaml-to-poem.js lines 195-215) only handles `audio[service] === true` or a
   plain string; it silently drops the object form `{ value, media?, ratio?, height? }` that
   parseAudio()/parseAudioParams() (poem-parser.js lines 1149-1307) produce whenever an audio
   line has a trailing param list (e.g. "Mega: id#key (video, ratio=21:9)").
2. writeVersions() (yaml-to-poem.js lines 136-190) only emits `segment.lines`; it has no
   handling for `segment.parts` (poem-parser.js lines 1009-1067), the shape used when a segment
   mixes WYSIWYG poem lines with an embedded `<<< ... >>>` block — such content is silently
   dropped.
3. Neither `version.params`/`segment.params` (from parseLabelWithParams()) nor the top-level
   `labels`/`directives` keys (from parseMetadata()/extractPreambleDirectives()) are written
   anywhere — grep yaml-to-poem.js for "labels" or "directives" yourself to confirm this before
   starting. A poem's entire Metadata section is silently lost on a YAML->.poem round trip.

The goal: yaml-to-poem.js either correctly round-trips every shape poem-to-yaml.js currently
produces (preferred), or explicitly errors/warns (never silently drops) on any shape it
genuinely cannot serialise. A new round-trip test exists — feed a poem with params, mixed
`parts`, object-form audio, and labels/directives through poem-to-yaml.js -> yaml-to-poem.js ->
poem-to-yaml.js again, and assert the two YAML documents match (mirroring
test/browser-render.test.js's approach to the browser/Node render-path seam, which is the
existing precedent for this kind of round-trip test in this codebase — read that test file for
the pattern to follow).

Constraints: do not change poem-parser.js's or poem-to-yaml.js's output shape — this task brings
yaml-to-poem.js into alignment with the existing, authoritative shape, not the other way around.
Do not change the .poem file format itself (poem-syntax.ebnf / docs/POEM-SYNTAX.md are out of
scope). If a shape genuinely cannot be losslessly round-tripped to .poem source text, an
explicit thrown error (with a clear message naming the unsupported feature) is an acceptable
substitute for full support — silent data loss is the one unacceptable outcome.

Verification: run the new round-trip test against every poem in src/poems/ (the existing test
corpus) plus new fixtures covering each of the three gaps above. Run the full `npm test` suite
and `npm run lint`.

Work cost-consciously. Understanding both sides of this seam correctly requires real engineering
judgment (this is exactly the kind of "read both sides, don't infer one from the other" work the
review's methodology calls out) — have a mid-to-high-capability tier do the core
poem-parser.js/yaml-to-poem.js shape analysis and the writer-function changes; test-fixture
authoring for already-understood shapes can be delegated to a lower-cost tier once the shapes
are pinned down.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix(yaml-to-poem): round-trip params, parts, audio objects, and labels/directives`). Mark
TD26072109 resolved in the same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-10 — Split `poem-parser.js` into focused modules

**Bundles:** R-10 only — deliberately not bundled with R-09 despite touching the same file,
because R-09 fixes a correctness gap and should land (and be verifiable) independently of a
larger structural refactor; doing both in one change would make it hard to tell which part
caused a test failure. · **Run after:** R-09 is not a hard prerequisite, but doing R-09 first is
recommended so this refactor doesn't have to be redone around it.

```text
Project: "poetic", a Node.js framework. File: src/tools/poem-parser.js (1854 lines).

The problem: a project review dated 2026-07-21 (finding F-CODE-01 in
reviews/project-review-2026-07-21/02-findings.md) found src/tools/poem-parser.js is a single
1854-line file containing one PoemParser class with roughly 50 methods implementing the entire
.poem grammar (comment stripping, line-continuation folding, variable substitution,
header/version/segment parsing, audio-line parsing, postscript/analysis parsing, metadata
parsing, and inline-markup-to-HTML conversion), all sharing mutable instance state
(this.lines/this.index/this.result/this.variables). It is more than 3x the size of the next-
largest hand-written tool file, making it the highest-effort file in the codebase to onboard
onto or safely extend.

The goal: the parsing responsibilities are split across a small number of focused modules (for
example: a variable-substitution module, a markup-conversion module, a metadata/label-parsing
module), following the pattern src/tools/render-core.js and src/tools/aggregate-render-core.js
already establish for extracting shared pure logic into its own file — without changing
PoemParser's external behaviour, its public API, or the shape of the YAML it produces.

Constraints: this must be a pure internal refactor with zero behaviour change. Do not touch
grammar semantics, error messages, or output shape in the same change as the structural split —
if you notice a genuine bug while refactoring, note it separately (e.g. file a TECH-DEBT.md
entry) rather than fixing it inline, so the refactor's own correctness is easy to verify in
isolation. Given the size of this file, do not attempt the whole split in one PR — this repo's
CLAUDE.md explicitly prefers "a series of small pull requests, each a safe, self-contained,
independently reviewable and mergeable unit" over one large branch; plan and execute this as a
sequence of small extractions (e.g. "extract variable substitution" as PR 1, "extract markup
conversion" as PR 2, etc.), each verified fully green before starting the next.

Verification: after each extraction step, run the full `npm test` suite (493 tests, all must
still pass, particularly the poem-parser and golden/snapshot tests) and `npm run lint`. The
golden tests (test/golden.test.js) pin exact output byte-for-byte — any unintended behaviour
change from the refactor will surface there.

Work cost-consciously. This is a large, judgment-heavy structural refactor of the codebase's
most complex file — have a high-capability tier plan the module boundaries and do the actual
extraction; do not delegate the core refactoring logic to a low-cost tier, since a subtly wrong
extraction (e.g. missing a shared-state dependency between two "independent" methods) could
silently change behaviour in a way the existing tests might not catch. Mechanical steps within
each extraction (updating require/import statements, moving already-decided code) can go to a
lower-cost tier once the boundary is decided.

Deliverable: a sequence of small PRs (fresh clone per this repo's convention, each a
feature branch, each with a Conventional Commits title, e.g. `refactor(poem-parser): extract
variable substitution into its own module`). Mark TD26072110 resolved only once the full split
is complete across however many PRs it takes (check TECH-DEBT.md first for the current entry;
it's fine for this one item to stay in-progress across several PRs before being marked resolved).
```

## Prompt for R-11 — Extract duplicated escape-placeholder and beautify-options code

**Bundles:** F-CODE-03, F-CODE-04 — both are small, independent "extract a duplicated constant/
helper into one shared place" mechanical refactors, suited to one focused PR. · **Run after:**
not R-17 simultaneously (both touch shared config/constants areas; do them as separate PRs to
avoid merge conflicts, either order is fine)

```text
Project: "poetic", a Node.js framework. Files: src/tools/poem-parser.js, src/tools/render-core.js,
src/tools/build-poems.js, src/tools/build-all-poems.js.

The problem: a project review dated 2026-07-21 (findings F-CODE-03, F-CODE-04 in
reviews/project-review-2026-07-21/02-findings.md) found two small pieces of duplicated logic:

1. The identical escape-placeholder technique (`` const placeholder = `\x00ESCAPE${escapeIndex++}\x00`; ``
   then a restore pass matching `/\x00ESCAPE\d+\x00/g`) is implemented independently in
   poem-parser.js's convertMarkup() (lines 1786-1792, 1842-1843) and render-core.js's
   renderTitleMarkup() (lines 113-119, 131-132). Comments in both cross-reference each other
   ("same order... so nesting degrades identically as body text"), showing the authors know
   these must stay in lockstep — but the implementation itself is copy-pasted.
2. The identical js-beautify options object
   (`{ indent_size: 2, wrap_line_length: 80, preserve_newlines: false, max_preserve_newlines: 1,
   wrap_attributes: "auto" }`) is copy-pasted three times: build-poems.js lines 176-181, and
   build-all-poems.js lines 389-394 and 409-414.

The goal: one shared helper function implements the placeholder-protect/restore mechanism,
called from both poem-parser.js's convertMarkup() and render-core.js's renderTitleMarkup(); one
shared BEAUTIFY_OPTIONS constant is referenced from all three current call sites, with no
remaining duplication.

Constraints: this must be a pure refactor with zero output change — the golden/snapshot tests
(test/golden.test.js) pin exact byte-for-byte output and are your primary safety net. Put the
shared escape helper somewhere both poem-parser.js and render-core.js can import it without
introducing a dependency cycle (check the current require graph first — render-core.js is part
of the filesystem-free "core" shared with the browser bundle, per docs/RENDERER-BROWSER.md, so
whatever module you add it to must also stay filesystem-free if it's reachable from
src/browser/). Put the shared BEAUTIFY_OPTIONS constant in an existing shared module (e.g.
src/tools/repo-root.js, or a new small one if that doesn't fit) — this one doesn't need to be
filesystem-free since build-poems.js/build-all-poems.js are both Node-only build scripts.

Verification: run the full `npm test` suite, paying particular attention to golden/snapshot
tests and any test asserting rendered HTML output byte-for-byte — none should change. Run
`npm run lint`.

Work cost-consciously. This is small, mechanical, well-specified duplication removal — a
low-cost-to-mid-cost model tier is sufficient for the whole task; the only judgment call is
where to place the shared helper to respect the filesystem-free constraint, which this prompt
already flags.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`refactor: extract duplicated escape-placeholder helper and beautify options`). Mark TD26072111
resolved in the same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-12 — Add a code-coverage tool

**Bundles:** R-12 only. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: package.json (add a dev dependency and script).

The problem: a project review dated 2026-07-21 (finding F-TEST-03 in
reviews/project-review-2026-07-21/02-findings.md) found no code-coverage tool is configured, so
coverage is only ever estimated by manual inspection — which is how test-coverage gaps (see
TD26072106 / F-TEST-01, F-TEST-02) had to be found by hand in that review rather than surfaced
automatically.

The goal: `npm run coverage` (or similarly named script) produces a code-coverage report using
this project's existing test setup (`node --test`, Node's built-in test runner — no test
framework migration is wanted or needed).

Constraints: use `c8`, which wraps Node's built-in test runner directly with no config changes
to the tests themselves. Do not add a CI coverage-floor gate (e.g. "fail if coverage < X%") as
part of this task — the goal here is visibility, not enforcement; a floor can be a separate,
later decision once there's a baseline to set it against.

Verification: run the new coverage script and confirm it produces a sensible report (terminal
summary and/or an HTML report under a gitignored output directory — check whether c8's default
output directory needs adding to .gitignore, and add it if so). Run `npm test` normally
afterward to confirm the existing test script is unaffected.

Work cost-consciously. This is a small, mechanical, well-specified tooling addition — a
low-cost model tier is sufficient for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`build(test): add c8 code-coverage reporting`). Mark TD26072112 resolved in the same PR if this
fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-13 — CI hardening: changelog-bump check and strict status checks

**Bundles:** F-CI-02, F-CI-03 — both are small CI/branch-protection hardening items found in the
same review pass, small enough to do together. · **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: .github/workflows/release.yml (or a new small
workflow), and the repository's branch-protection ruleset for `main` (via GitHub's API/UI, not a
file in the repo).

The problem: a project review dated 2026-07-21 (findings F-CI-02, F-CI-03 in
reviews/project-review-2026-07-21/02-findings.md) found: (1) nothing in CI verifies that a
package.json version bump comes with a matching CHANGELOG.md entry — it has worked so far only
by manual discipline; (2) main's branch-protection ruleset has
`strict_required_status_checks_policy: false`, meaning a PR branch does not need to be up to
date with main before its status checks are considered satisfied for merge.

The goal, part 1 (do this part — it's the higher-value, lower-risk half): a CI check fails a
release PR if package.json's version field changed in that PR's diff but CHANGELOG.md's diff is
empty. The goal, part 2 (optional, lower priority, higher blast radius — only do this if you can
verify it won't disrupt this repo's normal PR flow): main's branch ruleset has
`strict_required_status_checks_policy` set to true.

Constraints: for part 1, add the check as a step in release.yml or a small new workflow — a
simple `git diff` comparison of the two files' changed status is sufficient; don't over-engineer
this into a full changelog-linting tool. For part 2, this changes a live GitHub repository
setting, not a file in the repo — if you don't have API/admin access to make this change
yourself, stop and report that clearly rather than attempting a workaround; do not skip part 1
just because part 2 isn't reachable.

Verification: for part 1, test the new check against a synthetic PR-like diff locally (e.g.
construct a git diff with a version bump but no CHANGELOG change and confirm your check's logic
would flag it) before relying on a live PR to prove it. For part 2, after changing the setting,
re-query it via `gh api repos/Poetic-Poems/poetic/rules/branches/main` and confirm the setting
took effect.

Work cost-consciously. Both parts are small and well-specified — a low-cost model tier is
sufficient, though part 2 (a live repository-setting change) should be double-checked by
whoever has the authority to make it, since it's a shared-state change beyond a single PR's diff.

Deliverable: a PR for part 1 (fresh clone, feature branch, Conventional Commits title, e.g.
`ci(release): fail if version bumps without a CHANGELOG entry`). Part 2, if done, is a
repository-setting change with no PR — note in your final report whether you made it, and if
not, why. Mark TD26072113 resolved once whichever part(s) you completed are done (check
TECH-DEBT.md first; note in the resolution which of the two parts were completed).
```

## Prompt for R-14 — Harden Blogger sync's operational resilience

**Bundles:** F-OPS-01, F-OPS-02, F-PERF-01 — all three are resilience/scaling gaps in the same
Blogger-sync code path and workflow, naturally addressed together. · **Run after:** no
prerequisites

```text
Project: "poetic", a Node.js framework with an optional Blogger-publishing sync tool. Files:
.github/workflows/sync-blogger.yml, src/tools/sync-blogger.js.

The problem: a project review dated 2026-07-21 (findings F-OPS-01, F-OPS-02, F-PERF-01 in
reviews/project-review-2026-07-21/02-findings.md) found three related resilience gaps: (1)
sync-blogger.yml sets no `timeout-minutes` on its job, so a hung run would run until GitHub's
360-minute default cap, and its `concurrency: { cancel-in-progress: false }` means a subsequent
push's sync would queue behind it rather than cancel it; (2) sync-blogger.js's fetch() calls
(inside fetchWithRetry(), lines 364-369) have no request timeout via AbortController/
AbortSignal.timeout(), and only retry on 429/5xx HTTP responses — a network-level failure (DNS
error, connection reset) is not caught and aborts the whole sync with no retry; (3) the main()
sync loop (lines 768-844) posts poems strictly sequentially, so a large collection's first-time
sync could take a long time (two sequential HTTP round trips per new poem).

The goal: sync-blogger.yml's job has a sensible timeout backstop (e.g. 15 minutes).
sync-blogger.js's outbound fetch() calls have a request timeout and retry on network-level
rejection, not just HTTP error statuses. (Lower priority, optional: bounded concurrency in the
sync loop for large collections — only implement this part if you can do it without
significantly complicating the existing sequential error-handling and progress-reporting logic;
it is explicitly the lowest-priority piece of this task and can be left for a future change if
it looks risky.)

Constraints: do not change sync-blogger.js's actual Blogger API semantics (what gets created/
updated/removed) — this is a resilience/timeout/retry hardening task only. Preserve the existing
retry-on-429/5xx behaviour; add to it, don't replace it. If you add concurrency, preserve the
existing per-poem success/failure reporting in the final summary.

Verification: this touches a live external API (Blogger) that isn't available to test against
directly in most environments — rely on src/tools/sync-blogger.js's existing test file
(test/sync-blogger.test.js) and its mocking approach (read it first to understand how fetch is
faked in tests) to add test cases: a mocked network-level rejection should now be retried; a
mocked timeout should be respected. Run `npm test` and `npm run lint`. For the workflow timeout,
there's no automated way to verify short of a real hung run — just confirm the YAML is valid
(e.g. via `gh workflow view` or a linter) and the value is sensible.

Work cost-consciously. The timeout/retry code changes require care around existing error-handling
paths — have a mid-capability tier make the sync-blogger.js changes and review them; the
workflow YAML timeout addition is trivial and suits a low-cost tier on its own.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix(sync-blogger): add request timeouts, network-failure retry, and a job timeout`). Mark
TD26072114 resolved in the same PR if this fully addresses it, or note in the PR description
which of the three findings (F-OPS-01/F-OPS-02/F-PERF-01) were addressed if you deferred the
concurrency piece (check TECH-DEBT.md for the current entry's exact wording first).
```

## Prompt for R-15 — Add missing documentation cross-references

**Bundles:** F-UX-04, F-DOC-06 — both are "add a short pointer/cross-reference that's currently
missing" documentation additions, small and independent, done together for efficiency. · **Run
after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: README.md, docs/POEM-TO-YAML.md.

The problem: a project review dated 2026-07-21 (findings F-UX-04, F-DOC-06 in
reviews/project-review-2026-07-21/02-findings.md) found two missing documentation
cross-references: (1) README.md (375 lines) never mentions the poetic/browser library export or
docs/RENDERER-BROWSER.md, even though it's a real, tested, documented public API surface
(package.json's exports map includes "./browser" and "./browser/poetic.css"); a reader going
through the README top-to-bottom would never learn this exists. (2) docs/POEM-TO-YAML.md
doesn't mention the incremental-rebuild/`--force` skip behaviour that applies to the exact
script it documents (docs/BUILD.md covers this mechanism, but a reader of the narrower
POEM-TO-YAML doc alone would miss it and be confused by "up to date" skip messages).

The goal: README.md has a short section or list entry pointing to docs/RENDERER-BROWSER.md
(alongside wherever it already links its other docs — check its existing doc-links list first
and match that style). docs/POEM-TO-YAML.md has a short paragraph or cross-reference noting the
incremental-rebuild mechanism and the `--force`/`POETIC_FORCE_REBUILD=1` override, pointing to
docs/BUILD.md for the full mechanism if that's a cleaner split than duplicating the explanation.

Constraints: keep both additions short (a few sentences each) — this is filling a gap, not
rewriting either document. Match each document's existing tone and structure.

Verification: read both documents once after your edit as if you were a first-time reader,
confirming the new cross-references read naturally in context and aren't just tacked on at the
end disconnected from surrounding content. Run `npm run check`.

Work cost-consciously. Both additions are small and well-specified — a low-cost model tier is
sufficient for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`docs: cross-reference the browser renderer and incremental-rebuild behaviour`). Mark
TD26072115 resolved in the same PR if this fully addresses it (check TECH-DEBT.md first).
```

## Prompt for R-16 — Small defensive-hardening batch (config, dev server)

**Bundles:** F-ARCH-02, F-SEC-01, F-SEC-02, F-DATA-01 — four small, independent, low-severity
hardening items, none individually worth a separate PR, bundled for efficiency. · **Run after:**
no prerequisites

```text
Project: "poetic", a Node.js framework. Files: src/tools/poetic-config.js, src/tools/sync-blogger.js,
src/tools/serve-static.js, src/tools/song-handlers.js.

The problem: a project review dated 2026-07-21 (findings F-ARCH-02, F-SEC-01, F-SEC-02,
F-DATA-01 in reviews/project-review-2026-07-21/02-findings.md) found four small, independent,
low-severity gaps:

1. (F-ARCH-02) sync-blogger.js's resolveConfig() (lines 82-123) validates blogger.removed/
   blogger.content against allow-lists (VALID_REMOVED/VALID_CONTENT), but an invalid value
   (e.g. a typo) is silently coerced to the default with no warning — indistinguishable from the
   key being unset. poetic-config.js's readPoeticConfig() already has a precedent for warning on
   a bad value (the blogger.blog_id-parsed-as-number case, lines 63-68) — follow that pattern.
2. (F-SEC-01) serve-static.js sets `Access-Control-Allow-Origin: "*"` unconditionally on every
   response (lines 230-239, 258-265, 277-284, 302-304), even though the server defaults to
   binding on loopback only (127.0.0.1). This is low-severity (inert unless a developer opts
   into `--host 0.0.0.0`) but should be scoped to loopback origins, or omitted, when the server
   is bound to its loopback default.
3. (F-SEC-02) song-handlers.js's applyValuePatterns() (line 200) builds `new RegExp(entry.match)`
   from consumer-authored `.poetic-config.yaml` config with no ReDoS/timeout guard. This is
   explicitly the lowest-priority item in this batch — the config is self-authored by the same
   person who owns the build, not an external trust boundary, so this task's acceptance criteria
   do NOT require fixing this one; only fix it if doing so is trivial alongside the other three,
   otherwise leave it and say so in your PR description.
4. (F-DATA-01) sync-blogger.js's resolveConfig() (lines 100-114) reads the Blogger credentials
   file off disk with no check of its current permission bits, so if something later widens the
   file's permissions from the 0600 it was created with, the tool would silently keep using it.

The goal: (1) an invalid enum config value produces a console warning naming the bad value and
the valid options, matching the existing blog_id warning's style. (2) the CORS header is scoped
to the loopback origin (or omitted entirely) when the server is bound to its loopback default,
and only becomes a wildcard (or stays as-is) when `--host 0.0.0.0` is explicitly passed. (3) is
optional per above. (4) resolveConfig (or wherever the credentials file is first read) checks
the file's mode via fs.statSync and logs a warning (not a hard failure) if it's wider than 0600.

Constraints: none of these four should change default behaviour for a correctly-configured setup
— they add warnings/scoping for edge cases, not new required steps for normal use. Do not make
any of these three a hard error; warnings only, since none represents an active exploit in this
project's trust model.

Verification: add a small targeted unit test for each of the three (or four) items you implement:
an invalid enum value in a test config produces a warning; a loopback-bound server's response
doesn't carry a wildcard CORS header (or scopes it correctly) while an explicit --host 0.0.0.0
still does whatever the intended new behaviour is; a credentials file created with permissions
wider than 0600 produces a warning when read. Run `npm test` and `npm run lint`.

Work cost-consciously. Each of these four items is small and mechanical — a low-cost model tier
is sufficient for the whole task; there's no need to escalate any of them to a higher tier.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix: warn on invalid config enums, scope dev-server CORS, check credentials-file permissions`).
State clearly in the PR description which of the four items (F-ARCH-02, F-SEC-01, F-SEC-02,
F-DATA-01) you addressed. Mark TD26072116 resolved in the same PR only if you addressed all of
the ones the TECH-DEBT.md entry's acceptance criteria actually require (check that entry's exact
wording first — recall F-SEC-02 was explicitly optional above).
```

## Prompt for R-17 — Quote-style lint rule and JSDoc completion

**Bundles:** F-CODE-02, F-CODE-05 — both are code-style-discipline gaps addressed via
eslint.config.js and doc-comment additions in the same general area of the codebase. · **Run
after:** not simultaneously with R-11 (both touch shared config/lint areas — do as separate PRs,
either order)

```text
Project: "poetic", a Node.js framework. Files: eslint.config.js, and (for the JSDoc half)
src/tools/poem-parser.js.

The problem: a project review dated 2026-07-21 (findings F-CODE-02, F-CODE-05 in
reviews/project-review-2026-07-21/02-findings.md) found: (1) no `quotes` ESLint rule is
configured, and string-quote style drifts by file — build-poems.js, build-all-poems.js,
build-blogger.js, and serve-static.js consistently use double quotes, while the rest of
src/tools/ (poem-parser.js, poem-render.js, song-handlers.js, etc.) consistently use single
quotes; each file is internally consistent, but the codebase as a whole isn't. (2) JSDoc
(@param/@returns) discipline is inconsistent — thorough in newer modules (sync-blogger.js has 70
tags across 919 lines, needs-rebuild.js has 17 across 175 lines) but sparse in poem-parser.js
(only 5 tags across 1854 lines and ~50 methods), the project's highest-complexity file.

The goal, part 1 (do this part fully): eslint.config.js has a `quotes` rule (pick single or
double — check which style is more prevalent across the whole codebase by line count first and
match the majority, or ask/note your choice clearly if it's close), and the codebase is
reformatted to comply (`eslint --fix` after adding the rule, then manually verify anything it
couldn't auto-fix). The goal, part 2 (lower priority, larger scope — treat as a best-effort
pass, not a strict requirement to complete every method in one PR): poem-parser.js's public/
significant methods gain @param/@returns JSDoc tags matching the style already established in
sync-blogger.js and needs-rebuild.js.

Constraints: part 1 must not change any runtime behaviour — verify via the full test suite,
especially golden/snapshot tests, since string-literal reformatting inside template strings or
regex-adjacent code needs care (don't let an automated fixer touch string contents that aren't
meant to change, e.g. inside regex literals or already-intentional escapes). Part 2 is
documentation-only and must not change any code behaviour.

Verification: for part 1, run `npm test` (all 493 tests, especially golden/snapshot ones) and
`npm run lint` (should now pass with the new rule enforced) after the reformat. For part 2, spot-
check a few of your new JSDoc blocks against the method's actual parameters/return value to
confirm accuracy (a wrong JSDoc tag is worse than no tag).

Work cost-consciously. Part 1 (adding the lint rule and running eslint --fix, then verifying no
behaviour change) is mechanical and suits a low-cost tier. Part 2 (writing accurate JSDoc for
~50 methods in the codebase's most complex file) requires actually understanding each method —
a mid-cost tier is appropriate, working through the file incrementally rather than all at once;
this part can reasonably span multiple small PRs over time rather than one large one.

Deliverable: a PR for part 1 (fresh clone, feature branch, Conventional Commits title, e.g.
`style: add quotes ESLint rule and reformat`). Part 2 can be a separate PR or an ongoing series
(e.g. `docs(poem-parser): add JSDoc to variable-substitution methods`, done incrementally). Mark
TD26072117 resolved once you consider the acceptance criteria met (check TECH-DEBT.md first;
note whether part 2 was done fully or is intentionally left as ongoing polish).
```

## Prompt for R-18 — Miscellaneous small fixes

**Bundles:** F-UX-03, F-TOOL-01, F-UX-05, F-DEPS-04 — four small, independent, low-priority
items with no shared theme beyond "trivial," bundled into one cleanup-pass PR for efficiency.
· **Run after:** no prerequisites

```text
Project: "poetic", a Node.js framework. Files: src/templates/poem-page.pug,
editors/vim/ftdetect/poem.vim, src/browser/render.js and src/browser/render-aggregate.js,
docs/SCRIPTS.md.

The problem: a project review dated 2026-07-21 (findings F-UX-03, F-TOOL-01, F-UX-05, F-DEPS-04
in reviews/project-review-2026-07-21/02-findings.md) found four small, independent, low-priority
gaps:

1. (F-UX-03) src/templates/poem-page.pug (renders each standalone poem page) has only
   `h2.poem-title` and no `<h1>` anywhere on the page (line 25), while index.html and
   all-poems.html both correctly use h1 for the site title — a minor heading-hierarchy
   inconsistency for screen-reader users navigating by heading level.
2. (F-TOOL-01) editors/vim/ftdetect/poem.vim still has a literal, unfilled placeholder:
   `" Maintainer:   (maintainer name)` and a stale `Last Change: 2025-10-08` date, while its
   sibling editors/vim/syntax/poem.vim is kept current.
3. (F-UX-05) src/browser/render.js and src/browser/render-aggregate.js surface parser errors as
   plain, unclassified `Error` objects (e.g. `Error: Invalid or missing date`) with no `.code` a
   consuming app could branch on programmatically — consistent with the CLI's own behaviour, but
   a library surface intended for embedding typically wants richer error shapes. This item is
   explicitly optional/lowest-priority in this batch; only do it if the other three are done and
   it's straightforward — do not let it block the rest.
4. (F-DEPS-04) scripts/sync-framework.sh includes package.json and package-lock.json in its
   FRAMEWORK_PATHS (lines 126-138), so a sync overwrites a consumer repo's lockfile wholesale
   with no warning that custom package.json edits would be clobbered. docs/SCRIPTS.md's sync
   section doesn't call this out.

The goal: (1) the standalone poem page has a proper heading hierarchy — either promote the
title to h1, or, if h2 is intentional (e.g. because the page has an implicit site-level h1 via
navigation), document that rationale where the template's structure is decided. (2) the vim
ftdetect file's Maintainer field is filled in (or the line removed) and Last Change is updated to
match the actual last edit. (3) optional, see above. (4) docs/SCRIPTS.md's sync-framework
section gets a one-line callout: review the staged diff carefully before committing if you've
customised package.json, since a sync will overwrite it.

Constraints: item 1 is the only one with a visible-output change — verify it doesn't break the
existing page layout/CSS, which may target `.poem-title` or `h2` specifically (grep
public's/poetic.css for `.poem-title`/`h2` selectors first and adjust if needed to keep the
visual appearance the same while fixing the semantic heading level). Items 2 and 4 are trivial
text edits. Item 3, if attempted, must not change any error *message* text, only add an
additional `.code` property alongside the existing `.message`.

Verification: for item 1, run `npm run build && npm start` and visually inspect a generated poem
page to confirm no visual regression, and check heading level in devtools/inspect. For items 2
and 4, just confirm the text reads correctly. For item 3 if attempted, run `npm test` to confirm
no existing test asserts on the old plain-Error shape. Run `npm run check` for all changes.

Work cost-consciously. All four items are small and mechanical — a low-cost model tier is
sufficient for the whole task.

Deliverable: a PR (fresh clone, feature branch, Conventional Commits title, e.g.
`fix: poem-page heading level, vim ftdetect metadata, sync-framework doc callout`). State clearly
in the PR description which of the four items you addressed (item 3 is optional). Mark
TD26072118 resolved in the same PR if this fully addresses the entry's acceptance criteria
(check TECH-DEBT.md first for its exact wording, including whether item 3 is in scope).
```
