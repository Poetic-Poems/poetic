# Findings

Each finding cites concrete evidence (file paths, line references, command
output) so it can be checked independently. Severities are moderated by this
being a mature, actively-maintained single-maintainer OSS framework rather
than a production service handling third-party data — except where a
finding's own text says otherwise, because its worst-case harm would not be
bounded by the project's own scale.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 13 |
| Informational | 6 |

## Architecture and design (ARCH)

**Strengths:** a clean, tested boundary between the filesystem-free browser
renderer and the Node CLI layer; the `.poem`↔YAML seam is tested end-to-end
via round-trip fixtures, not just per-side; no cyclic dependencies anywhere
in `src/tools/`'s module graph; a single, consistently reused path-guard
implementation for every config-driven or request-driven file path.

### F-ARCH-01 — Pug template duplicates small amounts of parsing/domain logic · **Low**

**Evidence:** `src/templates/_poem-content.pug:5-10` defines its own
`slugify(text)`, duplicating `src/tools/slugify.js:13-18` byte-for-byte; the
same template embeds `postscriptPreviewSettings()` (lines 15-20) and
`processAnalysisText()` (lines 23-33) as inline Pug JS rather than shared,
independently-testable helpers.

**Impact:** Pug can't `require()` a CommonJS module directly, so some
duplication is close to unavoidable — but a future change to `slugify()`'s
character class, or to preview-lines defaulting, has to be remembered and
hand-applied in two places with no test asserting they stay in sync.

**Direction:** move `postscriptPreviewSettings`/`processAnalysisText` into
`render-core.js` and pass the computed values as Pug locals. Addressed by
R-06.

### F-ARCH-02 — `build-all-poems.js`'s two aggregate builders independently re-derive overlapping poem metadata · **Low**

**Evidence:** `concatenateAllHtmlFiles()` (`src/tools/build-all-poems.js:64-143`)
and `generateIndexHtml()` (`:250-407`) each loop over every poem's YAML and
independently extract overlapping metadata into two different shapes,
duplicating logic that `aggregate-render-core.js`'s `summarizePoem()`
already factors out for the browser renderer (`src/browser/render-aggregate.js:44-49`).

**Impact:** the Node build path re-implements what the browser path already
shares — the Node side of an otherwise well-tested seam is the one place
this duplication survives.

**Direction:** call `summarizePoem()` from both builders instead of hand-rolled
extraction. Addressed by R-05.

## Code quality and maintainability (CODE)

**Strengths:** thorough rationale comments on every non-obvious regex/algorithm
choice, frequently citing the specific CodeQL rule that motivated a
hand-written scanner over a "natural" regex; zero TODO/FIXME/HACK/XXX markers
anywhere in `src/` or `scripts/`; every bare/short `catch` block is
accompanied by a comment explaining why swallowing is correct there;
consistent JSDoc `@param`/`@returns` discipline substituting for a static
type checker.

### F-CODE-01 — Label-line detection duplicated five times in `poem-parser.js` · **Medium**

**Evidence:** the pattern
`line.trim().startsWith('{') && line.trim().includes('}') && !line.trim().startsWith('{{')`
(or its variant without the `{{` exclusion) appears at `poem-parser.js:877`,
`:914`, `:1266`, `:1404`, `:1416`; the companion
`label !== 'Synopsis' && label !== 'Full'` reserved-name check is duplicated
inline at `:879` and `:1268`.

**Impact:** this is the file's single largest source of copy-paste risk — a
future syntax change (a third reserved label name, a tweak to what counts as
a label line) requires remembering to touch 4-5 call sites in a 1,582-line
file; missing one silently misparses only some sections.

**Direction:** extract `isLabelLine(line)` and a `RESERVED_LABELS` set as
shared helpers used at all five sites. Addressed by R-03.

### F-CODE-02 — Cross-module error-message coupling via bare string literals · **Low**

**Evidence:** `src/browser/render-errors.js:25-29`'s `KNOWN_MESSAGES` maps
the exact strings `'Missing title'`, `'Missing date'`, `'Invalid or missing
date'` to error codes; those strings are independently authored as
thrown-error text in `poem-parser.js:739,749,769`, with nothing enforcing
they stay in sync.

