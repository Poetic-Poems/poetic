# Findings

Findings below are organised by dimension, in the review checklist's own order. Each carries a
stable ID (`F-<CODE>-<NN>`), a severity, cited evidence, and its impact for this project
specifically. Cross-references to the recommendation that addresses each finding are in
`03-recommendations.md`'s "Addresses" columns rather than repeated per finding here.

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 4 |
| Medium | 9 |
| Low | 33 |
| **Total** | **47** |

## Architecture and design (ARCH)

**Strengths:** The codebase has a genuinely clean, consistently-followed layering: a filesystem-free "core" (`poem-parser.js`, `render-core.js`, `aggregate-render-core.js`, `song-handlers.js`, `slugify.js`, `date-utils.js`) is required, unmodified, by both the Node CLI build path (`poem-render.js`, `build-poems.js`, `build-all-poems.js`) and the browser bundle (`src/browser/render.js`, `render-aggregate.js`); a dependency scan of every `require()` in `src/tools/` and `src/browser/` turned up no cycles. The fs-free contract is not just a comment: `test/browser-render.test.js` asserts (a) no module reachable from `src/browser/render.js` touches `fs`/`path`/`__dirname`, and (b) byte-for-byte parity between the browser renderer and the Node build path across the whole poem corpus, and `test/poem-templates.test.js` / `test/song-handlers-data.test.js` assert the two generated files stay byte-identical to what their generators would produce. That is exactly the end-to-end, round-trip seam test the review checklist asks for: the browser/Node duplication this project deliberately carries (two runtimes, one template source) is verified rather than assumed. Secrets handling (Blogger OAuth credentials) is also architecturally sound: gitignored, written with mode 0600 via an atomic temp-file-then-rename, with env vars taking precedence over the file.

### F-ARCH-01 — `yaml-to-poem.js` silently drops data the current YAML shape can hold · **Medium**

**Evidence:** `src/tools/yaml-to-poem.js` (`YamlToPoemConverter`) is the documented "reverse conversion of poem-to-yaml.js" (file header, lines 3-4) but has not kept pace with `poem-parser.js`'s current output shape:
- `writeAudio()` (lines 195-215) only handles `audio[service] === true` or a plain string value; it silently drops any entry in the object form `{ value, media?, ratio?, height? }` that `poem-parser.js`'s `parseAudio()`/`parseAudioParams()` (lines 1149-1307) produce whenever an audio line carries a trailing param list (e.g. `Mega: id#key (video, ratio=21:9)`). No warning or error — the service line simply never reappears in the regenerated `.poem` file.
- `writeVersions()` (lines 136-190) only emits `segment.lines`; it has no handling for `segment.parts` (produced at `poem-parser.js` lines 1009-1067), the shape used whenever a segment mixes WYSIWYG poem lines with an embedded `<<< ... >>>` block. Such a segment's raw/markdown block content is silently dropped on conversion back to `.poem`.
- Neither `version.params`/`segment.params` (populated by `parseLabelWithParams()`) nor the top-level `labels`/`directives` keys (populated by `parseMetadata()`/`extractPreambleDirectives()`) are written anywhere in the file — confirmed by `grep -n "labels\|directives" src/tools/yaml-to-poem.js` returning no matches at all. A poem's entire bottom `====`-delimited Metadata section (labels and directives) is silently lost on a YAML→`.poem` round trip.
- This is untested at the level that would catch it: `test/yaml-to-poem.test.js` (11 tests) and `test/strikethrough.test.js` exercise only entity decoding and `<s>`→`~~` conversion; no test feeds a poem with params, mixed `parts`, object-form audio, or labels/directives through `poem-to-yaml.js` → `yaml-to-poem.js` and checks the result.
- `yaml-to-poem.js` has no `npm run` script entry and no `docs/BUILD.md`/`docs/POEM-TO-YAML.md` coverage — it is a standalone, manually-invoked dev tool, not on the automated build/CI path.

**Impact:** This is exactly the "read both sides of a shared-format seam and check they agree" gap the review checklist calls out. It is not the business-critical `.poem`→HTML path (which is tested end-to-end) but the seldom-run reverse tool — yet a poem author who does reach for it (e.g. to hand-edit YAML and regenerate `.poem` source) will silently lose labels, directives, per-segment blocks, and sized/typed audio embeds with no error at all.

**Direction:** Bring `yaml-to-poem.js` back in line with `poem-parser.js`'s current output shape (`segment.parts`, `params`, `labels`, `directives`, object-form audio), or have it explicitly warn/fail on any YAML feature it can't serialise. A round-trip test (`.poem`→YAML→`.poem`→YAML, asserting the two YAML documents match) over the poem corpus, mirroring `test/browser-render.test.js`'s approach for the other seam, would catch this and prevent recurrence.

### F-ARCH-02 — Config validation is inconsistent at its one schema boundary · **Low**

**Evidence:** `poetic-config.js`'s `readPoeticConfig()` only warns on one specific case (`blogger.blog_id` parsed as a YAML number, lines 63-68); every other key is read with no shape/enum checking. `sync-blogger.js`'s `resolveConfig()` (lines 82-123) validates `blogger.removed`/`blogger.content` against `VALID_REMOVED`/`VALID_CONTENT` allow-lists, but an invalid value (e.g. a typo like `removed: "draf"`) is silently coerced to the default with no warning — indistinguishable, from the log output, from having left the key unset entirely.

**Impact:** Low blast radius (opt-in Blogger sync, its own config surface), but a silent fallback on a typo'd enum leaves a publisher wondering why an option isn't taking effect, with no diagnostic to point at.

**Direction:** Warn (matching the existing `blog_id` precedent) whenever an enum-like config key is present but doesn't match its allow-list.

## Code quality and maintainability (CODE)

