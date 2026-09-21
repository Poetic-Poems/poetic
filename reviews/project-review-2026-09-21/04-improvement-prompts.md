# Improvement prompts

One prompt per recommendation, in priority order (severity first, then
effort). Each prompt is self-contained and may be pasted into a fresh AI
agent session with no other context from this review. No prompt in this set
depends on another having been completed first.

## Prompt for R-01 — Document the `parts` mixed-segment shape in the YAML schema

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js framework
that converts plain-text `.poem` files to a YAML intermediate format
(`src/tools/poem-to-yaml.js`) and back (`src/tools/yaml-to-poem.js`), then
renders the YAML to HTML. The YAML schema is documented by hand in
docs/YAML-SCHEMA.md.

The problem: `src/tools/poem-parser.js` (around lines 892-950) emits a
`segment.parts` array — alternating `{ type: 'lines', lines: [...] }` and
`{ type: 'html', html: '...' }` entries — whenever a stanza mixes plain
verse lines with an embedded `<<<...>>>` literal/raw-HTML block (this
source syntax is documented in docs/POEM-SYNTAX.md, search for `<<<`).
docs/YAML-SCHEMA.md's "Segments Format" section only documents the plain
`lines:` scalar case and never mentions `parts` at all.

The goal: add a new subsection to docs/YAML-SCHEMA.md (placed near the
existing "Segments Format" section) documenting the `parts:` array shape —
its field names, the `type: lines` vs `type: html` variants, and when the
converter produces it instead of a bare `lines:` scalar. Base the
documented shape on real converter output, not a hand-typed guess: find or
construct a `.poem` fixture containing an embedded `<<<...>>>` block (check
`src/poems/` and `test/fixtures/` first for an existing one before writing
a new one), run `node src/tools/poem-to-yaml.js <that-file>`, and use its
actual YAML output as the worked example in the new doc subsection.

