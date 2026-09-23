# Recommendations

Ordered by severity first, then effort (quick wins before long campaigns at
equal severity). There are no Critical or High findings this cycle, so
nothing here is urgent — these are worthwhile, low-risk improvements to a
project that is already in good health. Three findings were judged, by the
subagent that investigated them and confirmed on consolidation, as not
warranting a recommendation at current project scale (F-CODE-03, F-PERF-01,
F-PERF-02, F-CI-01, and the purely informational findings) — they remain
recorded in `02-findings.md` as watch items.

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Document the `parts` mixed-segment shape in the YAML schema | Medium | Small | F-DOC-01 |
| R-02 | Add line-number/filename context to poem parse errors | Medium | Small | F-UX-01 |
| R-03 | Extract shared label-line/reserved-label helpers in `poem-parser.js` | Medium | Small | F-CODE-01 |
| R-04 | Fix `docs/BUILD.md` step numbering and README doc-index gaps | Low | Small | F-DOC-02, F-DOC-03 |
| R-05 | Reuse `summarizePoem()` in `build-all-poems.js`'s aggregate builders | Low | Small | F-ARCH-02 |
| R-06 | Move Pug-embedded helper logic into `render-core.js` as locals | Low | Small | F-ARCH-01 |
| R-07 | Share error-message constants between parser and browser renderer | Low | Small | F-CODE-02 |
| R-08 | Broaden `a11y-check.js`'s sampled pages | Low | Medium | F-UX-03 |
| R-09 | Verify and, if needed, fix the borderline secondary-text contrast | Low | Small | F-UX-02 |
| R-10 | Add a thin `CONTRIBUTING.md` and a basic issue template | Low | Small | F-GOV-01 |
| R-11 | Unify CLI `--help` handling across all tools | Low | Small | F-OPS-01, F-UX-04 |
| R-12 | Close small test-coverage gaps in warning/logging branches | Low | Small | F-TEST-01, F-TEST-02 |
| R-13 | Add CI badges for `commit-format` and CodeQL | Low | Small | F-TOOL-01 |

## R-01 — Document the `parts` mixed-segment shape in the YAML schema

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DOC-01

**Current state:** `docs/YAML-SCHEMA.md` documents every segment as a plain
`lines:` scalar. `poem-parser.js` actually emits a `parts:` array (alternating
`type: lines`/`type: html` entries) whenever a stanza contains an embedded
`<<<...>>>` block, and this shape is completely undocumented.

**Intended end state:** `docs/YAML-SCHEMA.md` has a new subsection (e.g.
"Mixed segments (`parts`)") showing the `parts:` array shape with a worked
example, placed alongside the existing "Segments Format" section, and stating
when the parser produces `parts` instead of a bare `lines:` scalar.

**Approach:** generate a real example via
`node src/tools/poem-to-yaml.js src/poems/poem/_example.poem` (or a similar
fixture containing an embedded `<<<...>>>` block) and use its actual output
as the worked example, so the doc reflects real converter output rather than
a hand-typed guess.

## R-02 — Add line-number/filename context to poem parse errors

**Severity:** Medium · **Effort:** Small · **Addresses:** F-UX-01

**Current state:** `PoemParser` throws bare messages (`'Missing title'`,
`'Missing date'`, `'Invalid or missing date'` at `poem-parser.js:739,749,769`)
with no line number. Only the batch CLI path (`poem-to-yaml.js`'s
`--all` handling) wraps the error with a filename; the single-file
invocation path does not.

**Intended end state:** each of these three `throw` sites includes the
1-based line number of the offending content (or, where the error is about
an *absence* — e.g. no title found at all — the line number where parsing
gave up looking). The single-file `poem-to-yaml.js <file>` CLI path prefixes
any thrown error with the filename, matching the batch path's existing
behavior.

**Approach:** `PoemParser` already tracks `this.index` into `this.lines`
during parsing — thread that (or the specific line index relevant to each
check) into the three `Error` messages. Wrap the single-file CLI's parse
call in a try/catch that prefixes the error message with the filename,
mirroring `poem-to-yaml.js:107-109`'s existing batch-path pattern.