**Strengths:** Error handling is careful and consistent throughout — every `catch` reviewed either logs via `console.error`/`console.warn` with an actionable message or is an explicitly-documented best-effort fallback (e.g. `sync-blogger.js`'s `extractContent()`, `listAccessibleBlogs()`). There are zero TODO/FIXME/HACK/XXX markers anywhere in `src/`/`scripts/` — self-reported debt is tracked in `TECH-DEBT.md` per the project's own convention instead of left in code comments, and that convention is followed in practice. The security-fix wave (ReDoS, prototype pollution, double-escaping) is reflected in unusually careful, well-commented hand-rolled scanners in `poem-parser.js` (e.g. `parseDirectiveLine`, `matchLabelLine`, `joinContinuedLines`) that explicitly explain *why* a regex was rejected in favour of manual scanning — a rare and valuable practice.

### F-CODE-01 — `poem-parser.js` is a 1854-line monolith covering the whole grammar · **Medium**

**Evidence:** `src/tools/poem-parser.js` is a single 1854-line file containing one `PoemParser` class with roughly 50 methods that together implement the entire `.poem` grammar: comment stripping, line-continuation folding, variable definition/substitution, header/version/segment parsing, audio-line parsing, postscript/analysis parsing, metadata (labels/directives) parsing, and inline-markup-to-HTML conversion, all as private methods on one object sharing `this.lines`/`this.index`/`this.result`/`this.variables` state.

**Impact:** Individual methods are well-isolated and thoroughly documented (this is not a tangled god-object in the classic sense), but the file's breadth means almost any new `.poem` syntax feature touches this one class, and its size (more than 3x the next-largest hand-written tool file) makes it the single highest-effort file to onboard onto or safely extend. It is a legitimate complexity hot-spot by the checklist's own framing — closer to "discrete-but-monolithic" than either extreme.

**Direction:** Consider splitting by grammar section (e.g. a variable-substitution mixin/module, a markup-conversion module) now that `render-core.js`/`aggregate-render-core.js` already establish the pattern of extracting shared pure logic into its own file.

### F-CODE-02 — No formatter configured; quote style drifts by file · **Low**

**Evidence:** No formatter is configured (`package.json` devDependencies are only `@eslint/js` and `eslint`; no `prettier`). `eslint.config.js` extends only `js.configs.recommended` plus a few relaxations (`eqeqeq: smart`, `no-console: off`, `no-constant-condition` ignoring loops, a `no-unused-vars` underscore-prefix allowance) — no `quotes`, `max-lines`, `max-lines-per-function`, or `complexity` rule. Concretely, string-quote style drifts by file rather than being enforced: `build-poems.js`, `build-all-poems.js`, `build-blogger.js`, and `serve-static.js` consistently use double-quoted strings throughout, while the rest of `src/tools/` (`poem-parser.js`, `poem-render.js`, `song-handlers.js`, etc.) consistently use single quotes. Each file is internally consistent, but the codebase as a whole is not.

**Impact:** Cosmetic only — doesn't affect behaviour — but it's a concrete, verifiable instance of the checklist's "does style drift by author/file" question, and ESLint as configured would not catch it if it got worse.

**Direction:** Add a `quotes` rule (or adopt Prettier) if visual consistency across `src/tools/` is desired; otherwise this is fine to leave given the project's stated philosophy of relaxed linting to match existing style.

### F-CODE-03 — Escape-placeholder mechanism duplicated between two files · **Low**

**Evidence:** The identical escape-placeholder technique (`` const placeholder = `\x00ESCAPE${escapeIndex++}\x00`; ``, then a restore pass matching `/\x00ESCAPE\d+\x00/g`) is implemented twice independently: in `poem-parser.js`'s `convertMarkup()` (lines 1786-1792, 1842-1843) and in `render-core.js`'s `renderTitleMarkup()` (lines 113-119, 131-132). The two are explicitly cross-referenced in comments ("same order... so nesting degrades identically as body text (§11 Q3)"), showing the authors know these must stay in lockstep, but the implementation itself is copy-pasted rather than shared.

**Impact:** A future bug fix to the escaping mechanism (e.g. a new escape character, or a subtle placeholder-collision fix) has to be applied in both places by hand; the explicit cross-referencing comment is the only thing currently preventing silent divergence.

**Direction:** Extract the placeholder-protect/restore helper into a small shared utility (e.g. a new function in `render-core.js` that both call), parameterised by the escape character set.

### F-CODE-04 — `js-beautify` options object copy-pasted three times · **Low**

**Evidence:** The exact same `js-beautify` options object (`{ indent_size: 2, wrap_line_length: 80, preserve_newlines: false, max_preserve_newlines: 1, wrap_attributes: "auto" }`) is copy-pasted three times: once in `build-poems.js` (lines 176-181) and twice in `build-all-poems.js` (lines 389-394 and 409-414).

**Impact:** Minor but real duplication risk — a future formatting-behaviour change (e.g. adjusting `wrap_line_length`) requires remembering to update all three call sites; missing one would make one output format's whitespace silently diverge from the other two.

**Direction:** Extract a shared `BEAUTIFY_OPTIONS` constant, e.g. alongside the other framework-wide constants in `repo-root.js` or a small new shared module.

### F-CODE-05 — JSDoc discipline is inconsistent, weakest in the highest-complexity file · **Low**

**Evidence:** JSDoc (`@param`/`@returns`) discipline is inconsistent across the codebase's history. Newer/security-hardened modules are thoroughly tagged: `sync-blogger.js` (919 lines) has 70 `@param`/`@returns` tags, `needs-rebuild.js` (175 lines) has 17. By contrast `poem-parser.js` (1854 lines, ~50 methods) has only 5, relying on prose doc-comments without `@param`/`@returns` tags for the great majority of its methods.

**Impact:** Since JS has no static types, JSDoc is this project's only mechanism for documenting a function's expected shapes; its inconsistent application means the highest-complexity, highest-traffic file (the parser) is comparatively the least machine/IDE-checkable one (no `@param {string}` etc. for editor tooling or a future `checkJs` pass to catch misuse).

**Direction:** When next touching `poem-parser.js` methods, bring their doc comments up to the `@param`/`@returns` standard already established elsewhere in the codebase (no rush — this is polish, not a defect).

## Security (SEC)

**Strengths:** This project has invested real, sustained effort in security since the 2026-07-11 review: CodeQL runs on every PR/push to `main` plus a weekly schedule, scanning both `javascript-typescript` and the workflow YAML itself (`actions` language), with `security-events: write` scoped only to the analyze job. Every CodeQL alert surfaced in that window was fixed with a real, root-cause change (not a suppression) plus a regression test — spot-checked in this pass: the three `poem-parser.js` ReDoS alerts (`a4dc37d`/`4ce4d40`/`91ad8ec`) replaced backtracking regexes with linear hand-written scans and added adversarial-input regression tests asserting sub-2s completion (confirmed the vulnerable patterns are gone from the current file, present only in explanatory comments); the DOM XSS fix in `public/index.js` walks `titleHtml` token-by-token building DOM nodes directly rather than using `innerHTML`, with a defense-in-depth `safePoemHref()` allowlist even though the input is already slug-constrained; `song-handlers.js`'s `deepMerge`/`loadSongHandlers` explicitly reject `__proto__`/`constructor`/`prototype` keys by direct equality (CodeQL-recognisable form, per #48's own commit message); `yaml-to-poem.js`'s entity decoding is a genuine single left-to-right pass immune to re-decoding order bugs; `blogger-auth.js` implements OAuth `state` (CSRF) + S256 PKCE, redacts credentials from its own console summary, and writes the credentials file via a temp-file-then-atomic-rename with mode 0600 (handles a pre-existing read-only file without following symlinks, `wx` flag); `serve-static.js`/`path-guard.js` bind to loopback by default and use a dedicated, unit-tested containment check (`root + path.sep`) that closes the sibling-directory (`publicX` vs `public`) bypass. `SECURITY.md` exists with a private GitHub-advisory reporting route. `npm audit` (both `--omit=dev` and full) came back clean (`found 0 vulnerabilities`, both commands). No secrets were found in the working tree or in a full `git log --all -p` scan for common credential patterns.

### F-SEC-01 — Dev server sets a wildcard CORS header on every response · **Low**

**Evidence:** `src/tools/serve-static.js` lines 230-239, 258-265, 277-284, 302-304 — every response from the dev server (index passthrough, directory listing, `/all-poems`, and ordinary static files) sets `"Access-Control-Allow-Origin": "*"` unconditionally.

**Impact:** The server defaults to loopback binding (line 49, `HOST = cliHost || process.env.HOST || "127.0.0.1"`), so this is inert unless a developer opts into `--host 0.0.0.0` for LAN testing, at which point any other origin on that network can read the served (public, non-secret) poem HTML cross-origin via fetch. Dev-only static-file server, no auth/cookies/write endpoints — bounded harm, hence Low.

**Direction:** Scope CORS to the loopback origin (or drop the header) when `HOST` is left at its loopback default, only adding the wildcard when `--host 0.0.0.0` is explicitly passed.

### F-SEC-02 — Config-sourced `new RegExp()` has no ReDoS/timeout guard · **Low**

**Evidence:** `src/tools/song-handlers.js` `applyValuePatterns()` (line 200): `re = new RegExp(entry.match)` builds a regex at runtime from `song_handlers.<name>.value_patterns[].match`, a string sourced from the consumer's own `.poetic-config.yaml`.

**Impact:** A malformed/adversarial `value_patterns` regex run against an author-supplied audio-line value could hang the build. Self-inflicted only — the config is authored by the same person who owns the build, not an external party — so it's below the bar that made the `poem-parser.js` ReDoS alerts genuine findings (those trigger on poem *content*, the actual trust boundary). The existing `try/catch` around `new RegExp()` already prevents a malformed pattern from crashing the build, just not from hanging it.

**Direction:** If this ever becomes reachable from a less-trusted config source, consider a regex-safety check or timeout; no action needed under the current trust model.

No Critical or High findings. No secrets found (scanned working tree and full git history for AKIA keys, PEM private-key headers, and literal API-key/password/secret/token assignments — only test fixtures with fake values matched). No newly-introduced injection, auth/session, cryptography, or dependency issues were identified beyond the two Low items above. The prior security-fix wave (XSS ×2, ReDoS ×4, prototype pollution ×2, sanitization ×2, double-escaping ×2, credential redaction, OAuth/localhost hardening, atomic credentials-file write) was spot-checked against current code and git history (commit messages + diffs) and confirmed genuinely resolved, not merely marked so in `TECH-DEBT.md`.

## Testing and QA (TEST)

**Strengths:** The suite is overwhelmingly unit/functional tests over pure, dependency-injected helpers (temp dirs, injected `poemsDir`/`publicDir`, rewritten git remotes), so it is fast (~5.5-6s for 493 tests, confirmed by re-running `npm test`) and hermetic — no real network calls, no reliance on developer machine state, and shared mutable fixtures are consistently avoided via `fs.mkdtempSync` + `t.after()` cleanup (e.g. `test/build-poems.test.js`, `test/build-all-poems.test.js`, `test/tech-debt-scripts.test.js` builds a throwaway git repo per test). Most notably, every one of the recent CodeQL-flagged security fixes (ReDoS in three regexes, prototype pollution in `deepMerge`, double-escaping in entity decoding) shipped with an explicit, commented regression test (grep for "ReDoS guard" across `test/markdown.test.js`, `test/line-continuation.test.js`, `test/poem-to-yaml-audio.test.js`, `test/poem-to-yaml-metadata.test.js`, `test/song-handlers.test.js`) — confirmed via `gh api repos/Poetic-Poems/poetic/code-scanning/alerts`, all 13 historical alerts are in `state: fixed`. Golden/snapshot tests (`test/golden.test.js` + `test/golden/`) pin exact YAML/vim-syntax output with a self-documenting regeneration command in the failure message.

### F-TEST-01 — `serve-static.js` has zero test coverage, including the file behind a fixed high-severity XSS · **Medium**