Constraints: do not change any code, only docs/YAML-SCHEMA.md (and
docs/POEM-SYNTAX.md only if you find it also needs a small cross-reference
link added — don't restructure it otherwise). Match the existing doc's
British English spelling and Markdown table/heading conventions. Follow
this repository's AGENTS.md "Documentation principles": describe the
current, as-built shape only — no "previously"/"now" historical phrasing.

Verification: run `npm run check` (trailing-whitespace gate) and confirm it
still passes after your edit. There is no automated doc-content checker, so
manually re-read the new subsection against the actual YAML you generated
to confirm they match exactly.

Work cost-consciously. This is a small, mechanical, well-specified
documentation task — it suits a low-cost model tier end to end; no
delegation to subagents is necessary.

Deliverable: a single commit/diff touching docs/YAML-SCHEMA.md (and
optionally a one-line cross-reference in docs/POEM-SYNTAX.md), with a short
summary of what was added.
```

## Prompt for R-02 — Add line-number/filename context to poem parse errors

**Bundles:** R-02 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js framework
whose core parser, `src/tools/poem-parser.js` (a `PoemParser` class,
~1580 lines), turns plain-text `.poem` files into a structured object later
converted to YAML by `src/tools/poem-to-yaml.js`.

The problem: `PoemParser` throws bare, context-free error messages when
required fields are missing: `throw new Error('Missing title')` (line 739),
`'Missing date'` (lines 749, 765), `'Invalid or missing date'` (line 769).
None of these include a line number. Only the batch conversion path in
poem-to-yaml.js (`convertAllPoemsToYaml()`, around lines 107-109) wraps the
error with the source filename in its console output; a single-file
invocation (`node src/tools/poem-to-yaml.js <file>`, around lines 144-166)
has no equivalent wrapper, so a user running it directly sees only the bare
message with no filename and no line number.

The goal:
1. `PoemParser` already tracks its current position as `this.index` into
   `this.lines` while parsing. Thread the relevant line number into each of
   the three throw sites above, so the thrown Error's message includes a
   1-based line number (e.g. `Missing title (expected before line 12)` —
   pick working phrasing; where the error is about an absence rather than a
   malformed value, report the line number where parsing gave up looking,
   documented clearly in the message).
2. Make the single-file CLI path in poem-to-yaml.js catch a parse error and
   prefix it with the source filename, mirroring the batch path's existing
   `Error converting ${file}: ${error.message}` pattern (poem-to-yaml.js
   line ~108).

Constraints: this must be a behavior-preserving change to everything except
error message text — do not change what counts as a valid/invalid poem, do
not change the shape of successfully-parsed output. Follow the existing
JSDoc convention (most exported functions in this file have `@param`/
`@returns` blocks). Keep the error message format consistent with the
project's plain, direct tone (see other error messages in the same file for
the house style).

Verification: run `npm test` (the full suite must still pass — several
tests likely assert on these exact error messages, e.g. search
`test/poem-parser.test.js`, `test/poem-to-yaml.test.js`,
`test/poem-to-yaml-metadata.test.js` for `'Missing title'`/`'Missing date'`
and update those assertions to match the new message format rather than
loosen them). Run `npm run lint` and `npm run check` and confirm both still
pass. Manually construct one malformed `.poem` fixture missing a title and
run `node src/tools/poem-to-yaml.js <that-file>` directly to confirm the
filename and line number both appear in the output.

Work cost-consciously. This task is ordinary implementation against a clear
acceptance criterion (three throw sites, one CLI wrapper) — it suits a
mid-cost model tier. If your environment supports subagents, a low-cost
tier can handle updating the existing test assertions to match the new
message format once the message format itself is decided, but decide the
message format and touch the three throw sites yourself rather than
delegating that judgment call.

Deliverable: a commit/diff touching src/tools/poem-parser.js and
src/tools/poem-to-yaml.js (plus any test files whose assertions needed
updating), with a summary of the new error message format and confirmation
that `npm test`, `npm run lint`, and `npm run check` all pass.
```

## Prompt for R-03 — Extract shared label-line/reserved-label helpers in `poem-parser.js`

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js framework
whose core parser, `src/tools/poem-parser.js` (a `PoemParser` class,
~1580 lines), turns plain-text `.poem` files into a structured object.

The problem: the same "is this line a label line?" check is duplicated five
times in this file: `line.trim().startsWith('{') && line.trim().includes('}')
&& !line.trim().startsWith('{{')` (or a variant without the `{{` exclusion)
appears at approximately lines 877, 914, 1266, 1404, and 1416. A companion
check, `label !== 'Synopsis' && label !== 'Full'` (excluding two reserved
label names from being treated as ordinary metadata labels), is duplicated
inline at approximately lines 879 and 1268. This is pure copy-paste risk: a
future syntax change (adding a third reserved label name, or tweaking what
counts as a label line) requires remembering to update every call site, and
missing one would silently misparse only some sections of a poem.

The goal: introduce one shared `isLabelLine(line)` helper function and one
shared `RESERVED_LABELS` constant (a `Set` containing `'Synopsis'` and
`'Full'`) in this file, and replace all five/two duplicated inline checks
with calls to them. This must be a pure, behavior-preserving refactor —
byte-identical parsing output before and after for every input.

Constraints: do not change parsing behavior in any way — this is
refactor-only. Match the file's existing style (check whether other
private helpers in this class are plain functions, module-level constants,
or private class methods, and follow whichever pattern is already
dominant). Keep the `{{` exclusion variant and non-`{{`-exclusion variant
of the label-line check distinguishable if the two variants are genuinely
used in different contexts for different reasons — read each of the five
call sites' surrounding logic carefully before assuming they're all
identical; if one is subtly different, document why in a comment rather
than silently unifying it.

Verification: run `npm test` (the full suite, especially
test/poem-parser.test.js, test/poem-markup.test.js,
test/yaml-to-poem-roundtrip.test.js, and test/golden.test.js — the
round-trip and golden tests are the strongest signal that parsing behavior
is unchanged) and confirm 100% of currently-passing tests still pass with
no changes to any test file. Run `npm run lint` and `npm run check`.

Work cost-consciously. This is mechanical, well-specified refactoring work
(extract a duplicated pattern into a named helper) — it suits a low-cost
model tier, provided the agent carefully diffs behavior before and after
rather than assuming the extraction is safe. Reserve a mid-cost tier only
if the five call sites turn out to have subtle differences requiring
judgment calls about how to unify them.