## R-03 — Extract shared label-line/reserved-label helpers in `poem-parser.js`

**Severity:** Medium · **Effort:** Small · **Addresses:** F-CODE-01

**Current state:** the label-line detection pattern
(`line.trim().startsWith('{') && line.trim().includes('}') && ...`) is
duplicated at `poem-parser.js:877,914,1266,1404,1416`; the reserved-label
exclusion (`label !== 'Synopsis' && label !== 'Full'`) is duplicated at
`:879,1268`.

**Intended end state:** a single `isLabelLine(line)` helper and a
`RESERVED_LABELS` constant (a `Set` containing `'Synopsis'` and `'Full'`)
exist once in `poem-parser.js` and are used at all five/two call sites
respectively, with identical behaviour to today (this is a pure refactor,
not a syntax change).

**Approach:** add the helper and constant near the top of the file (or as
private methods on `PoemParser` if that fits the existing style better),
replace each duplicated inline check with a call to it, and confirm the full
test suite (particularly `test/poem-parser.test.js`/`poem-markup.test.js`
and the golden/round-trip tests) still passes unchanged — this must be a
behavior-preserving refactor.

## R-04 — Fix `docs/BUILD.md` step numbering and README doc-index gaps

**Severity:** Low · **Effort:** Small · **Addresses:** F-DOC-02, F-DOC-03

**Current state:** `docs/BUILD.md`'s Quick Start presents `npm run
poem-to-raw` as an extra "step 2.5," redundant with the first step of `npm
run build` which already runs it. README's "Documentation" index (lines
332-343) omits `docs/BLOGGER.md` and `docs/VIM-SYNTAX-EMBEDDED-LANGUAGES.md`.

**Intended end state:** `docs/BUILD.md`'s Quick Start no longer presents
`poem-to-raw` as a required separate step (either removed or turned into a
short note that it's optional/standalone-only); README's documentation index
lists all eleven current docs, including the two missing ones.

**Approach:** small, mechanical doc edits; verify the corrected Quick Start
against `package.json`'s actual `build` script composition before editing.

## R-05 — Reuse `summarizePoem()` in `build-all-poems.js`'s aggregate builders

**Severity:** Low · **Effort:** Small · **Addresses:** F-ARCH-02

**Current state:** `concatenateAllHtmlFiles()` and `generateIndexHtml()`
(`src/tools/build-all-poems.js:64-143`, `:250-407`) each independently loop
over every poem's YAML and hand-extract overlapping metadata (title, slug,
titleHtml, hasAudio, date) into two slightly different shapes, duplicating
what `aggregate-render-core.js`'s `summarizePoem()` (already shared with the
browser renderer, `src/browser/render-aggregate.js:44-49`) already computes.

**Intended end state:** both builders call `summarizePoem()` (or a thin
wrapper around it supplying whatever extra field each builder needs, e.g.
`labels`/`file`) instead of hand-rolling their own extraction loop, so there
is one source of truth for "what does a poem's YAML summarize to" shared by
both the Node build path and the browser render path.

**Approach:** read `summarizePoem()`'s current signature and output shape
first; extend it (or wrap it) rather than changing its existing contract,
since the browser renderer depends on it too. Run the full build
(`npm run build`) against the repo's example poem plus any test fixtures
with audio/multiple versions to confirm output is byte-identical before and
after.

## R-06 — Move Pug-embedded helper logic into `render-core.js` as locals

**Severity:** Low · **Effort:** Small · **Addresses:** F-ARCH-01

**Current state:** `src/templates/_poem-content.pug` defines its own
`slugify(text)` (duplicating `src/tools/slugify.js` byte-for-byte),
`postscriptPreviewSettings()`, and `processAnalysisText()` inline as Pug JS.

**Intended end state:** `slugify` usage in the template calls the real
`src/tools/slugify.js` function (Pug templates compiled via
`build-templates.js` can have functions injected as locals at render time);
`postscriptPreviewSettings()`/`processAnalysisText()`'s logic moves into
`render-core.js`, computed once before the Pug render call and passed in as
locals, with the template reduced to consuming pre-computed values.

**Impact of getting this wrong:** since generated HTML output must stay
byte-identical, this is a pure refactor — no behavior change.

**Approach:** check how `songsFor()`/`resolveContextVars()` are already
passed as locals into the Pug render call (same pattern to follow); move the
three functions' logic into `render-core.js`, export them, wire them into
the render call's locals object, and delete the inline Pug versions. Verify
via `npm run build` that `public/` output is unchanged (diff against a
pre-change build) and the full test suite passes.

## R-07 — Share error-message constants between parser and browser renderer

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-02

**Current state:** `src/browser/render-errors.js:25-29`'s `KNOWN_MESSAGES`
hard-codes the exact strings `'Missing title'`, `'Missing date'`, `'Invalid
or missing date'`, which are independently authored as thrown-error text in
`poem-parser.js:739,749,769`, with nothing enforcing they stay in sync.