**Evidence:** `src/tools/serve-static.js` (355 lines, the dev server) has no corresponding test file — confirmed by grepping every `src/tools/*.js` module name against `require(...)` in `test/*.js`; it is the only module with zero hits. This includes `generateDirectoryListing()` (line 124) and its `escapeHtml()`/`encodeHref()` helpers (line 108+), the subject of a high-severity stored-XSS CodeQL fix (commit `3eb8bd9`, "fix(serve-static): resolve stored XSS in directory listing (#40)"). That commit's message says the fix was "Verified with a local server serving a directory containing filenames with `"`, `&`, and `'`" — i.e. manually, once, in the PR — with no automated test added then or since.

**Impact:** A future refactor of `serve-static.js` (or its escaping helpers) has no regression net; the same class of high-severity XSS already fixed once here could silently regress and only be caught by the next CodeQL scan (or not, if the code shape changes enough to evade the query), rather than by `npm test`.

**Direction:** Add `test/serve-static.test.js` covering `escapeHtml`/`encodeHref`/`generateDirectoryListing` directly, including a filename containing `<script>`, `"`, `&`, `'`.

### F-TEST-02 — Browser-side XSS fix (`public/index.js`) also has no direct regression test · **Low**

**Evidence:** `public/index.js`'s `renderPoems()` — the function whose `innerHTML`-based XSS was fixed in commit `8e4d6ac` ("fix(public/index.js): resolve DOM XSS in poem card rendering (#39)") — has no dedicated test exercising its DOM output with a hostile title/label. `test/build-all-poems.test.js` only asserts the *generator* no longer inlines the old vulnerable template-literal version (`assert.doesNotMatch(html, /function renderPoems/)`); it never loads `public/index.js` itself (e.g. via `jsdom`) to assert a `<script>`-bearing title renders as text. No `jsdom` or similar DOM-simulation dependency exists in `package.json`.

**Impact:** Lower risk than F-TEST-01 since the current implementation is now structurally safe (confirmed by reading `public/index.js`: `createElement`/`textContent` throughout, no `innerHTML` interpolation of untrusted data), so a regression would need someone to reintroduce `innerHTML` construction — a more deliberate act than an incidental refactor. Still, this is the browser-side half of a confirmed high-severity alert fix, with no automated check.

**Direction:** Add a minimal jsdom-based test asserting a crafted title renders as escaped text, or record the gap explicitly in `TECH-DEBT.md`.

### F-TEST-03 — No coverage tool configured · **Low**

**Evidence:** No coverage tool (`c8`/`nyc`/`istanbul`) is configured — `package.json` `devDependencies` are only `eslint`/`@eslint/js` — and no npm script invokes one, so coverage is never measured, only estimated by inspection (as this review does).

**Impact:** Gaps like F-TEST-01/02 (a whole file with zero test references) are only found by manual cross-referencing; a coverage report would surface such gaps automatically.

**Direction:** Add `c8` (works with Node's built-in test runner with no extra config) and an `npm run coverage` script; a CI coverage-floor gate is optional and can be deferred.

### F-TEST-04 — One bounded, localhost-only retry loop in tests · **Low**

**Evidence:** `test/blogger-auth.test.js`'s `hitCallback()` helper (lines 32-51) retries `ECONNREFUSED` against a freshly-`listen()`ed loopback server with `setTimeout(attempt, 25)`, capped at 20 attempts (500ms budget), covering the gap between `srv.listen()` returning and the socket being ready.

**Impact:** Legitimate, bounded, localhost-only retry — not a real network-flake risk, and the only `setTimeout`-based retry anywhere in the 29 test files; the rest of the suite has no sleeps, order dependence, or shared mutable state. Flagged Low only because a very slow/loaded CI runner could in theory exceed the 500ms budget.

**Direction:** None needed; accept as-is unless observed to flake.

**Test-kind proportions (for reference):** ~29 files / 6,483 lines / 493 `test()` cases, almost entirely unit-style tests of pure functions, with filesystem-integration tests where the function under test is itself a filesystem operation (`build-poems.js`, `build-all-poems.js`, `sync-framework.js` against a local git remote, tech-debt scripts against a throwaway git repo). Four golden/snapshot tests. No true end-to-end test drives the CLI entry points from within the test suite itself — that path is instead covered by CI actually running `npm run build` + `npm run check:build`, which is a reasonable division of labour and was reconfirmed working in this run.

## Dependencies and supply chain (DEPS)

**Strengths:** Dependency footprint is small (4 runtime: `js-beautify`, `js-yaml`, `markdown-it`, `pug`; 2 dev: `eslint`, `@eslint/js`) and every one maps to an actual build-pipeline responsibility. All six are MIT-licensed (confirmed by reading each `node_modules/*/package.json`), fully compatible with this project's own MIT licence, and all saw an npm release within the last 4.5 months as of 2026-07-22 (none abandoned). `npm ci` installs cleanly (144 packages), `npm audit --omit=dev` reports 0 vulnerabilities, and installed versions already equal each package's npm `latest`.

### F-DEPS-01 — Dependency recency confirmed (informational) · **Low**

**Evidence:** `npm view <pkg> version time.modified`, run 2026-07-22:
```
js-beautify  2.0.3   modified 2026-06-30
js-yaml      5.2.1   modified 2026-07-02
markdown-it  14.3.0  modified 2026-07-02
pug          3.0.4   modified 2026-03-13
eslint       10.7.0  modified 2026-07-10
@eslint/js   10.0.1  modified 2026-07-10
```
`npm outdated` reports nothing; each installed version already equals npm `latest`.

**Impact:** None — confirms no dependency is dormant/abandoned; recorded so a future review doesn't need to re-verify.

**Direction:** None; re-check at next scheduled review.

### F-DEPS-02 — `engines` field permits two now-EOL Node runtimes · **Medium**

**Evidence:** `package.json` lines 7-9: `"engines": { "node": ">=18" }`. Node 18 reached EOL 2025-04-30; Node 20 reached EOL 2026-04-30 (per nodejs.org/en/about/eol and endoflife.date, checked 2026-07-22 — so Node 20 has been EOL ~3 months and Node 18 ~15 months as of this review). CI itself pins Node 22 (`.github/workflows/build-poems.yml:99`, `.github/workflows/sync-blogger.yml:62`, both `node-version: "22"`, Active LTS) — so the pipeline never runs on an EOL runtime, but `engines` and the README's "Node.js 18 or later" prerequisite both still advertise EOL versions as acceptable. No `engine-strict` setting exists to enforce the field.

**Impact:** A new consumer/contributor following the documented prerequisite may install Node 18 (unpatched CVEs, no upstream support) with no warning from `npm install`/`npm ci`, inconsistent with the project's otherwise strong security posture (0 vulnerabilities, CodeQL workflow, several recent CVE-class fixes per the project map).

**Direction:** Bump `engines.node` to `>=22` (matching CI) and update the README prerequisite line; consider an `.npmrc` with `engine-strict=true` to make it enforced, not just advisory.

### F-DEPS-03 — Dependabot coverage is npm + GitHub Actions only, appropriately scoped · **Low**

**Evidence:** `.github/dependabot.yml` (14 lines): two ecosystems, `npm` and `github-actions`, both directory `/`, weekly, PR limit 5. No `ignore`/grouping/version-strategy overrides.

**Impact:** Matches the repo's actual surface (single root `package.json`, workflows under `.github/workflows/`) — no gap in coverage. It does not, however, flag "engines floor is EOL" (that's F-DEPS-02, which needs a human check).

**Direction:** None required; keep as-is.

### F-DEPS-04 — `sync-framework.sh` overwrites consumer lockfiles wholesale · **Low**

**Evidence:** `scripts/sync-framework.sh` lines 126-138 include `package.json` and `package-lock.json` in `FRAMEWORK_PATHS`, so a sync checks out this framework repo's exact lockfile into every consumer repo (checkout-and-overwrite, not a merge). Docs (README "Manual sync", `docs/SCRIPTS.md`) don't call out that a consumer's own `package.json` edits would be clobbered.

**Impact:** Low risk in practice — the documented consumer workflow doesn't invite adding own dependencies ("For everyday writing, `src/poems/poem/` is the only directory you need to touch") — but if a consumer did add one, a routine sync would silently discard it. Mitigated by nothing auto-committing by default (`--commit` is opt-in) and the script's own `git diff --staged` review step, but that relies on the consumer actually reading the diff.

**Direction:** Add a one-line callout in `docs/SCRIPTS.md`'s sync section warning to check the staged diff carefully if the consumer has customised `package.json`.

### F-DEPS-05 — Lockfile committed, build reproducible · **Low**

**Evidence:** `package-lock.json` tracked in git, `lockfileVersion: 3`, `npm ci` completes cleanly reproducing the tree (144 packages, 0 vulnerabilities).

**Impact:** None — confirms reproducibility; no gap.

**Direction:** None.

## Tooling and developer experience (TOOL)

**Strengths:** The documented newcomer path actually works end to end — verified live in a fresh scratch clone: `npm install`, `scripts/new-poem "..."` (builds automatically), `bash scripts/sync-framework.sh` (creates `.poetic-version` correctly), and `npm start` (dev server binds to loopback by default, prints usage) all worked exactly as README describes, with no need for the WSL-specific `setup-linux.sh` wrapper on this Linux sandbox. Vim support is a genuine differentiator: `editors/vim/syntax/poem.vim` was last touched 2026-07-19 (3 days before this review) and its feature list in `docs/VIM-SYNTAX.md` matches the current `.poem` syntax feature set; the 4 vim-dependent tests that get skipped when vim isn't installed report a self-explanatory reason (`# vim is not installed`) rather than failing opaquely.