**Impact:** a future wording tweak to one of those three `throw new
Error(...)` messages silently degrades that error's classification in the
browser renderer to a generic code, with no test failure to catch it.

**Direction:** export the three strings as named constants shared between
both files. Addressed by R-07.

### F-CODE-03 — Legacy-format migration logic accreting inside `build-all-poems.js`'s main build path · **Low**

**Evidence:** `src/tools/build-all-poems.js:161-230` (a hand-rolled
balanced-tag scanner plus `<header>`/`<main>` landmark self-heal branches)
sits alongside `generateIndexHtml()`'s own separate self-heal branches for a
pre-migration `<script>` block (`:373-388`) and CSS/JS link injection
(`:346-360`) — at least three independent "detect the old on-disk shape,
patch it forward" migrations in one ~160-line function.

**Impact:** proportionate to the real problem (consumer repos that
`git`-track `index.html` as more than a pure build artefact) and well
commented, but this is the part of the file most likely to keep accreting a
fourth or fifth branch, and it's exactly the kind of orchestration code
that's hard to unit-test in isolation.

**Direction:** no urgent change needed; if a fourth self-heal branch is ever
added, consider extracting a `migrations: [{detect, apply}]` list. Not
addressed by a dedicated recommendation — a watch item, not current debt.

## Security (SEC)

**Strengths:** a full working-tree and `git log -p --all` credential search
found no live secrets, only clearly-labelled fixture values; `blogger-auth.js`
implements a textbook RFC 8252 OAuth loopback flow (CSRF state checked on
every callback branch including the error branch, S256 PKCE, loopback bound
to `127.0.0.1` only); credentials are written atomically at mode 0600 via a
symlink-safe temp-file-then-rename; every outbound `fetch()` in both
Blogger-facing files carries a consistent 30-second timeout;
`path-guard.js`'s containment check does lexical *and* `realpathSync`-based
symlink-escape resolution, applied consistently everywhere a config-driven
or request path is used; Pug's one unescaped interpolation
(`!{titleHtml}`) is escape-first by construction, not raw passthrough;
`markdown-it`'s `html: true` setting is an explicit, documented trust
decision appropriate for single-author content; `SECURITY.md` is current and
candid about the single-maintainer reality.

No findings. This surface (OAuth flow, credential storage, path traversal,
template escaping) was independently re-verified against the current code —
not merely carried forward from the three prior review cycles that also
found it sound — including confirming that fixes noted in past reviews (the
30-second fetch timeout, the masked client-secret prompt, the CSRF-on-error-path
fix) are still present and correct.

## Testing and quality assurance (TEST)

**Strengths:** golden/fixture tests embed their own regeneration command in
the failure message; `sync-blogger.test.js` mocks `fetch` end-to-end with no
real network calls; `tech-debt-scripts.test.js` includes a genuine
concurrency test (6 clones racing to reserve an ID, asserting no collision);
every ephemeral-port-based test uses `server.listen(0, ...)`, never a
hardcoded port; a flakiness pattern flagged in the 2026-08-08 review
(non-backdated mtime baselines) is now fixed everywhere it previously
appeared; low coverage on `a11y-check.js` and parts of `blogger-auth.js` is a
deliberately documented scope boundary (the puppeteer-driven browser run
needs a real Chrome install, verified instead by a non-blocking CI step), not
neglect.

### F-TEST-01 — `blogger-auth.js`'s interactive `main()` remains untested · **Low**

**Evidence:** `src/tools/blogger-auth.js:420-603` is entirely outside the
63.7%-covered lines per `c8 report` (uncovered ranges include `554-568,
572-597, 602-603`). Also flagged, and still open, in the 2026-08-08 review
(F-TEST-02 there).

**Impact:** low — a one-off, manually-invoked interactive setup tool never
run from CI; genuinely hard to unit test (real readline stdin + real OAuth
round trip).

**Direction:** extract the pure request-shaping pieces the way
`buildConsentUrl` already is. Addressed by R-12.

### F-TEST-02 — Warning/logging branches uncovered in `poetic-config.js` and `build-all-poems.js` · **Low**