**Intended end state:** the three message strings exist as named exported
constants in one place (e.g. a small shared module, or exported from
`poem-parser.js` itself), imported and used both at the `throw` sites and in
`KNOWN_MESSAGES`, so a future rename is a single edit that cannot silently
desync the two files.

**Approach:** straightforward extract-constant refactor; run
`test/browser-render-errors.test.js` and `test/poem-parser.test.js` (or
equivalent) afterward to confirm error classification still matches.

## R-08 — Broaden `a11y-check.js`'s sampled pages

**Severity:** Low · **Effort:** Medium · **Addresses:** F-UX-03

**Current state:** `discoverCheckTargets()` (`src/tools/a11y-check.js:36-58`)
checks `index.html` plus only the alphabetically-first individual poem
directory under `public/`. `all-poems.html` (a separate template path
through `_poem-content.pug` with `standalone` unset) is never checked, and
only one poem's section combination is scanned — a poem with audio,
postscript, or analysis sections could go unchecked indefinitely if the
sampled poem lacks them.

**Intended end state:** the a11y checker's target list includes
`all-poems.html`, and the sampled individual-poem target is chosen (or a
second target added) to exercise a poem with audio + postscript + analysis
sections together, so the checker's own stated scope actually covers every
template variant it claims to protect.

**Approach:** read `discoverCheckTargets()`'s current selection logic first.
If the repo's own dev corpus (`src/poems/`) doesn't already contain a poem
exercising all three optional sections, either extend the existing example
poem or add target selection logic that picks the most feature-rich poem
available rather than the alphabetically-first one. This work depends on a
headless Chrome/puppeteer-core environment being available to actually run
and verify the check — note this constraint in the PR description if the
implementing agent's own environment also lacks one, and rely on
`test/a11y-check.test.js`'s existing unit-level coverage of
`discoverCheckTargets()` to verify the target-selection logic in that case.

## R-09 — Verify and, if needed, fix the borderline secondary-text contrast

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-02

**Current state:** `#707070` (secondary/meta text, `public/poetic.css:28,82,
478,533,551,563`) against the page background `#f5f5f5` (`:33`) computes to
approximately 4.53:1 by the WCAG relative-luminance formula — just over the
4.5:1 AA minimum for normal-size text, close enough that this review (lacking
a real browser/contrast tool) could not confirm it definitively either way.

**Intended end state:** the `#707070`/`#f5f5f5` pair is verified against a
real WCAG contrast-ratio tool (e.g. axe-core via `npm run a11y`, or any
standalone contrast checker). If it fails AA, `#707070` is darkened (e.g. to
`#666`, already used elsewhere in `poetic.css` and confirmed ~5.75:1) in all
its uses.

**Approach:** this is a two-step task — first verify (which requires a
working `npm run a11y` environment with Chrome installed, or an external
contrast-ratio calculator fed the two hex values), then only make the CSS
edit if verification actually fails. Do not change the colour speculatively
if verification passes.

## R-10 — Add a thin `CONTRIBUTING.md` and a basic issue template

**Severity:** Low · **Effort:** Small · **Addresses:** F-GOV-01

**Current state:** no `CONTRIBUTING.md` or `.github/ISSUE_TEMPLATE/` exists.
README.md's own "Contributing" section (lines 345-390) already covers PR
etiquette, branch protection, Conventional Commits format, and the exact
local-dev pre-push commands — this recommendation is about GitHub's
convention-based discovery, not filling a real information gap.