### F-TOOL-01 — Vim ftdetect file has an unfilled maintainer placeholder · **Low**

**Evidence:** `editors/vim/ftdetect/poem.vim`:
```
" Vim filetype detection file
" Language:     Poem
" Maintainer:   (maintainer name)
" Last Change:  2025-10-08
```
The `syntax/poem.vim` file (last changed 2026-07-19 per git log) is kept current, but the smaller `ftdetect/poem.vim` still has the literal placeholder `(maintainer name)` and a stale `Last Change` date (2025-10-08, ~9.5 months old).

**Impact:** Cosmetic only — doesn't affect functionality (filetype detection still works) — but it's a small polish gap in an otherwise well-maintained DX feature, and a template placeholder left in shipped code looks unfinished to anyone installing it.

**Direction:** Fill in the maintainer field (or drop the line) and update `Last Change` alongside `syntax/poem.vim` edits.

### F-TOOL-02 — No devcontainer or editor-specific config beyond `.editorconfig`/ESLint · **Low**

**Evidence:** No `.devcontainer/`, no `.vscode/`, no `*.code-workspace` found anywhere in the repo. `.editorconfig` is present and thoughtful — it correctly special-cases `.poem` (preserves meaningful trailing spaces) and `.md` (hard line breaks), with comments explaining why, matching `scripts/remove-trailing-spaces.sh`'s behaviour. ESLint flat config (`eslint.config.js`) is committed and well-documented with rationale for each relaxed rule.

**Impact:** Low — `.editorconfig` + committed ESLint config already give any editor consistent basics, and the project's actual "signature" editor integration (Vim) is well covered instead. A devcontainer isn't essential for a CommonJS Node CLI toolchain, so absence isn't itself a gap for this project's size/nature, but it's worth noting for anyone standardising onboarding further.

**Direction:** None required; only worth adding if onboarding friction is reported in practice.

### F-TOOL-03 — `poem-to-raw` script name is not self-explanatory without docs · **Low**

**Evidence:** `package.json` scripts block has 15 entries; most are intuitive (`build`, `build:poems`, `build:yaml`, `start`, `lint`, `check`). `poem-to-raw` (line 35) is the one whose purpose (extracting plain-text bodies to a browsable `raw/` directory for GitHub linking) isn't guessable from the name alone — it is, however, documented clearly in `docs/BUILD.md` lines 26, 68-70, and it's invoked automatically as the first step of `npm run build`, so a user following the documented `npm run build`/`npm start` path never needs to know the name exists standalone.

**Impact:** Very low — only affects someone reading the scripts block cold (e.g. via `cat package.json` or `npm run` with no args) before consulting docs. The documented workflows never require running it by name directly.

**Direction:** None required; optionally add a one-line description convention or reorder scripts to group build-pipeline steps together for scannability.

## CI/CD and release engineering (CI)

**Strengths:** All six workflows were read in full. `build-poems.yml` is thoughtfully engineered around GitHub's "required but skipped check" trap — a `build` job is unconditionally triggered and always reports a real status, internally skipping its steps via a path-relevance check, with the rationale documented inline. Branch protection (`gh api repos/Poetic-Poems/poetic/rules/branches/main`) confirms `main` is gated by required status checks `build`, `commit-format`, `Analyze (javascript-typescript)`, `Analyze (actions)`, squash-only merge, and mandatory code-owner review (`require_code_owner_review: true`, `CODEOWNERS` = `@warwickallen`/`@Warwick-Allen` for `*`) even though `required_approving_review_count` is 0 — i.e. review is still effectively required via CODEOWNERS (see F-GOV-01 for why that gate is weaker than it looks). All 13 historical CodeQL alerts are confirmed `state: fixed` via the API (not just marked resolved in `TECH-DEBT.md`). The release process is fully automated and verified by sampling: `v6.1.0` and `v6.1.1` both have a matching git tag, matching `package.json` version at that tag, a corresponding `CHANGELOG.md` section, and a published GitHub release. Dependabot covers both `npm` and `github-actions` ecosystems weekly. A full CI run of `build-poems.yml` (with vim install) takes ~28 seconds wall-clock — fast enough to be a non-issue for contributors.

### F-CI-01 — Release-notes files contradict the "CHANGELOG.md only" policy and already show drift · **Medium**

**Evidence:** `CLAUDE.md` states "**`CHANGELOG.md`** is the only place for recording what changed and when," yet the repo root permanently carries `RELEASE_NOTES_v6.0.1.md`, `RELEASE_NOTES_v6.1.0.md`, and `RELEASE_NOTES_v6.1.1.md` — one added per release PR (e.g. commit `7a8380b`, "chore(release): v6.1.1 (#70)", which explicitly notes it "mirrors `RELEASE_NOTES_v6.1.0.md`'s shape"). These duplicate `CHANGELOG.md` content and, per the v6.1.1 file's own text, already required a manual disclaimer explaining how it "supersedes v6.1.0's title-markup documentation" — i.e. the exact kind of drift the CHANGELOG-only policy exists to avoid, appearing after only two releases. (Cross-reference: this is the same underlying artefact GOV's F-GOV-03 flags from the governance angle.)

**Impact:** Every future release adds another permanent root-level file that must be kept consistent with `CHANGELOG.md` by hand, with no tooling enforcing that; the policy stated in `CLAUDE.md` is not actually followed for this artefact type.

**Direction:** Either stop creating `RELEASE_NOTES_*.md` (the GitHub release body, auto-generated by `release.yml` via `--generate-notes`, already serves this purpose), or move them under a clearly-scoped `docs/releases/` directory and note the exception in `CLAUDE.md`'s documentation-principles section.

### F-CI-02 — No automated check that a version bump comes with a CHANGELOG entry · **Low**