**Evidence:** `c8 report` shows `poetic-config.js` uncovered at lines 51-56
and 64-68; `build-all-poems.js` uncovered at 492-530 and 538-584 — all
`.poetic-config.yaml`-driven console.log/warning branches.

**Impact:** low — informational output paths, not logic with behavioural
consequences.

**Direction:** a couple of targeted tests asserting the warning text
appears. Addressed by R-12.

### F-TEST-03 — `poem-templates.js`'s 50.34% coverage reflects a generated file, not neglect · **Informational**

**Evidence:** `AGENTS.md` states this file is generated via `npm run
build:generated` from the Pug template; its low coverage is branches in
generated template-rendering permutations, exercised via higher-level render
tests rather than directly.

**Impact:** none — flagging only so a future reviewer doesn't re-investigate
this as if it were new. Not addressed by a dedicated recommendation.

## Dependencies and supply chain (DEPS)

**Strengths:** exactly four direct production dependencies, all reputable
and actively maintained; `package-lock.json` committed, `npm ci`/`npm audit`
both clean; Dependabot configured for both npm and GitHub Actions ecosystems
and demonstrably active (a steady stream of merged version-bump PRs); Node
≥22 floor enforced at install time via `engine-strict=true`, not merely
documented; `scripts/check-licenses.js` is a soundly designed, fail-closed
license checker with a documented rationale for not using an off-the-shelf
scanner.

No findings. The dependency surface is minimal, current, reproducibly
locked, and actively kept up to date.

## Tooling and developer experience (TOOL)

**Strengths:** the README "Quick start" path is coherent and matches
`package.json`'s actual scripts exactly, verified command-by-command;
`scripts/setup-linux.sh` is documented where a newcomer would find it;
`.editorconfig` documents its own deliberate exceptions
(`trim_trailing_whitespace = false` for `.poem`/`.md`, cross-referenced
against `remove-trailing-spaces.sh`); Vim integration is documented in two
tiers for different audiences; a previously-flagged README gap (no mention
of local pre-push checks) is now resolved.

### F-TOOL-01 — No CI/coverage status badge beyond `build` · **Low**

**Evidence:** `README.md:3` shows only a single `build-poems.yml` badge; no
badge for `commit-format`, CodeQL, or the coverage percentage, even though
coverage is CI-enforced.

**Impact:** low — a visibility/first-impression nicety; already noted as Low
in the prior review with no material change expected.

**Direction:** add badges for `commit-format` and CodeQL. Addressed by R-13.

### F-TOOL-02 — No `.vscode/` recommended-extensions file or devcontainer · **Informational**

**Evidence:** none found under the repo root.

**Impact:** none functionally — the project's tooling surface (ESLint,
`.editorconfig`) is already editor-agnostic. Not addressed by a dedicated
recommendation.

## CI/CD and release engineering (CI)

**Strengths:** every GitHub-required status check maps one-to-one onto a
real job, with nothing required-but-orphaned; `sync-blogger.yml` and
`sync-framework.yml` are correctly *not* required (optional consumer-facing
automation); release engineering matches `AGENTS.md`'s documented process
exactly, verified line-by-line against `release.yml`; a real recent CI run
completed in ~40 seconds; no workflow uses `pull_request_target`, and no
third-party (non-`actions/*`, non-`github/*`) Action is used anywhere; a
previously-flagged missing release-rollback doc is now resolved
(`docs/BUILD.md:592-612`).

### F-CI-01 — GitHub Actions pinned by floating tag, not commit SHA · **Low**

**Evidence:** `build-poems.yml:144` (`actions/setup-node@v7`), `:76`
(`actions/checkout@v7`), `codeql.yml:48,54`
(`github/codeql-action/init@v4.38.0`), plus `configure-pages@v6`,
`upload-pages-artifact@v5`, `deploy-pages@v5`. All actions used are
first-party.

**Impact:** low in this repo's context — no third-party-action exposure
exists to pin against; a compromised first-party Action would be a
GitHub-ecosystem-wide event, not something this repo's own mitigation would
meaningfully change.