**Intended end state:** a short `CONTRIBUTING.md` exists at the repo root
that points to README's existing "Contributing" section (rather than
duplicating its content) so GitHub's UI (new-issue flow, repo sidebar)
surfaces it; a minimal `.github/ISSUE_TEMPLATE/bug_report.md` or a single
`config.yml`-based template exists for a first bug report.

**Approach:** keep both additions short — this is a low-traffic,
single-maintainer repo, and the goal is discoverability, not process weight.

## R-11 — Unify CLI `--help` handling across all tools

**Severity:** Low · **Effort:** Small · **Addresses:** F-OPS-01, F-UX-04

**Bundling reason:** both findings are about the same small inconsistency —
one or two CLI entry points not matching the shared `cli-help.js` pattern
the rest of the toolset already follows — and fixing them together means
touching `cli-help.js`'s call sites once rather than in two separate passes.

**Current state:** `blogger-auth.js` hand-rolls its own `--help`/`-h` check
(`src/tools/blogger-auth.js:94-108,423`) instead of using the shared
`isHelpRequested()` from `src/tools/cli-help.js` that every other CLI tool
uses. `poem-to-yaml.js`'s `--help` output (`:144-146`) is a bare two-line
usage string with no `Options:` block, unlike its siblings
(`build-poems.js`, `serve-static.js`).

**Intended end state:** `blogger-auth.js` calls `isHelpRequested()` from
`cli-help.js` instead of duplicating the check, with identical end-user
behavior. `poem-to-yaml.js --help` includes an `Options:` block describing
its actual flags/positional arguments, matching the format used by
`build-poems.js`/`serve-static.js`.

**Approach:** mechanical; verify `blogger-auth.js --help` and `-h` both
still work identically after the change (there is likely an existing test
in `test/blogger-auth.test.js` or `test/cli-help.test.js` to extend).

## R-12 — Close small test-coverage gaps in warning/logging branches

**Severity:** Low · **Effort:** Small · **Addresses:** F-TEST-01, F-TEST-02

**Bundling reason:** both are small, additive coverage gaps in low-risk
logging/warning code paths, addressed by the same kind of small,
independent unit test additions — no shared files or sequencing dependency,
just the same class of fix.

**Current state:** `blogger-auth.js`'s interactive `main()`
(`:420-603`) is entirely untested (readline-driven, hard to unit test
directly). `poetic-config.js` (lines 51-56, 64-68) and `build-all-poems.js`
(lines 492-530, 538-584) have uncovered warning/console.log branches for
legacy-config and `.poetic-config.yaml`-driven output.

**Intended end state:** the pure, non-I/O pieces of `blogger-auth.js`'s CLI
flow that can reasonably be extracted (e.g. any request/query-string-shaping
logic still inline in `main()`, following the existing precedent of
`buildConsentUrl` already being extracted and tested) are extracted and
tested. `poetic-config.js` and `build-all-poems.js` gain targeted tests
asserting their warning/log text appears under the relevant trigger
conditions, following the existing pattern used for `sync-blogger.js`'s
analogous `resolveConfig()` warnings.

**Approach:** treat this as coverage headroom, not urgent risk reduction —
do not force testability changes into `main()`'s true I/O orchestration
(real readline + real OAuth round trip), which is legitimately hard to test
and low-value to force.

## R-13 — Add CI badges for `commit-format` and CodeQL

**Severity:** Low · **Effort:** Small · **Addresses:** F-TOOL-01

**Current state:** `README.md:3` shows only a `build-poems.yml` badge; no
badge exists for the `commit-format` check or CodeQL scanning, both of which
run on every PR.

**Intended end state:** README's badge row includes a `commit-format` badge
and a CodeQL badge alongside the existing `build` badge.

**Approach:** GitHub Actions status badges follow a standard URL pattern
(`https://github.com/<org>/<repo>/actions/workflows/<file>.yml/badge.svg`);
add two more badge Markdown lines next to the existing one, verify they
render (they will 404 briefly until the workflow has run at least once on
the badge's target branch, which it already has for both).