**Evidence:** No workflow, git hook, or test enforces that `CHANGELOG.md`'s `[Unreleased]` section is non-empty or rolled over correctly when `package.json`'s version is bumped — confirmed by `grep -rln CHANGELOG .github/workflows/ .githooks/*` returning nothing relevant. The two sampled releases did this correctly, but only because the PR author/agent manually checked it (as itemized in each release PR's "Test plan" checklist, e.g. `#70`).

**Impact:** A future release PR could bump the version without a matching CHANGELOG entry and nothing in CI would catch it, despite CLAUDE.md's policy treating the changelog as load-bearing.

**Direction:** Add a cheap check to `release.yml` or a PR-time workflow that fails if `package.json`'s version changed but `CHANGELOG.md`'s diff is empty.

### F-CI-03 — Branch protection does not require branches to be up to date before merge · **Low**

**Evidence:** `gh api repos/Poetic-Poems/poetic/rules/branches/main` shows `strict_required_status_checks_policy: false` — a PR branch does not need to be up to date with `main` before its status checks are considered satisfied for merge.

**Impact:** A branch that passed CI against an older `main` could be squash-merged without re-running checks against the latest `main`, in principle allowing an interaction bug between two independently-green PRs to land unnoticed. Given this repo's stated practice of small, short-lived PRs and its multi-agent workflow (which already requires a post-PR `gh pr view --json mergeable,mergeStateStatus` check), the practical exposure is limited but not zero.

**Direction:** Consider enabling strict status checks if merge-conflict-shaped bugs are ever observed; not urgent given current branch lifetimes.

**CI gate summary:** lint (`eslint .`), full test suite, trailing-whitespace check, build, and build-artefact verification all run in the required `build` job; two CodeQL language analyses (`javascript-typescript`, `actions`) run as separate required jobs; commit-message format (PR title + every commit) is a required job backed by a shared script (`.githooks/check-commit-format.sh`) used both locally and in CI. No type-check exists, but the codebase is plain CommonJS JS with no TypeScript, so this is not a gap. `sync-blogger.yml` and `sync-framework.yml` are both feature-flag-gated (`.poetic-config.yaml`), concurrency-controlled, and `sync-blogger.yml` supports an explicit `--dry-run` for manual dispatch — reasonable safety posture for the two workflows that can write to external systems (Blogger, consumer-repo PRs).

## Performance and scalability (PERF)

**Strengths:** The build pipeline is genuinely incremental at the right granularity — `build-poems.js` calls `needsRebuild()` per poem (only stale poems are re-converted/rendered), while `build-all-poems.js` uses `needsRebuildAggregate()` with a sidecar manifest (`public/.all-poems.manifest.json`) so the whole-collection outputs (`all-poems.html`, `index.html`) are skipped when nothing changed, without depending on directory mtimes. Both helpers are pure `fs.statSync`-based comparisons, O(n) in the number of declared inputs/sources — no quadratic behaviour. `src/tools/needs-rebuild.js` is well covered by `test/needs-rebuild.test.js` (missing outputs, missing inputs, multiple outputs, manifest add/remove/edit detection). The previously-fixed quadratic hotspot — `convertMarkup`'s escape-restoration loop in `src/tools/poem-parser.js` — was re-verified in this review: line 1843 now does a single global-regex pass (`text.replace(/\x00ESCAPE\d+\x00/g, (placeholder) => escapes.get(placeholder))`) with O(1) Map lookups per match, confirming TD26071502/commit `0d3ae9b` still holds; no new quadratic pattern was found elsewhere in `poem-parser.js`, `aggregate-render-core.js`, or `build-all-poems.js`.

### F-PERF-01 — Blogger sync posts poems sequentially, one HTTP round trip pair each · **Low**

**Evidence:** `src/tools/sync-blogger.js` lines 768-844 — the `main()` loop `for (const yamlPath of yamlFiles)` awaits `createPost`/`updatePost` sequentially per poem, with no concurrency or batching. Each new poem costs two sequential HTTP round trips (create, then rename via update, lines 812-819).

**Impact:** For a consumer repo with hundreds of poems, a first-time full sync (or a bulk edit affecting many poems) could take a long time end-to-end. Not a correctness issue — the GitHub Actions job has no explicit step timeout (see F-OPS-01) so it would eventually finish or hit GitHub's default 6-hour job cap — but it is a real scaling knob if a consumer collection grows large.

**Direction:** Consider bounded concurrency (e.g. a small worker pool) if sync runtimes become a practical nuisance; not urgent at current scale.

### F-PERF-02 — Dev server's `/all-poems` route re-renders the whole collection uncached on every request · **Low**

**Evidence:** `src/tools/serve-static.js` lines 222-240 — the `/all-poems` dev-server route calls `concatenateAllHtmlFiles()` (which reads and re-renders every poem's YAML from disk) synchronously on every request, with no caching.

**Impact:** Only affects the local dev server (`npm start`/`npm run build:all`), a single-user convenience tool, so the cost is felt only by whoever is browsing `/all-poems` during development; for very large collections each request would take proportionally longer, but this is judged proportionate given the tool's scope.

**Direction:** No action needed unless dev-server responsiveness becomes a reported annoyance for a large consumer collection.

### F-PERF-03 — No benchmarks or documented scale limits · **Low**

**Evidence:** No benchmarks, load tests, or documented scale limits exist anywhere in `docs/` for poem-collection size (checked `docs/BUILD.md`, `docs/BLOGGER.md`, `docs/POEM-TO-YAML.md`).

**Impact:** For a static-site batch-build tool exercised by a solo/small-team author workflow, this is a proportionate gap rather than a real risk — the mtime-based incremental build (see Strengths above) already keeps steady-state builds fast regardless of total collection size, and full CI rebuilds (a fresh checkout, so everything is stale by construction) are the only case where total poem count drives build time linearly.

**Direction:** None needed now; worth a one-line mention in `docs/BUILD.md` only if a consumer repo actually grows into the thousands of poems.

Resource handling (file handles, unbounded caches/queues, memory growth in `build-all-poems.js`): no issues found. `build-all-poems.js` holds one array of rendered fragment strings for the whole collection in memory at once (`entries` in `concatenateAllHtmlFiles`), proportional to total poem-collection size, but at the sizes this framework targets (tens to low hundreds of poems) this is a few MB at most — not a concern. File reads/writes throughout use synchronous `fs` calls, appropriate for a single-threaded CLI batch tool with no concurrent request handling to block.

## Usability and accessibility (UX)

**Strengths:** The all-poems filter bar (`src/tools/build-all-poems.js:199-215`) is genuinely well built — `role="group"`, `aria-pressed` on toggle buttons, `aria-label`/`aria-live="polite"` on the filter input/count, `aria-hidden="true"` on decorative icons. `public/index.js`'s `appendTitleHtml` (lines 29-60) deliberately avoids `innerHTML` for title markup, walking tokens into real DOM nodes — good defense-in-depth that also keeps titles screen-reader-navigable as ordinary text with `<em>/<strong>/<s>` semantics. CLI exit-code discipline is solid across the Node tools: every failure path found in `build-poems.js`, `build-all-poems.js`, `poem-to-yaml.js`, `yaml-to-poem.js`, and `build-blogger.js` sets a non-zero exit, and error messages are specific and human-readable rather than raw stack dumps.

### F-UX-01 — Postscript "See more" toggle is not keyboard-operable · **High**

**Evidence:** `src/templates/_poem-content.pug:155-158`:
```pug
input.postscript-toggle-cb.hidden(id=toggleId type="checkbox")
div.postscript-content(...)!= processedContent
label.postscript-toggle(for=toggleId)
  span.sr-only See more
```
`public/poetic.css:11-13` defines `.hidden { display: none !important; }`. A `display: none` form control cannot receive focus in any browser, so the checkbox driving this show/hide is removed from the tab order entirely. The paired `<label for=...>` has no `tabindex` and labels are never in the default tab order either. Verified directly by reading both files (this is a still-open gap, distinct from the sort-header issue already fixed in `f3b98c5`, which was independently re-verified intact: `src/tools/build-all-poems.js:222-224` still emits real `<button>` elements with `aria-sort`, and `public/all-poems.js` still wires `aria-sort`/class updates on click).

**Impact:** Mouse users can click the label to expand/collapse a postscript preview (native label→checkbox click delegation), but keyboard-only users and many screen-reader users have no way to reach or activate this control at all on any poem page that uses a postscript preview — a WCAG 2.1.1 (Keyboard) violation, the same class of bug the prior review fixed for sort headers, recurring in a different component.

**Direction:** Mirror the sort-header fix: replace the hidden-checkbox/label pattern with a real `<button aria-expanded="false">` toggling a CSS class via a small script, as already done for the analysis show/hide and song-embed controls in the same template (`src/templates/_poem-content.pug:120-137, 166-190`).

### F-UX-02 — Several text colours fail WCAG AA contrast · **Medium**

**Evidence:**
- `.poem-info { color: gray; font-size: 90%; }` (`public/poetic.css:69-72`, also reused at lines 514, 533) — the author/date byline under every poem's title. `gray` (#808080) on white ≈ 3.95:1, below the 4.5:1 normal-text threshold; the 90% font-size also rules out the large-text 3:1 exemption.
- `.poetic-footer { color: #999; }` (`public/poetic.css:733-739`) — site-wide footer text, #999999 on white ≈ 2.85:1, fails even the large-text 3:1 threshold.
- `.no-content` (line 27-29) and `.filter-empty` (line 361-363) also use `#999`.
- `#007AFF` used as link/text colour in several places (lines 197, 209, 344, 450, 469) ≈ 4.0:1, marginally under 4.5:1 for normal text (acceptable for large text/UI components at 3:1, hence lower severity than the greys above).

**Impact:** Low-vision visitors reading a generated poem page may struggle to read the byline and footer text; this affects every published page site-wide, not an edge case.

**Direction:** Darken `.poem-info`/`.poetic-footer`/`.no-content`/`.filter-empty` to at least `#767676` (the commonly-cited AA-safe grey on white) or equivalent for the current design.

### F-UX-03 — No `<h1>` on individual poem pages · **Low**

**Evidence:** `src/templates/poem-page.pug` (renders `public/<slug>/index.html`) has only `nav.poem-page-nav` and `h2.poem-title` (line 25) — no `<h1>` anywhere. `index.html` and `all-poems.html` both correctly use `h1` for the site title.

**Impact:** A screen-reader user navigating by heading level on a standalone poem page lands on an `h2` with no parent `h1` — a minor heading-hierarchy inconsistency, not a hard failure.

**Direction:** Promote the poem title (or an equivalent site-title element) to `h1` on the standalone poem page, or demote consistently with a documented rationale if `h2` is intentional.

### F-UX-04 — Browser-renderer library (`poetic/browser`) has no discoverability path from README · **Low**

**Evidence:** `README.md` (375 lines) has no mention of the browser renderer, `poetic/browser`, or `docs/RENDERER-BROWSER.md` (grep found only one incidental, unrelated hit for "browser" in a favicon-tab context, line 282). The library itself is in good shape: `src/browser/render.js` and `src/browser/render-aggregate.js` export a consistent `render<Noun>(input, opts)` naming pattern, `package.json`'s `exports` map (`./browser`, `./browser/poetic.css`) matches `docs/RENDERER-BROWSER.md`'s packaging examples exactly, and static-checking the doc's code samples against the actual exported function signatures shows they match (same option names: `config`, `slug`, `standalone`, `favicon`, `subtitle`, `title`).

**Impact:** A reader going through the README top-to-bottom (the natural onboarding path) would not learn this public, tested API surface exists at all; they'd need to already know to look under `docs/`.

**Direction:** Add a short pointer/section in README linking to `docs/RENDERER-BROWSER.md`, at least alongside the other doc links already listed there.

### F-UX-05 — Browser-renderer errors are unclassified plain `Error` objects · **Low**

**Evidence:** Neither `src/browser/render.js` nor `src/browser/render-aggregate.js` wraps or classifies parser errors — a malformed `.poem` string surfaces as a bare `Error` with only a human-readable `.message` (e.g. `Error: Invalid or missing date`, the same message format observed from the CLI), no `.code`/`.name` a consuming app could switch on programmatically.

**Impact:** Consistent with the CLI's own behaviour (not a new inconsistency), but for a library surface intended for embedding in other apps (e.g. a "Poetic Fiddle"-style consumer), richer, matchable error shapes are the more usual expectation than for a CLI.

**Direction:** Low priority; if a real consumer needs to branch on error type, consider a small set of named error classes/codes.

### CLI/npm-script surface — verified good, no material findings

Live-tested from repo root: `node src/tools/poem-to-yaml.js` (no args) prints a clear two-line usage message and exits 1; a garbage-content `.poem` file yields `Error: Invalid or missing date` (exit 1); an empty file yields `Error: Missing title` (exit 1); a missing input file yields the raw but clear `ENOENT` message (exit 1). All are specific, actionable, and non-zero on failure — no raw stack traces surfaced to the user. Two very-low-severity nits not worth a numbered finding: `scripts/edit-poem`'s header comment documents "`-1` = no poems matched" but the shell actually returns 255 for `exit -1` (shell exit codes wrap to unsigned 8-bit), a documentation/behaviour mismatch for any automation checking the exit code directly; and `scripts/edit-poem:43` hardcodes `vi` while `scripts/new-poem:53` respects `${EDITOR:-vi}`, an inconsistency between two closely related author-facing commands.

### Internationalisation — out of scope, essentially fine

No i18n framework is present or claimed anywhere in docs, consistent with this being an English-poem-focused personal/solo-author tool. Two minor, code-verifiable edge cases worth a one-line note rather than a numbered finding: `src/tools/slugify.js:13-18` strips all non-ASCII characters and would produce an empty slug for a title in a non-Latin script when a caller doesn't supply an explicit slug (masked in the Node build path, which slugs from filenames, but reachable via `src/browser/render.js`'s `parseAndAugment` fallback); and `src/tools/date-utils.js`'s `formatDateForDisplay` hardcodes English day/month names, while `public/index.js`'s `formatPoemDate` instead uses `toLocaleDateString(undefined, ...)` (locale-aware) — the two date-display code paths behave differently depending on which page is viewed, in a project that otherwise makes no locale claims either way.

## Documentation (DOC)

**Strengths:** `poem-syntax.ebnf` and `docs/POEM-SYNTAX.md` maintain a deliberate, working single-source-of-truth pattern via explicit "Authoritative grammar: X in poem-syntax.ebnf" cross-references in both directions (e.g. `docs/POEM-SYNTAX.md:554,573`; `poem-syntax.ebnf:44-55` points back at doc prose) — spot-checked on `title_line`/`directive_line`/`label` rules and found consistent, including edge-case wording. `examples/poetic-config.example.yaml` is in exact lockstep with `src/tools/poetic-config.js`'s documented keys (every key present as a commented-out section in one direction and vice versa, none missing either way). Core source comments (`poem-parser.js`, `build-poems.js`, `poem-to-yaml.js`) explain rationale and non-obvious invariants precisely where needed (e.g. `build-poems.js:97-99` calling out the empty-slug guard against clobbering `index.html`) without noise elsewhere. README.md is otherwise thorough and accurate: version matches `package.json` (6.1.1 vs CHANGELOG's `[6.1.1]`), its doc-links list resolves, and its "Contributing" section functionally substitutes for a missing CONTRIBUTING.md.