Deliverable: a commit/diff touching only src/tools/poem-parser.js, with a
summary confirming the full test suite passes unchanged and a note on
whether any of the five call sites required special handling.
```

## Prompt for R-04 — Fix `docs/BUILD.md` step numbering and README doc-index gaps

**Bundles:** R-04 (F-DOC-02 + F-DOC-03) — both are small, independent
Markdown corrections in the docs surface, cheap to do in one pass rather
than two separate small PRs. · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework. Its docs live in docs/*.md and README.md.

Two independent, small documentation fixes:

1. docs/BUILD.md's Quick Start section (roughly lines 10-26) numbers
   `npm run poem-to-raw` as a distinct "step 2.5" to run manually. But
   package.json's `build` script (`"build": "npm run poem-to-raw && npm run
   build:yaml && npm run build:poems && node src/tools/build-all-poems.js"`)
   and docs/BUILD.md's own line ~74 both confirm `poem-to-raw` already runs
   automatically as the first step of `npm run build` (step 1 in the same
   Quick Start). Running it again as "step 2.5" is redundant, and the
   half-integer numbering breaks Markdown's ordered-list auto-numbering in
   most renderers. Fix: remove the redundant step, or replace it with a
   short note explaining `poem-to-raw` is available to run standalone but
   isn't a required separate step.

2. README.md's "Documentation" index (roughly lines 332-343) lists the
   project's docs but omits two that exist: docs/BLOGGER.md (which IS
   linked earlier in the README, around line 47, just not in this index)
   and docs/VIM-SYNTAX-EMBEDDED-LANGUAGES.md. Fix: add both to the index
   list, matching the existing entries' format (a short one-line
   description of each doc's contents).

Constraints: pure documentation edits, no code changes. Follow this
repository's AGENTS.md "Documentation principles": as-built descriptions
only, no historical ("previously"/"now") phrasing. Match existing
Markdown formatting conventions in each file exactly (list style, link
style).