**Direction:** optional defense-in-depth; not currently addressed by a
dedicated recommendation given the low payoff relative to effort.

### F-CI-02 — No `cache: npm` on `actions/setup-node` steps · **Informational**

**Evidence:** `build-poems.yml:142-146`, `sync-blogger.yml:60-63`.

**Impact:** none currently measurable — `npm ci` completes in ~2 seconds
against this repo's small dependency tree. Not addressed by a dedicated
recommendation.

## Performance and scalability (PERF)

**Strengths:** a real incremental-build cache (`needs-rebuild.js`) with a
cheap manifest-based pre-check that correctly detects poem additions/removals
before falling back to a full `$ref`-graph walk; a shared YAML parse cache
across both aggregate-page generators; no quadratic hot spots in the
parser/converter, and hot regexes already hardened against pathological
backtracking with comments citing the specific CodeQL rule; static file
serving streams rather than buffers.

### F-PERF-01 — Dev server's `/all-poems` endpoint has no caching · **Low**

**Evidence:** `serve-static.js`'s `/all-poems` route (lines 240-266) calls
`concatenateAllHtmlFiles()` fresh on every request, bypassing the
incremental-build machinery entirely.

**Impact:** negligible at this repo's own scale (one poem); for a consumer
repo with hundreds of poems, each manual click would re-render everything.

**Direction:** not urgent; a simple mtime-gated in-memory cache would fix it
if it ever becomes annoying. Not currently addressed by a dedicated
recommendation.

### F-PERF-02 — Full (non-incremental) build is sequential with no parallelism · **Low**

**Evidence:** `buildAllPoems()` (`build-poems.js:91-197`) and
`convertAllPoemsToYaml()` (`poem-to-yaml.js:79-112`) both loop synchronously
over every poem file, one at a time.

**Impact:** immaterial today; only matters at a scale (hundreds of poems,
from-scratch build) this framework repo's own dev corpus doesn't exercise.

**Direction:** not worth acting on unless a real consumer repo reports slow
CI builds. Not currently addressed by a dedicated recommendation.

### F-PERF-03 — No documented performance expectations or benchmarks · **Informational**

**Evidence:** no stated build-time expectations exist in `docs/` or
`README.md`.

**Impact:** only a gap if/when a consumer repo scales significantly; the
incremental-cache design already mitigates the underlying risk. Not
addressed by a dedicated recommendation.

## Usability and accessibility (UX)

**Strengths:** `--help`/`-h` is present and consistent across essentially
every CLI entry point via a shared helper; generated HTML has sound semantic
structure (`<nav>`/`<main>` landmarks, a sane single-`<h1>`-per-page
heading hierarchy, with older hand-tracked `index.html` files self-healed
forward); show/hide widgets use real ARIA state, not just CSS classes;
embedded iframes get a `title` attribute and lazy loading; `a11y-check.js`
is honest about its own limits and fails safe (exits 0 with a clear message
when no Chrome is available, wired non-blocking in CI against a tracked
tech-debt item).

**Scope limitation:** automated axe-core accessibility checking could not be
run in this review's sandbox (no headless Chrome available). Accessibility
was instead assessed by reading the checker's own logic and the generated
templates/CSS by hand; the colour-contrast finding below is explicitly
flagged as needing verification with a real tool, not asserted as a
confirmed failure.

### F-UX-01 — Poem parse errors carry no line number, and sometimes no filename · **Medium**

**Evidence:** `poem-parser.js` throws bare, context-free messages —
`'Missing title'` (line 739), `'Missing date'` (749, 765), `'Invalid or
missing date'` (769) — with no line number or excerpt. Only the batch CLI
path (`poem-to-yaml.js:107-109`) attaches a filename; a single-file
`poem-to-yaml.js <file>` invocation has no such wrapper.

**Impact:** a poem author debugging a malformed `.poem` file has no
indication of where to look, especially for "Missing date," which can be
several lines past preamble directives/variables in a longer poem.

**Direction:** thread a line number through `PoemParser` (it already tracks
`this.index`) into these three throw sites, and prefix the single-file CLI
path with the filename the way the batch path does. Addressed by R-02.

### F-UX-02 — Secondary-text colour sits right at the WCAG AA threshold (needs verification) · **Low**