### F-DOC-01 — `docs/BUILD.md`'s description of the main build script describes a superseded (v0.1) implementation · **Critical**

**Evidence:** `docs/BUILD.md:37-46` ("What the Build Scripts Do" → Main Build Script) states `src/tools/build-all-poems.js` "Scans the `public/` directory for all HTML files" and "Extracts metadata (title, date, audio links) from each poem" to build `all-poems.html`. The actual code's own header comment (`src/tools/build-all-poems.js:1-9`) states: *"Changes vs. v0.1: Renders poem fragments in-memory via poem-render (no longer reads `<slug>.html` files)."* Confirmed further at `build-all-poems.js:353`: the poem source list is built from `src/poems/yaml/`, not from scanning `public/` HTML.

**Impact:** A maintainer or agent debugging the aggregate-page build using this doc as a mental model will look in the wrong place (rescanned HTML files) for how titles/dates/audio metadata actually flow (in-memory rendering from YAML), and may make incorrect changes or file the wrong tech-debt/bug reports based on the doc's description.

**Direction:** Rewrite the "Main Build Script" subsection to describe the current in-memory, YAML-sourced rendering pipeline; drop the "scans public/ for HTML files" framing entirely (it also runs against CLAUDE.md's "as-built only" documentation principle — this reads as leftover historical description of a prior implementation).

### F-DOC-02 — `docs/BUILD.md` gives the wrong default Blogger template filename, and contradicts itself within the same file · **High**

**Evidence:** `docs/BUILD.md:62` ("Locates the Blogger template file `public/fragments-and-unity.template.html`"), `:91` ("Copy the updated `public/fragments-and-unity.template.html` content"), and the File Structure diagram at `:110` all name `fragments-and-unity.template.html`. But the same document's config-key table at `docs/BUILD.md:481` gives the default as `public/blogger-template.html`, which matches the actual code: `src/tools/build-blogger.js:31-46` computes `const canonical = path.join(publicDir, "blogger-template.html")`, and `docs/BLOGGER.md:36,46,137` consistently uses `blogger-template.html` throughout.

**Impact:** `fragments-and-unity.template.html` looks like a leftover from when this section was written against one specific consumer repo (Fragments & Unity) rather than the generic framework default; a reader following the "Workflow for Blogger Template Updates" steps literally would look for a file that doesn't exist by that name in a fresh consumer repo. Internally inconsistent (one part of `BUILD.md` contradicts another part of the same file), which is a stronger signal of drift than a single wrong fact would be.

**Direction:** Replace all three `fragments-and-unity.template.html` references in `docs/BUILD.md` with `blogger-template.html` (or a `<repo-name>.template.html` placeholder, whichever the framework intends as generic), matching the config table already in the same file and `docs/BLOGGER.md`.

### F-DOC-03 — `docs/QUICKSTART-VIM.md` gives paths that do not exist in this repo · **High**

**Evidence:** `docs/QUICKSTART-VIM.md:9,12` documents `./vim/install.sh`; there is no `vim/` directory at repo root — the actual script is at `editors/vim/install.sh` (confirmed via directory listing: `editors/vim/` contains `README.md`, `ftdetect/`, `install.sh`, `syntax/`; a bare `vim/` at root does not exist). Line 20 references `vim src/poems/_example.poem`, but the example poem actually lives at `src/poems/poem/_example.poem` (`docs/VIM-SYNTAX.md:228` gets this path right). Lines 93/98-105 repeat the same wrong `vim/` root in the "Complete Documentation" pointer and the File Structure diagram. Every other doc that mentions this path (`README.md:42`, CLAUDE.md's directory map, `docs/VIM-SYNTAX.md`) correctly says `editors/vim/`.

**Impact:** A new contributor following this quickstart literally (its stated purpose: "Installation (30 seconds)") gets a "no such file or directory" on the very first command. This is the one doc in the set that appears to predate a `vim/` → `editors/vim/` directory move and was never updated — every sibling doc got the update, this one didn't.

**Direction:** Update all `vim/` references in `docs/QUICKSTART-VIM.md` to `editors/vim/`, and fix the example-poem path to `src/poems/poem/_example.poem`.

### F-DOC-04 — `docs/BUILD.md` File Structure diagram uses the wrong filename for the shared-poem partial, contradicting itself · **Medium**

**Evidence:** `docs/BUILD.md:122` lists `_shared.poem  # Shared poem content included by others` (underscore-prefixed). The real file is dot-prefixed: `.shared.poem` (confirmed on disk at `src/poems/poem/.shared.poem`), and the same document uses the correct dot-prefixed name elsewhere in itself (`docs/BUILD.md:70,74`), as do README.md:219, `docs/YAML-SCHEMA.md`, `docs/SCRIPTS.md`, `docs/POEM-SYNTAX.md`, and the code (`src/tools/poem-to-yaml.js`).

**Impact:** Minor on its own, but combined with F-DOC-01/02 this is the third self-inconsistency found within `docs/BUILD.md` alone, suggesting this file has accumulated edits in some sections without corresponding updates in others (a "diagram/prose drifted from each other" pattern rather than one-off typos).

**Direction:** Fix the diagram entry to `.shared.poem` to match the rest of the same file.

### F-DOC-05 — Root-level `RELEASE_NOTES_vX.Y.Z.md` files duplicate CHANGELOG.md and carry historical narrative, contrary to CLAUDE.md's stated documentation principles · **Medium**

**Evidence:** `RELEASE_NOTES_v6.0.1.md`, `RELEASE_NOTES_v6.1.0.md`, and `RELEASE_NOTES_v6.1.1.md` exist at repo root. CLAUDE.md states *"`CHANGELOG.md` is the only place for recording what changed and when"* and mandates docs be "as-built" (no "previously"/"used to be"/"now uses" phrasing). `RELEASE_NOTES_v6.1.1.md` contains exactly the kind of narrative the as-built principle asks docs to avoid: *"This supersedes v6.1.0's title-markup documentation, which described strikethrough as single-tilde `~word~`. That was correct for what v6.1.0 shipped, but v6.1.0 was tagged and released before this correction landed..."* — legitimate content for a changelog entry, but it lives in a second, undeclared changelog file rather than `CHANGELOG.md`. No other file references these three (`grep -rn "RELEASE_NOTES"` finds nothing outside themselves), and they were only created for 3 of the project's many releases (not v6.0.0 or any earlier release), so the practice is applied inconsistently even on its own terms.

**Impact:** Two sources of release history can drift — the v6.1.0/v6.1.1 correction narrative in `RELEASE_NOTES_v6.1.1.md` isn't mirrored back into the `CHANGELOG.md` `[6.1.0]`/`[6.1.1]` sections' own prose — and it's unclear to a future contributor (human or agent) whether producing one of these files is still expected practice for the next release.

**Direction:** Either fold any content worth keeping into `CHANGELOG.md` and stop creating new `RELEASE_NOTES_*.md` files, or, if they serve a distinct purpose (e.g. GitHub release body source text), say so explicitly somewhere (README or CLAUDE.md) so the practice isn't just three orphaned files with no documented role.

### F-DOC-06 — `docs/POEM-TO-YAML.md` omits the incremental-rebuild (`--force`) behaviour that applies to the script it documents · **Low**

**Evidence:** `docs/BUILD.md:72-74` documents that every build step including `build:yaml` skips regeneration via `needs-rebuild.js` unless `--force`/`POETIC_FORCE_REBUILD=1` is passed — directly observable in practice (`npm run build:yaml` prints `⏭ Skipping <file> (up to date)` for unchanged sources). `docs/POEM-TO-YAML.md`'s own "Usage"/"Implementation Notes" sections say nothing about this skip behaviour, even though it is a real, user-visible behaviour of the exact script the doc is about.

**Impact:** Minor — someone reading only `docs/POEM-TO-YAML.md` (not `docs/BUILD.md`) and seeing "up to date" skip messages might not know why, or how to force a rebuild.

**Direction:** Add a short cross-reference/paragraph to `docs/POEM-TO-YAML.md` pointing at the incremental-rebuild mechanism and the `--force` flag.

### Verified accurate, no findings

`docs/POEM-TO-YAML.md`'s CLI usage matches `src/tools/poem-to-yaml.js:69-77` exactly. `docs/SCRIPTS.md`'s description of every script in `scripts/` was checked against actual behaviour (two run live: `remove-trailing-spaces.sh --check`, `check-build-artifacts.sh`) and matches. `docs/BLOGGER.md` matches `.github/workflows/sync-blogger.yml` precisely (feature-flag gate, push-trigger path restriction, `workflow_dispatch` with `dry_run`). `docs/RENDERER-BROWSER.md`'s architectural claims are corroborated by `package.json`'s `build:generated` script and matching source references. `docs/VIM-SYNTAX-EMBEDDED-LANGUAGES.md` and `docs/VIM-SYNTAX.md` are mutually consistent on the supported-language table. No CONTRIBUTING.md exists at root, but README.md's "Contributing" section (lines 325-356) adequately covers PR workflow, branch protection, commit format, and hook setup, so this is not treated as a gap. Grepping `docs/*.md` and `README.md` for "previously"/"used to"/"now uses"/"deprecated"/"migration"/"no longer"/"formerly" found no violations of the as-built convention outside the `RELEASE_NOTES_*.md` files covered by F-DOC-05 (which are release-note files, not part of the `docs/` reference set, but still root-level project documentation). `CHANGELOG.md` currently has a populated `[Unreleased]` section, and the last three releases each show a proper dated version section with `### Added`/`### Fixed`/`### Changed` subheadings — the Unreleased→versioned lifecycle is being followed correctly. Live-testing CLAUDE.md's "Build commands" (`npm run build`, `npm test`, `npm run check`, `npm run check:build`) reproduced exactly the documented behaviour in every case.

## Governance and project health (GOV)

**Strengths:** The MIT/CC BY-NC-ND 4.0 licence split (`LICENCE` / `LICENCE-POEMS.md`) is deliberate and well-reasoned — MIT for the reusable framework code, a protective-by-default Creative Commons licence for creative poem content, with a documented menu of alternatives (CC0 through CC BY-NC-ND) and a README callout (`README.md:160-164`) telling consumers to fill in the placeholder before publishing; `package.json`'s `"license": "MIT"` is consistent with this. `scripts/next-tech-debt-id.pl` correctly implements the ID-allocation rule it promises (verified against `origin/main` with several dates, including a same-day rollover and a date with zero prior entries) — the Ledger-based tech-debt process is a genuinely sound, race-safe piece of governance tooling. Issue hygiene is clean by volume: the one GitHub issue ever filed was triaged and closed within two hours, and there is no stale-PR or stale-issue backlog.

### F-GOV-01 — The one enforced review gate is satisfied by the same person under two GitHub accounts · **High**

**Evidence:** `CODEOWNERS` lists two GitHub handles for the whole repo (`* @warwickallen` / `* @Warwick-Allen`); `gh api repos/Poetic-Poems/poetic/collaborators` shows exactly two collaborators — `warwickallen` (admin) and `Warwick-Allen` (write) — both clearly the same person (git history shows only one email, `warwick@datumprocess.co.nz`, under name variants "Warwick Allen" and "Warwick Allen, Datum Process"; `Warwick-Allen`'s displayed name field is empty, consistent with an alt/secondary account of the same individual). The branch ruleset (`gh api repos/Poetic-Poems/poetic/rulesets/18226786`) sets `required_approving_review_count: 0` but `require_code_owner_review: true` — the only enforced review gate is a code-owner approval, and every code owner is the same human. Spot-checked PRs (#75, #72, and a sample of #56-#75) are all authored by `warwickallen` and approved by `Warwick-Allen` minutes later (approval-after-open times: PR #62 ≈1 min, #67 ≈1 min, #71 ≈1.5 min, #74 ≈2.5 min, #72 ≈19 min, #75 ≈42 min). Three merged PRs (#1, #4, #7) have no review record at all.

**Impact:** The elaborate branch-protection / PR-title-as-commit workflow described in `CLAUDE.md` reads as rigorous, but the one review gate it actually enforces (code-owner approval) is satisfied entirely by the PR author switching to a second GitHub account they also control. There is no independent human (or independent tooling) verifying AI-agent-authored changes before they reach `main` — self-approval, not review, is what actually happens. This is the central risk of the multi-agent working model: with a single human behind every approval, an agent producing a subtly-wrong change has no real second pair of eyes between it and `main`, regardless of how many PRs, hooks, or claim-branches surround it.

**Direction:** Be explicit in `CLAUDE.md`/`SECURITY.md` that review is currently self-review by design (a solo-maintainer project), and/or add an automated substitute for at least a subset of changes rather than implying peer review where none exists.

### F-GOV-02 — 100% single-person bus factor, not mitigated by the multi-agent tooling · **Medium**

**Evidence:** `git shortlog -sn --all` → 148 commits "Warwick Allen, Datum Process", 65 "Warwick Allen" (same email, both name variants), 3 `dependabot[bot]`. 100% of human-authored history is one person. No `CONTRIBUTING.md`, no documented co-maintainer, no succession plan anywhere in the repo.

**Impact:** `CLAUDE.md`'s multi-agent workflow (`.githooks/`, `td/<id>` claim branches, dedicated fresh clones) solves *concurrency* among agents but does not address bus factor: every agent is ultimately gated by the same single human's approval (F-GOV-01), who is also the sole admin with push/merge authority. If unavailable for an extended period, the project doesn't degrade gracefully — it stops, since no other party can satisfy code-owner review or has admin rights to adjust it. The multi-agent tooling is easily mistaken for redundancy; it is really parallelism under one point of failure.

**Direction:** Document the succession/backup plan explicitly (even "there isn't one, by design"), or add a second human collaborator with independent judgement for merge authority.

### F-GOV-03 — Per-release notes files duplicate, and contradict, the changelog-only policy · **Low**

**Evidence:** `RELEASE_NOTES_v6.0.1.md`, `RELEASE_NOTES_v6.1.0.md`, `RELEASE_NOTES_v6.1.1.md` sit at repo root, one new file per release, hand-written and substantially duplicating the corresponding `CHANGELOG.md` section in different prose. `.github/workflows/release.yml` does not generate or reference these files (uses `gh release create --generate-notes`) — they are added manually alongside each `chore(release)` PR.

**Impact:** `CLAUDE.md`'s own "Documentation principles" state "`CHANGELOG.md` is the only place for recording what changed and when" — these files (unbounded, one per future release) contradict that stated policy, duplicate content that can drift from the changelog wording, and clutter the repo root.

**Direction:** Delete them and rely on `CHANGELOG.md` + the GitHub Releases tab (already auto-generated), or explicitly carve out an exception in `CLAUDE.md` if they're a deliberate artefact.

### F-GOV-04 — No CONTRIBUTING.md or issue/PR templates · **Low**

**Evidence:** No `CONTRIBUTING.md` and no `.github/ISSUE_TEMPLATE/` or `.github/PULL_REQUEST_TEMPLATE.md`. `README.md`'s "Contributing" section (lines 325-357) covers commit format and branch-protection mechanics reasonably; `TECH-DEBT.md` covers its own claim workflow. No single onboarding doc exists for a first-time outside contributor.

**Impact:** Minor — the project has never received a PR or issue from anyone other than the maintainer and their agents (all 75 PRs and the sole issue trace to one account). Would become a real gap only if outside contribution volume grows.

**Direction:** Fold README "Contributing" content into a dedicated `CONTRIBUTING.md` once external contributions start; not worth doing pre-emptively.

### F-GOV-05 — No formal roadmap · **Low**

**Evidence:** No `ROADMAP.md`, no GitHub milestones (`gh api repos/Poetic-Poems/poetic/milestones` → empty), no project board. Forward direction is visible only via `CHANGELOG.md`'s `[Unreleased]` section (currently two entries) and `TECH-DEBT.md`'s "Current Items" (currently empty).

**Impact:** Adequate for this project's size and cadence; a formal roadmap would likely be over-engineering here. Flagged as Low only because "no stated roadmap" is literally true, not because it's a deficiency.

**Direction:** None; current substitute is reasonable at this scale.

### F-GOV-06 — Process rigor overall is proportionate, apart from F-GOV-01 · **Low**

**Evidence:** The branch-protection + squash-merge + PR-title-as-commit + tech-debt-claim-branch apparatus in `CLAUDE.md` is substantial process for a project with one human decision-maker and no external contributors to date, but the automated gates (required status checks: `build`, `commit-format`, CodeQL `Analyze` x2, code-quality) are all real and cheap to run.

**Impact:** On balance proportionate rather than over-engineered: automated gates catch real bug classes regardless of who reviews, and the multi-agent claim/clone workflow genuinely prevents concurrent-agent collisions (e.g. 5 PRs landed on 2026-07-19 alone). The rigor that's more apparent than real is specifically the human-review gate (F-GOV-01), a narrower problem than "the whole process is over-engineered."

**Direction:** None beyond F-GOV-01.

## Observability and operations (OPS)

**Strengths:** Console logging throughout the build/sync tools is consistent and informative for a CLI tool (clear ✅/❌/⏭ markers, per-file warnings that name the offending file, a final summary line with counts). Credential redaction was re-verified: `blogger-auth.js`'s "Next steps" summary (lines 547-550) prints `<redacted>` placeholders for `BLOGGER_CLIENT_ID`/`BLOGGER_CLIENT_SECRET`/`BLOGGER_REFRESH_TOKEN` rather than the actual values, confirming commit `323f8a3` (#41, CodeQL `js/clear-text-logging`) still holds; the one remaining place the refresh token is printed in full (the "SUCCESS" banner, line 477) is the tool's actual deliverable — the value the operator must copy out — not a redundant echo, so that is correct as-is. `sync-blogger.js`'s failure diagnosis (`explainBloggerFailure`/`diagnoseBloggerFailure`, lines 547-716) is unusually strong for this class of tool: it turns Google's anonymous errors (`403`, `invalid_grant`, `invalid_client`, `404`, `401`) into specific, actionable advice, cross-referenced with `docs/BLOGGER.md`'s "Troubleshooting" section, which itself is a genuine runbook (symptom table plus one dedicated subsection per failure mode, each with a numbered fix procedure). Health checks, metrics, and tracing are correctly inapplicable — this project has no running service other than an explicitly local, loopback-bound dev server (`serve-static.js`, binds to `127.0.0.1` by default) and a one-shot CI job (`sync-blogger.yml`); there is nothing to instrument continuously.

### F-OPS-01 — No `timeout-minutes` on any GitHub Actions job · **Low**

**Evidence:** None of the six workflows in `.github/workflows/` set `timeout-minutes` on any job (confirmed via `grep -rn timeout-minutes .github/workflows/*.yml`, no matches). `sync-blogger.yml` additionally sets `concurrency: { group: sync-blogger, cancel-in-progress: false }`.

**Impact:** Combined with F-OPS-02 (no fetch timeout), a hung outbound call in the Blogger sync job would run until GitHub's default 360-minute job cap, and because `cancel-in-progress` is `false`, a subsequent push's sync would queue behind it rather than cancel it — a poem update could sit unpublished for hours in the unlikely event of a hung request. Low severity because this requires a hang (not just a slow response) on Google's side, which is rare in practice.

**Direction:** Add a modest `timeout-minutes` (e.g. 15) to the `sync-blogger.yml` job as a backstop.

### F-OPS-02 — Blogger sync has no request timeout and no retry on network-level failure · **Low**

**Evidence:** No `AbortController`/`AbortSignal.timeout()` on any `fetch()` call in `src/tools/sync-blogger.js` or `src/tools/blogger-auth.js` (confirmed via `grep -n AbortController` returning nothing). `fetchWithRetry()` (`sync-blogger.js` lines 364-369) retries a `429`/`5xx` response exactly once after a fixed 500ms delay, but a network-level failure (DNS error, connection reset, TLS failure — `fetch()` rejecting rather than resolving) is not caught by `fetchWithRetry` at all and propagates straight to the outer `try/catch` in `main()`, aborting the whole sync with no retry.

**Impact:** A single transient network blip during a large `listAllPosts` pagination loop, or during any create/update call, ends the entire sync run rather than retrying — acceptable for an occasional batch job (the next push retries the whole thing), but worth knowing as a design choice rather than an oversight if sync flakiness is ever reported.

**Direction:** If flaky syncs become a real complaint, wrap `fetchWithRetry`'s `fetch()` calls in a `try/catch` that also retries on network-level rejection, and add a request timeout via `AbortSignal.timeout(...)`.

Runbooks: `docs/BLOGGER.md`'s "Troubleshooting" section (from `## Troubleshooting` to the end of the file) is the standout piece of operational documentation in this project — it covers every failure mode the code's own `explainBloggerFailure()` recognises, plus additional context (credential drift between the two places they live, the Blogger "Testing" 7-day token expiry trap, Workspace-account Blogger-disabled trap). `docs/BUILD.md` is more reference-style than runbook-style but is proportionate for a deterministic, side-effect-free HTML build with few failure modes.

## Data handling and privacy (DATA)

**Strengths:** The only genuinely sensitive data surface in this project is Blogger OAuth credentials, and it is handled carefully. `.blogger-credentials.json` and its `.blogger-credentials.json.*.tmp` write-in-progress siblings are both gitignored (`.gitignore` lines 11-12). `blogger-auth.js`'s `saveFileMode0600()` (lines 60-84) writes the credentials file mode `0600` via an atomic temp-file-then-rename (using `wx` — `O_CREAT|O_EXCL` — so the temp path can't be a pre-planted symlink), explicitly to guard the refresh token, which "holds ... full blog write access" per `docs/BLOGGER.md` line 85; it also tolerates and reports a permission-denied rewrite over a deliberately read-only existing file rather than silently failing in a misleading way. All Blogger/Google API traffic is confirmed over HTTPS — every endpoint constant (`AUTH_URL`, `TOKEN_URL`, `BLOGGER_API` in both `blogger-auth.js` and `sync-blogger.js`) is an `https://` URL, and both files use the platform `fetch()` (no custom transport that could silently downgrade). The one credentials-shaped file that is committed to the repo, `test/fixtures/blogger-credentials.json`, contains only obviously-fake placeholder values (`fixture-client-id`, `fixture-client-secret`, `fixture-refresh-token`) — checked directly, not assumed. `src/poems/` (example/test poem sources) and other `test/fixtures/` content were checked and contain only framework-authored placeholder/example text, no real personal data. Regulatory exposure (GDPR/CCPA-style) is inapplicable: poem text is user-authored creative content the poet chooses to publish, not personal data about a data subject collected by the tool, and the framework performs no analytics, tracking, or third-party data sharing beyond the poet's own explicit, opt-in Blogger publishing action.

### F-DATA-01 — Credentials file's permission bits aren't re-checked after creation · **Low**

**Evidence:** `src/tools/sync-blogger.js`'s `resolveConfig()` (lines 100-114) reads `.blogger-credentials.json` off disk via `fs.readFileSync` whenever it exists, with no check of the file's current permission bits before trusting its contents.

**Impact:** If something (an editor, a backup tool, a careless `chmod -R`) later widens the file's permissions from the `0600` it was created with, `sync-blogger.js` would silently keep using it rather than warning that the credentials file is more exposed than intended. Low severity — this is a local single-user machine, not a shared/multi-tenant host, and the file is already gitignored so the main exfiltration vector (accidental commit) is closed.

**Direction:** Optional: have `resolveConfig` (or `main()`) `fs.statSync` the file and warn (not block) if its mode is wider than `0600`.

No other findings. Nothing in this codebase writes poem content or credentials to a third-party logging/analytics service, and there is no database or persistent multi-user store whose access-control model would need separate review.