Verification: run `npm run check` (trailing-whitespace gate) and confirm it
passes. Manually re-read docs/BUILD.md's corrected Quick Start end-to-end to
confirm the step sequence is now coherent and matches package.json's actual
`build` script composition (read that script in package.json before
editing, don't assume).

Work cost-consciously. Both fixes are small, mechanical Markdown edits —
this whole task suits a low-cost model tier.

Deliverable: a commit/diff touching docs/BUILD.md and README.md, with a
one-line summary of each fix.
```

## Prompt for R-05 — Reuse `summarizePoem()` in `build-all-poems.js`'s aggregate builders

**Bundles:** R-05 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework. It has two independent implementations of "summarize a
poem's YAML for aggregate display": src/tools/aggregate-render-core.js
exports `summarizePoem()`, already shared between the Node build path and
the browser-safe renderer (src/browser/render-aggregate.js:44-49 calls it).
Separately, src/tools/build-all-poems.js has two functions —
`concatenateAllHtmlFiles()` (lines ~64-143) and `generateIndexHtml()` (lines
~250-407) — that each independently loop over every poem's YAML file and
hand-extract overlapping metadata (title, slug, titleHtml, hasAudio, date)
into two slightly different ad hoc shapes, duplicating logic that
`summarizePoem()` already provides.

The problem: this is a second, undocumented implementation of the same
"what does this poem's YAML summarize to" logic living in the Node build
path, disconnected from the one the browser renderer already uses — a
future change to how poems are summarized (e.g. a new metadata field
affecting the index page) has to be remembered and applied in up to three
places instead of one.

The goal: `concatenateAllHtmlFiles()` and `generateIndexHtml()` both call
`summarizePoem()` (from aggregate-render-core.js) to get each poem's core
summary, rather than hand-rolling their own extraction loop. Where a builder
needs an extra field `summarizePoem()` doesn't currently return (e.g.
`labels` or `file`, which one of the two functions uses today), either
extend `summarizePoem()`'s return shape (if the addition is generically
useful and doesn't disrupt the browser renderer's existing use of it) or
compute that one extra field separately alongside the `summarizePoem()`
call — do not fork a second summarization function to work around a missing
field.

Constraints: `summarizePoem()`'s existing contract is used by the browser
renderer (src/browser/render-aggregate.js) — read that call site first and
do not change `summarizePoem()`'s behavior for fields it already returns,
only additively extend it if needed. The generated HTML output
(public/index.html, public/all-poems.html) must be byte-identical before
and after this change for the repository's own example poem(s) and any
fixture poems in test/fixtures/ — this is a pure internal refactor, not a
behavior or output-format change.

Verification: before making any change, run `npm run build` and save a copy
of public/index.html and public/all-poems.html (or `git stash` your changes
and re-generate to compare). After refactoring, run `npm run build` again
and diff the outputs — they must be identical. Run the full test suite
(`npm test`), especially test/build-all-poems.test.js and any browser-render
aggregate tests. Run `npm run lint` and `npm run check`.

Work cost-consciously. This is ordinary implementation work against a clear
behavioral constraint (byte-identical output) — it suits a mid-cost model
tier, since verifying the byte-identical-output constraint correctly is the
part that needs real care, not just following a pattern mechanically.

Deliverable: a commit/diff touching src/tools/build-all-poems.js (and
src/tools/aggregate-render-core.js only if summarizePoem()'s shape needed
extending), with confirmation that generated HTML output is byte-identical
before/after and the full test suite passes.
```

## Prompt for R-06 — Move Pug-embedded helper logic into `render-core.js` as locals

**Bundles:** R-06 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework rendering poems to HTML via Pug
(src/templates/_poem-content.pug, poem-page.pug, poem.pug) using rendering
logic centralized in src/tools/render-core.js.

The problem: src/templates/_poem-content.pug defines its own `slugify(text)`
function inline (around lines 5-10), which duplicates
src/tools/slugify.js's real implementation (lines 13-18) byte-for-byte —
the template's own comment says it "mirrors slugify.js". The same template
also embeds `postscriptPreviewSettings()` (lines ~15-20, parsing/defaulting
preview-line-count params) and `processAnalysisText()` (lines ~23-33,
paragraph-to-`<p>` conversion) as inline Pug JS. A future change to
slugify()'s character class, or to preview-lines defaulting, has to be
remembered and hand-applied in two places (the real module and the
template's inline copy) with no test enforcing they stay in sync.

The goal: reduce _poem-content.pug to *consuming* pre-computed values rather
than computing them inline:
1. `slugify()` calls in the template use the real src/tools/slugify.js
   function, passed in as a Pug local at render time (check how Pug locals
   are already passed into the render call — likely in
   src/tools/render-core.js or wherever `pug.compileFile`/`renderFile` is
   invoked) rather than a duplicated inline definition.
2. `postscriptPreviewSettings()` and `processAnalysisText()`'s logic moves
   into src/tools/render-core.js as real, independently-testable exported
   functions; render-core.js computes their results before the Pug render
   call and passes the already-computed values in as locals (follow the
   existing precedent of how `songsFor()`/`resolveContextVars()` are
   already passed as locals into the same render call — find and match that
   pattern exactly).
3. The inline Pug definitions of all three are deleted once the template
   only references the passed-in locals/values.

Constraints: this must produce byte-identical HTML output — it is a pure
refactor moving *where* logic runs, not changing *what* it computes. Do not
change slugify.js, postscriptPreviewSettings, or processAnalysisText's
actual computed output for any input.

Verification: before changing anything, run `npm run build` and save a copy
of the generated public/ HTML (or use git stash to compare before/after).
After the refactor, run `npm run build` again and diff every generated HTML
file — output must be byte-identical. Run the full test suite (`npm test`),
particularly any poem-render/poem-templates tests. Run `npm run lint` and
`npm run check`.

Work cost-consciously. This requires understanding both the Pug rendering
call site and the template's inline JS carefully enough to preserve exact
behavior — suits a mid-cost model tier. If subagents are available, a
low-cost tier can handle diffing before/after HTML output once the refactor
is complete, but the refactor itself needs a tier that can trace the
existing locals-passing pattern accurately.

Deliverable: a commit/diff touching src/templates/_poem-content.pug,
src/tools/render-core.js, and wherever the Pug render call's locals are
assembled, with confirmation that generated HTML is byte-identical
before/after and the full test suite passes.
```

## Prompt for R-07 — Share error-message constants between parser and browser renderer

**Bundles:** R-07 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework. It has a browser-safe renderer
(src/browser/render.js and friends) that classifies rendering errors by
matching on exact error message strings.

The problem: src/browser/render-errors.js (lines ~25-29) has a
`KNOWN_MESSAGES` map that hard-codes the exact strings `'Missing title'`,
`'Missing date'`, and `'Invalid or missing date'`, mapping each to a
specific error code. These exact strings are independently authored as
thrown-error text in src/tools/poem-parser.js (lines 739, 749, 769). Nothing
enforces the two stay in sync — a future wording change to one of the three
`throw new Error(...)` call sites in poem-parser.js would silently degrade
that error's classification in render-errors.js to a generic fallback code,
with no test failure unless a test specifically asserts the `.code` for
that exact error message.

Note: if R-02 (adding line numbers to these same three error messages) has
already been completed in this repository, the message strings will no
longer be the bare constants described above — they'll include a line
number suffix/context. In that case, adapt this task to whatever the
current exact message format is: the goal is still the same (one shared
source of truth for the message text/prefix used for matching), just against
current reality rather than the exact strings quoted here. Check
src/tools/poem-parser.js's current throw sites and src/browser/
render-errors.js's current KNOWN_MESSAGES before assuming the strings below
are still literal.

The goal: the three message strings (or, if R-02 has landed, whatever stable
prefix/pattern is still used for matching) exist as named exported
constants in exactly one place — either a small new shared module (e.g.
src/tools/parse-error-messages.js) or exported directly from
poem-parser.js, whichever fits the existing module dependency direction
better (check: can src/browser/render-errors.js already import from
src/tools/, or does it need to stay dependency-free of src/tools/ per the
browser-safe renderer's filesystem-free design documented in
docs/RENDERER-BROWSER.md — if the latter, a new tiny shared module with NO
filesystem/Node-only dependencies is the right home, importable by both
sides). Both the `throw` sites in poem-parser.js and `KNOWN_MESSAGES` in
render-errors.js reference the same constants instead of independently
authored literals.

Constraints: src/browser/*.js must remain filesystem-free (no `fs`, `path`,
`__dirname` — this is a tested architectural invariant, see
test/browser-render.test.js). Whatever module you introduce or extend to
hold the shared constants must not violate that if render-errors.js ends up
importing from it.

Verification: run the full test suite (`npm test`), particularly
test/browser-render-errors.test.js and test/poem-parser.test.js (or
whichever test files assert on these specific error messages/codes) to
confirm error classification behavior is unchanged. Run `npm run lint` and
`npm run check`.

Work cost-consciously. This is a small, mechanical extract-constant
refactor — suits a low-cost model tier, with the one judgment call (where
the shared module should live, given the browser-safe filesystem-free
constraint) worth a moment of care rather than blind extraction.

Deliverable: a commit/diff touching src/tools/poem-parser.js,
src/browser/render-errors.js, and any new shared module, with confirmation
the full test suite passes and a note on where the shared constants ended
up living and why.
```

## Prompt for R-08 — Broaden `a11y-check.js`'s sampled pages

**Bundles:** R-08 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework that renders poems to static HTML for GitHub
Pages/Blogger publishing. src/tools/a11y-check.js runs axe-core
accessibility checks (via puppeteer-core driving a real headless Chrome)
against a sample of the generated public/ HTML, wired as a non-blocking CI
step in .github/workflows/build-poems.yml.

The problem: `discoverCheckTargets()` (src/tools/a11y-check.js, lines
~36-58) currently selects public/index.html plus only the
alphabetically-first individual poem directory under public/ as its check
targets. This misses two things: (1) public/all-poems.html — the
concatenated aggregate page, rendered through a different template path
(standalone unset, vs. the individual poem page's standalone=true) — is
never checked at all; (2) only one poem's specific section combination gets
scanned, so if that alphabetically-first poem lacks audio, postscript, or
analysis sections, any a11y regression specific to those sections (e.g. in
the audio/song-embed markup, or the analysis synopsis/full toggle) could
pass CI indefinitely.

The goal: `discoverCheckTargets()`'s target list includes
public/all-poems.html, and the individual-poem target selection either
picks (or the target list includes an additional pick of) a poem that
exercises audio + postscript + analysis sections together, rather than
whichever poem happens to sort first alphabetically. If the repository's
own dev corpus (src/poems/) doesn't currently contain a poem with all three
optional sections, either add one (a small test-fixture-style poem, kept
consistent with the style of existing example poems in src/poems/) or adapt
the target-selection logic to combine multiple targets' worth of coverage
sensibly — use your judgment on which is less invasive, and prefer not
adding a new poem if the existing corpus can be leveraged another way.

Constraints: do not weaken a11y-check.js's existing "fail safe with a clear
message when no Chrome is available" behavior (lines ~113-119) — this
change is about broadening *what* gets checked, not changing *whether* the
check runs. Keep the tool's existing CI wiring (continue-on-error: true) —
this recommendation is about coverage completeness, not about making it a
blocking check (that would be a separate, larger decision outside this
task's scope).

Verification: run `npm run a11y` locally if your environment has a headless
Chrome available (puppeteer-core will look for one — check
src/tools/a11y-check.js's `findChromeExecutable()` for how it locates one)
and confirm it now scans all-poems.html plus a feature-rich poem page
without errors. If no Chrome is available in your environment, you cannot
fully verify this end-to-end — in that case, verify at the unit level
instead: run `npm test` with a focus on test/a11y-check.test.js, which
tests `discoverCheckTargets()`'s selection logic directly without needing a
real browser, and extend that test file's assertions to cover the new
target-selection behavior. State clearly in your final report which
verification path you used.

Work cost-consciously. This requires judgment about how to broaden test
target selection without adding unnecessary fixture bloat — suits a
mid-cost model tier for the design decision, though the mechanical parts
(writing the new unit test assertions) could be delegated to a low-cost
tier once the approach is decided.

Deliverable: a commit/diff touching src/tools/a11y-check.js (and possibly a
new fixture poem under src/poems/ or test/fixtures/), with confirmation of
which verification path was used (full browser-driven run vs. unit-level
target-selection test) and why.
```

## Prompt for R-09 — Verify and, if needed, fix the borderline secondary-text contrast

**Bundles:** R-09 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework. Its generated poem pages use public/poetic.css for
styling, including a secondary/meta-text colour used for the `.no-content`
class, author/date metadata, and similar secondary text (colour
`#707070`, at approximately lines 28, 82, 478, 533, 551, 563 of
public/poetic.css) against a page background of `#f5f5f5` (line ~33).

The problem: by manual WCAG relative-luminance calculation, this pair comes
to approximately 4.53:1 contrast — just over the 4.5:1 AA minimum for
normal-size text, close enough that rendering/anti-aliasing differences
across browsers could tip it either way in practice. This has not been
confirmed with a real contrast-ratio tool.

The goal: definitively verify whether `#707070` on `#f5f5f5` passes WCAG AA
(4.5:1 for normal text) using a real tool — either `npm run a11y` (which
runs axe-core via puppeteer-core against real generated HTML, and axe-core's
colour-contrast rule will report an authoritative result) if your
environment has a headless Chrome available, or a standalone WCAG
contrast-ratio calculator fed the two exact hex values if it does not. If
verification confirms a failure, darken `#707070` to `#666666` (a colour
already used elsewhere in poetic.css, confirmed at approximately 5.75:1
against the same background) in all six locations listed above. If
verification confirms a pass, make no code change — do not "fix" a
colour that already passes AA.

Constraints: do not change this colour speculatively without verification
first — the whole point of this task is to resolve the uncertainty, not to
guess conservatively. If you darken the colour, check every one of its uses
in poetic.css to confirm none of them relies on the specific lighter shade
for a reason unrelated to contrast (e.g. a deliberate visual hierarchy
distinct from pure accessibility) — read the surrounding CSS rules'
comments/context before changing each one.

Verification: run `npm run a11y` if possible and check its output for any
colour-contrast violation on the affected selectors. If a code change is
made, re-run `npm run a11y` (or manually recompute the new pair's contrast
ratio) to confirm the fix actually resolves the violation. Run `npm run
lint` and `npm run check` regardless of outcome.

Work cost-consciously. This is a small, bounded verify-then-maybe-fix task
— suits a low-cost model tier, since the decision tree is fully specified
(verify, then act only on failure).

Deliverable: a report stating the verified contrast ratio and pass/fail
result, plus (only if a fix was needed) a commit/diff touching
public/poetic.css with confirmation the new ratio passes.
```

## Prompt for R-10 — Add a thin `CONTRIBUTING.md` and a basic issue template

**Bundles:** R-10 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework, single-maintainer, with essentially no external
contributor traffic today (its GitHub issue/PR history is dominated by the
maintainer's own work and Dependabot). It has no CONTRIBUTING.md and no
.github/ISSUE_TEMPLATE/ directory, though README.md's own "Contributing"
section (roughly lines 345-390) already covers PR etiquette, branch
protection rules, Conventional Commits format (with the allowed type list),
and the exact local-dev commands a contributor should run before pushing
(npm test, npm run lint, npm run coverage, npm run check, npm run
check:licenses).

The problem: this is purely a GitHub-convention-based discoverability gap,
not a real information gap — README already has the content. GitHub
specially surfaces a root-level CONTRIBUTING.md (in the new-issue flow, the
repo sidebar "Contribute" link) that a GitHub-savvy contributor expects to
find and won't think to look for inside README.

The goal: add a short root-level CONTRIBUTING.md that points to README's
existing "Contributing" section rather than duplicating its content (e.g.
"See the Contributing section of the README for how to propose a change"),
plus a minimal issue template — either a single
.github/ISSUE_TEMPLATE/bug_report.md or a .github/ISSUE_TEMPLATE/config.yml
pointing issue-openers at the right place (GitHub's private-vulnerability
route for security issues per SECURITY.md, ordinary GitHub issues for
everything else).

Constraints: keep both files short — this is a low-traffic, single-
maintainer repo, and the goal is discoverability, not adding process weight
disproportionate to the project's actual contributor base. Do not duplicate
README's contributing content wholesale; link to it. Follow this
repository's AGENTS.md "Documentation principles" (as-built, no historical
phrasing) for anything you write.

Verification: run `npm run check` (trailing-whitespace gate) and confirm it
passes. Manually confirm the CONTRIBUTING.md's link/reference to README's
section is accurate (open README.md and check the section heading you're
pointing to still exists with that name).

Work cost-consciously. This whole task is small, mechanical, well-specified
documentation work — suits a low-cost model tier.

Deliverable: a commit/diff adding CONTRIBUTING.md and an issue template
file, with a one-line summary of what each contains.
```

## Prompt for R-11 — Unify CLI `--help` handling across all tools

**Bundles:** R-11 (F-OPS-01 + F-UX-04) — both are small inconsistencies
between one or two CLI tools and the shared `cli-help.js` pattern the rest
of the toolset already follows; fixing them together means reading
cli-help.js's contract once instead of twice. · **Run after:** no
prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework with a dozen CLI entry points under src/tools/. Most of
them share a common `--help`/`-h` handling helper, `isHelpRequested()`, in
src/tools/cli-help.js.

Two independent small inconsistencies to fix:

1. src/tools/blogger-auth.js hand-rolls its own `--help`/`-h` detection
   inside its own `parseArgs()` function (roughly lines 94-108, checked
   around line 423) instead of importing and using `isHelpRequested()` from
   src/tools/cli-help.js the way every other CLI tool in src/tools/ does.
   The end-user-visible behavior (recognising --help and -h) is currently
   identical either way — this is a consistency fix, not a bug fix.

2. src/tools/poem-to-yaml.js's `--help` output (roughly lines 144-146) is a
   bare two-line usage string (`Usage: poem-to-yaml.js <file.poem>
   [output.yaml]` / `or: poem-to-yaml.js --all`) with no `Options:` section,
   noticeably thinner than sibling tools like src/tools/build-poems.js or
   src/tools/serve-static.js, which both include an `Options:` block
   describing each flag and its default.

The goal:
1. blogger-auth.js imports and uses `isHelpRequested()` from cli-help.js in
   place of its own duplicated check, with no change in observable
   behavior.
2. poem-to-yaml.js's `--help` output gains an `Options:` section in the
   same format/style as build-poems.js's or serve-static.js's, documenting
   its actual accepted arguments (the positional `<file.poem>`/
   `[output.yaml]`, the `--all` flag, and any other flags it actually
   accepts — check the file's argument parsing to enumerate them
   accurately rather than guessing).

Constraints: do not change blogger-auth.js's actual accepted flags/behavior,
only how the --help check is implemented internally. Do not invent new
flags for poem-to-yaml.js — only document what it already accepts.

Verification: run `npm test`, particularly test/cli-help.test.js and
test/blogger-auth.test.js (extend blogger-auth.test.js's help-output
assertions if none currently exist, to lock in the change) — confirm
`blogger-auth.js --help` and `-h` both still work identically before/after.
Manually run `node src/tools/poem-to-yaml.js --help` and confirm the new
Options section renders sensibly. Run `npm run lint` and `npm run check`.

Work cost-consciously. Both fixes are small and mechanical — this whole
task suits a low-cost model tier.

Deliverable: a commit/diff touching src/tools/blogger-auth.js and
src/tools/poem-to-yaml.js, with confirmation that `npm test` passes and a
one-line summary of each change.
```

## Prompt for R-12 — Close small test-coverage gaps in warning/logging branches

**Bundles:** R-12 (F-TEST-01 + F-TEST-02) — both are small, independent
coverage-headroom additions to low-risk logging/warning code paths, using
the same kind of targeted unit test; no shared files or sequencing
dependency, just the same class of low-priority fix. · **Run after:** no
prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework with a test suite run via `node --test` and coverage
measured by c8 (`npm run coverage`), gated at 80% lines / 79% branches / 88%
functions in package.json's `c8` config — a gate the project currently
clears at 88.84%/84.19%/97.31%. This task is about closing specific,
low-risk coverage gaps identified in a project review, not about chasing
the coverage percentage for its own sake.

Two independent small gaps:

1. src/tools/blogger-auth.js's interactive `main()` function (roughly lines
   420-603 — readline-driven prompts, OAuth token-exchange orchestration,
   help text) is entirely untested; it's a one-off, manually-invoked setup
   tool (`npm run blogger:auth`), never run from CI, and genuinely hard to
   unit test directly (real readline stdin + real OAuth round trip). Rather
   than trying to test `main()` itself, identify any remaining pure,
   non-I/O logic still inline inside it (e.g. any request/query-string
   construction not yet extracted) and extract + test it, following the
   existing precedent of `buildConsentUrl` (already extracted and tested
   elsewhere in this file) as the pattern to match.

2. src/tools/poetic-config.js (uncovered lines ~51-56: a legacy
   `.poetic-config` filename warning; ~64-68: a blog_id-parsed-as-number
   precision warning) and src/tools/build-all-poems.js (uncovered lines
   ~492-530, ~538-584: `.poetic-config.yaml`-driven favicon/subtitle/
   title/footer console.log branches) both have untested warning/logging
   branches. Add targeted tests asserting the expected warning/log text
   appears when the relevant trigger condition is met, following the
   existing pattern used for sync-blogger.js's analogous `resolveConfig()`
   warning tests (find that pattern in test/sync-blogger.test.js and
   mirror its style — likely capturing console output and asserting on it).

The goal: coverage headroom on these specific branches, via real tests that
assert meaningful behavior (the correct warning text under the correct
trigger condition) — not coverage-gaming with assertion-free calls.

Constraints: do not change any production code's actual behavior — these
are test-only additions, except for the minimal extraction in item 1 if you
determine one is warranted (and even then, extraction must be
behavior-preserving). Do not force testability changes onto `main()`'s true
I/O orchestration (real readline + real OAuth) — that part is legitimately
low-value to force-test and should stay as-is.

Verification: run `npm run coverage` before and after to confirm the
targeted lines move from uncovered to covered, and that overall coverage
does not regress. Run the full `npm test` suite to confirm nothing existing
broke. Run `npm run lint` and `npm run check`.

Work cost-consciously. This is mechanical, well-specified test-writing
against already-identified uncovered lines — suits a low-cost model tier
for the bulk of the work; a mid-cost tier is only worth it if the
`main()` extraction in item 1 turns out to need real judgment about what's
safely extractable.

Deliverable: a commit/diff touching test files (and, only if warranted, a
small extraction in src/tools/blogger-auth.js), with a coverage report
excerpt showing the targeted lines are now covered and confirmation the
full suite still passes.
```

## Prompt for R-13 — Add CI badges for `commit-format` and CodeQL

**Bundles:** R-13 only · **Run after:** no prerequisites

```text
Context: `poetic` (Poetic-Poems/poetic on GitHub) is a Node.js poem
authoring framework. README.md's top (line ~3) currently shows a single
GitHub Actions status badge for the build-poems.yml workflow. Two other
required checks run on every PR — commit-format.yml (Conventional Commits
enforcement) and codeql.yml (CodeQL security scanning) — but have no badge.

The goal: add two more GitHub Actions status badge Markdown lines to
README.md's existing badge row, for commit-format.yml and codeql.yml,
matching the format of the existing build-poems.yml badge exactly.

Approach: GitHub Actions status badges follow the URL pattern
`https://github.com/<org>/<repo>/actions/workflows/<workflow-file>.yml/badge.svg`
(this repo is Poetic-Poems/poetic). Look at the existing badge Markdown in
README.md for build-poems.yml to copy its exact link-wrapping/alt-text
format, then add two more lines using the same pattern for
commit-format.yml and codeql.yml (check the exact filename of the CodeQL
workflow — it may be codeql.yml or have a different internal workflow
`name:` that affects the badge URL; verify by reading
.github/workflows/codeql.yml's `name:` field and, if GitHub's badge URL
needs the workflow's internal name rather than its filename, use that
instead).

Constraints: do not remove or reorder the existing build-poems.yml badge;
add the two new ones alongside it in a sensible order (e.g. build, then
commit-format, then CodeQL, or whatever order reads best — use judgment,
this is cosmetic).

Verification: run `npm run check` (trailing-whitespace gate) and confirm it
passes. Visually inspect the raw Markdown to confirm the two new badge URLs
are well-formed (correct org/repo/filename) — you cannot verify the actual
badge image renders without pushing to GitHub, so double-check the URL
pattern against the existing working badge instead of guessing.

Work cost-consciously. This is a tiny, entirely mechanical documentation
change — suits a low-cost model tier.

Deliverable: a commit/diff touching README.md, with the two new badge URLs
shown in the summary for a final sanity check.
```