**Evidence:** `#707070` (secondary/meta text, `public/poetic.css:28,82,478,533,551,563`)
against page background `#f5f5f5` (`:33`) computes to ~4.53:1 by the WCAG
relative-luminance formula — just over the 4.5:1 AA minimum, close enough
that browser rendering differences could tip it either way.

**Impact:** low — borderline pass, not a clear failure; primary poem-body
text (`#333`/`#444`) comfortably passes at ~12:1. Could not be confirmed
with a real contrast tool in this review's sandbox.

**Direction:** verify with a real contrast checker once a browser is
available; darken to `#666` (already used elsewhere, ~5.75:1) if it fails.
Addressed by R-09.

### F-UX-03 — `a11y-check.js` samples only one poem page, not every template variant · **Low**

**Evidence:** `discoverCheckTargets()` (`a11y-check.js:36-58`) checks
`index.html` plus only the alphabetically-first poem directory;
`all-poems.html` (a separate template path) is never checked, and only one
poem's section combination gets scanned.

**Impact:** a poem-specific a11y regression in an untested section type
(e.g. the audio/song-embed markup, or the analysis synopsis/full selector)
could pass CI indefinitely if the sampled poem doesn't exercise it.

**Direction:** add `all-poems.html` and/or pick a poem exercising
audio+postscript+analysis together as the sampled page. Addressed by R-08.

### F-UX-04 — `poem-to-yaml.js`'s `--help` output is thinner than its sibling tools · **Informational**

**Evidence:** `poem-to-yaml.js:144-146` gives a two-line usage with no
`Options:` block, unlike `build-poems.js`/`serve-static.js`.

**Impact:** purely cosmetic inconsistency. Addressed alongside R-11 as a
related CLI-consistency cleanup.

## Documentation (DOC)

**Strengths:** README.md is accurate and thorough, with every demonstrated
command verified to match real scripts; the tech-debt documentation
migration (issues-based filing, frozen `tech-debt/` archive) is cleanly
finished, not half-done; the "no historical phrasing outside CHANGELOG.md"
house rule is genuinely followed across `README.md` and `docs/*.md`;
`SECURITY.md` and `AGENTS.md` are consistent with each other on the
single-maintainer disclosure; inline documentation is well-targeted where
the code is genuinely non-obvious (e.g. `path-guard.js`'s containment
rationale).

### F-DOC-01 — `docs/YAML-SCHEMA.md` omits the `parts` mixed-segment field · **Medium**

**Evidence:** `poem-parser.js:892-950` emits `segment.parts = [{type: 'lines',
lines}, {type: 'html', html}, ...]` whenever a stanza mixes plain lines with
an embedded `<<<...>>>` block (confirmed by actually running
`node src/tools/poem-to-yaml.js src/poems/poem/_example.poem`).
`docs/POEM-SYNTAX.md` documents the source syntax thoroughly, but
`docs/YAML-SCHEMA.md` (188 lines) never mentions `parts` — every example
shows only `lines:`.

**Impact:** anyone consuming the YAML schema directly (a third-party
renderer, or hand-editing YAML) has no documented shape for the mixed-content
case and will be surprised by an undocumented field.

**Direction:** add a "Mixed segments (`parts`)" subsection to
`docs/YAML-SCHEMA.md`. Addressed by R-01.

### F-DOC-02 — `docs/BUILD.md` Quick Start double-counts `npm run poem-to-raw` · **Low**

**Evidence:** `docs/BUILD.md` lines 10-26 present a "step 2.5" running
`npm run poem-to-raw` as a further manual step, but line 74 (and
`package.json`'s `build` script) confirm it already runs automatically as
the first step of `npm run build`.

**Impact:** minor reader confusion; the "2.5" numbering also breaks
Markdown's ordered-list auto-numbering in most renderers.

**Direction:** drop the redundant step or fold it into a note that it's
optional/standalone-only. Addressed by R-04.

### F-DOC-03 — README's documentation index omits two existing docs · **Low**

**Evidence:** README.md lines 332-343 list nine docs but omit
`docs/BLOGGER.md` (linked elsewhere in the file, just not indexed) and
`docs/VIM-SYNTAX-EMBEDDED-LANGUAGES.md`.

**Impact:** cosmetic — a reader scanning only the index would miss Blogger
publishing docs.

**Direction:** add both to the list. Addressed by R-04.

## Governance and project health (GOV)

**Strengths:** issue/PR triage is healthy (one open issue, legitimately
blocked on an owner-only ruleset edit; three routine Dependabot PRs; no stale
backlog); `LICENCE-POEMS.md` gives a clear, well-explained split between code
licence (MIT) and poem-content licence (CC BY-NC-ND 4.0 default); the
single-maintainer/self-review/no-succession disclosure is consistent and
undiluted across `SECURITY.md` and `AGENTS.md`; direction/roadmap is tracked
fleet-wide in a sibling repository rather than duplicated locally, which is
a reasonable design for a repo that is one node in a multi-repo fleet.

### F-GOV-01 — No `CONTRIBUTING.md`, though substantially covered elsewhere · **Low**

**Evidence:** confirmed absent at repo root and `.github/`; README.md's
"Contributing" section (lines 345-390) covers PR etiquette, branch
protection, Conventional Commits, and exact local-dev pre-push commands —
materially more complete than many repos' CONTRIBUTING.md. No issue
templates exist either.

**Impact:** a human newcomer reading README.md is not lost, but there's no
canonically-named file GitHub surfaces specially, and no issue template to
guide a first bug report.

**Direction:** a thin `CONTRIBUTING.md` pointing to README's existing
section. Addressed by R-10.

### F-GOV-02 — No `CODE_OF_CONDUCT.md` · **Informational**

**Evidence:** confirmed absent.

**Impact:** negligible for a single-maintainer technical framework with no
observed external contributor friction. Not addressed by a dedicated
recommendation.

## Observability and operations (OPS)

**Strengths:** a 30-second fetch timeout applied to every outbound network
call in both Blogger-facing files, without exception; a thoughtful,
idempotency-aware retry policy (`createPost` deliberately excluded from
retry to avoid duplicate posts on a lost response); no credential ever
reaches a log a third party could read; failure diagnosis
(`explainBloggerFailure()`) turns anonymous API errors into actionable
remediation without leaking secrets; deploy workflows have real concurrency
safety beyond boilerplate (a deliberately-not-cancelled `main` deploy queue,
plus a separate global Pages concurrency group); a documented rollback/yank
procedure for a bad release.

### F-OPS-01 — `blogger-auth.js`'s `--help` handling duplicates rather than reuses `cli-help.js` · **Low**

**Evidence:** every other CLI tool imports `isHelpRequested()`;
`blogger-auth.js` hand-rolls the same check itself (lines 94-108, 423).

**Impact:** purely a consistency/DRY nit — identical end-user behaviour
today, but could drift if `cli-help.js`'s recognised flags change.

**Direction:** route through the shared helper. Addressed by R-11.

### F-OPS-02 — No automated failure notification beyond GitHub's default UI/email · **Informational**

**Evidence:** neither `build-poems.yml` nor `sync-blogger.yml` configures an
explicit failure-notification step.

**Impact:** appropriate for a solo-maintainer project — GitHub's default
notification is what a single maintainer would see anyway. Not addressed by
a dedicated recommendation.

### F-OPS-03 — `serve-static.js` has no per-request access logging · **Informational**

**Evidence:** the request handler never logs method/path/status per
request.

**Impact:** negligible — a local-loopback dev convenience server, not an
operated service. Not addressed by a dedicated recommendation.

## Data handling and privacy (DATA)

**Strengths:** no user accounts or multi-tenant data model; the only
personal/sensitive-data-adjacent surface (Blogger OAuth credentials) is
handled with atomic 0600 writes, gitignored, never logged; targeted scans of
`src/poems/`, `examples/`, and `test/fixtures/` found no real personal data
committed by accident, only clearly-labelled fixture placeholders;
`docs/BLOGGER.md` documents a real retention/deletion pathway for published
content.

No findings. This is a genuinely thin dimension for this project, verified
by direct scanning rather than assumed inapplicable.
