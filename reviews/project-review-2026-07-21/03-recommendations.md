# Recommendations

Ordered by severity first, then by effort (quick wins before long campaigns at equal severity).
Every `Critical` and `High` finding appears in some recommendation's **Addresses** list.

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Fix `docs/BUILD.md`'s three self-contradictions | Critical | Small | F-DOC-01, F-DOC-02, F-DOC-04 |
| R-02 | Fix `docs/QUICKSTART-VIM.md`'s broken paths | High | Small | F-DOC-03 |
| R-03 | Make the postscript "See more" toggle keyboard-operable | High | Small | F-UX-01 |
| R-04 | Document governance reality: solo self-review and bus factor | High | Small | F-GOV-01, F-GOV-02 |
| R-05 | Retire duplicate `RELEASE_NOTES_*.md` files | Medium | Small | F-CI-01, F-GOV-03, F-DOC-05 |
| R-06 | Add regression tests for the fixed XSS surfaces | Medium | Small | F-TEST-01, F-TEST-02 |
| R-07 | Bump the Node `engines` floor past EOL | Medium | Small | F-DEPS-02 |
| R-08 | Fix WCAG AA contrast failures | Medium | Small | F-UX-02 |
| R-09 | Bring `yaml-to-poem.js` back in sync with the current YAML shape | Medium | Medium | F-ARCH-01 |
| R-10 | Split `poem-parser.js` into focused modules | Medium | Large | F-CODE-01 |
| R-11 | Extract duplicated escape-placeholder and beautify-options code | Low | Small | F-CODE-03, F-CODE-04 |
| R-12 | Add a code-coverage tool | Low | Small | F-TEST-03 |
| R-13 | CI hardening: changelog-bump check and strict status checks | Low | Small | F-CI-02, F-CI-03 |
| R-14 | Harden Blogger sync's operational resilience | Low | Medium | F-OPS-01, F-OPS-02, F-PERF-01 |
| R-15 | Add missing documentation cross-references | Low | Small | F-UX-04, F-DOC-06 |
| R-16 | Small defensive-hardening batch (config, dev server) | Low | Small | F-ARCH-02, F-SEC-01, F-SEC-02, F-DATA-01 |
| R-17 | Quote-style lint rule and JSDoc completion | Low | Medium | F-CODE-02, F-CODE-05 |
| R-18 | Miscellaneous small fixes | Low | Small | F-UX-03, F-TOOL-01, F-UX-05, F-DEPS-04 |

## R-01 — Fix `docs/BUILD.md`'s three self-contradictions

**Severity:** Critical · **Effort:** Small · **Addresses:** F-DOC-01, F-DOC-02, F-DOC-04

**Current state:** `docs/BUILD.md` describes the main build script's title/date/audio extraction as scanning `public/` HTML files — a superseded (v0.1) implementation contradicted by the current code's own header comment and by `build-all-poems.js` actually sourcing from `src/poems/yaml/`. The same file also names the Blogger template `fragments-and-unity.template.html` in three places while its own config-key table (and the code) calls it `blogger-template.html`, and its file-structure diagram spells the shared-poem partial `_shared.poem` when the real file (and the rest of the same document) uses `.shared.poem`.

**Intended end state:** `docs/BUILD.md`'s "Main Build Script" section accurately describes the current in-memory, YAML-sourced rendering pipeline; every reference to the Blogger template file reads `blogger-template.html`; the file-structure diagram reads `.shared.poem`. No internal contradiction remains within the file.

**Approach:** Read `src/tools/build-all-poems.js` and `src/tools/build-blogger.js` top-to-bottom to describe their actual current behaviour, then rewrite the three affected passages. Cross-check against `docs/BLOGGER.md` (already correct) so both docs agree. This is a docs-only change with no code risk — a single small PR.

## R-02 — Fix `docs/QUICKSTART-VIM.md`'s broken paths

**Severity:** High · **Effort:** Small · **Addresses:** F-DOC-03

**Current state:** The quickstart references a `./vim/install.sh` path and a `src/poems/_example.poem` file, neither of which exist; the real paths are `editors/vim/install.sh` and `src/poems/poem/_example.poem`. Every sibling doc (README, CLAUDE.md, `docs/VIM-SYNTAX.md`) already uses the correct `editors/vim/` path — this file alone appears to predate a directory move.

**Intended end state:** Every path in `docs/QUICKSTART-VIM.md` (install script, example poem, file-structure diagram, "Complete Documentation" pointer) matches the actual repository layout, and the documented "30 second" install actually completes without a "no such file or directory" error.

**Approach:** Update the four affected line groups (lines 9, 12, 20, 93, 98-105 per the finding) to `editors/vim/...` and the correct example-poem path. Verify by literally running the quickstart's commands from a clean checkout.

## R-03 — Make the postscript "See more" toggle keyboard-operable

**Severity:** High · **Effort:** Small · **Addresses:** F-UX-01

**Current state:** `src/templates/_poem-content.pug` implements the postscript preview's show/hide with a `display: none` checkbox and a `<label for=...>` — a pattern that cannot receive keyboard focus in any browser, so keyboard-only and many screen-reader users cannot expand a postscript preview at all. This is the same WCAG 2.1.1 (Keyboard) violation class the prior review fixed for sort headers (`f3b98c5`), recurring in a different component that was out of that fix's scope.

**Intended end state:** The postscript toggle is operable via keyboard alone (Tab to reach it, Enter/Space to activate) and communicates its expanded/collapsed state to assistive technology, matching the pattern already used for the analysis and song-embed controls in the same template.

**Approach:** Replace the hidden-checkbox/label pattern with a real `<button aria-expanded="false">` wired to a small script toggling a CSS class, mirroring `src/templates/_poem-content.pug:120-137,166-190`'s existing analysis/song-embed toggles. Add a regression test asserting the rendered markup contains a focusable, `aria-expanded`-bearing control rather than a `display:none` input.

## R-04 — Document governance reality: solo self-review and bus factor

**Severity:** High · **Effort:** Small · **Addresses:** F-GOV-01, F-GOV-02

**Current state:** `main`'s branch protection requires code-owner review, and `CODEOWNERS` names two GitHub handles — but both belong to the same person (one email throughout git history), so every PR's review gate is satisfied by its own author switching accounts, not by independent review. The same person is the sole admin and 100% of human-authored commit history. `CLAUDE.md`'s multi-agent tooling (claim branches, dedicated clones) solves agent concurrency but doesn't address this: it reads as more redundancy than actually exists.

**Intended end state:** `CLAUDE.md` and/or `SECURITY.md` state plainly that this is a solo-maintainer project where review is currently self-review by design, so a reader (human or agent) doesn't infer independent peer review where none exists. Optionally, a succession/backup statement (even "none, by design") is added.

**Approach:** This is a documentation-honesty fix, not a process overhaul — add a short, direct paragraph to `CLAUDE.md`'s "Branch workflow" section and/or `SECURITY.md` naming the current reality. If a second independent human reviewer becomes available, revisit; that is a larger, separate decision outside this recommendation's scope.

## R-05 — Retire duplicate `RELEASE_NOTES_*.md` files

**Severity:** Medium · **Effort:** Small · **Addresses:** F-CI-01, F-GOV-03, F-DOC-05

**Current state:** Three root-level `RELEASE_NOTES_vX.Y.Z.md` files duplicate `CHANGELOG.md` content in different prose, contradicting `CLAUDE.md`'s explicit "CHANGELOG.md is the only place for recording what changed and when" policy and its "as-built only" documentation principle. They were only created for 3 of the project's releases (not v6.0.0 or earlier), and `RELEASE_NOTES_v6.1.1.md` already shows the exact kind of drift-prone historical narrative the policy exists to prevent. This same underlying issue was independently surfaced from the CI, governance, and documentation angles — one root cause, three findings.

**Intended end state:** Either the three files are removed (their content, where still relevant, folded into `CHANGELOG.md` or left to the GitHub Releases tab, which already auto-generates release bodies via `release.yml`'s `--generate-notes`), or, if they serve a distinct declared purpose, that purpose is stated explicitly in `CLAUDE.md` so the practice isn't three orphaned files with no documented role.

**Approach:** Default to removal (simplest, matches the stated policy). `git rm` the three files; confirm nothing else references them (`grep -rn RELEASE_NOTES` should only find the files themselves before removal). No further release should create a new one unless `CLAUDE.md` is updated to declare the practice intentional.

## R-06 — Add regression tests for the fixed XSS surfaces

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TEST-01, F-TEST-02

**Current state:** Two previously-fixed high-severity CodeQL XSS alerts — stored XSS in `serve-static.js`'s directory listing (commit `3eb8bd9`) and DOM XSS in `public/index.js`'s poem-card rendering (commit `8e4d6ac`) — were verified manually in their fix PRs but never got automated regression tests. `serve-static.js` in particular has zero test coverage of any kind.

**Intended end state:** `test/serve-static.test.js` exists and exercises `escapeHtml`/`encodeHref`/`generateDirectoryListing` directly with filenames containing `<script>`, `"`, `&`, `'`; a jsdom-based (or equivalent) test exercises `public/index.js`'s `renderPoems()`/`appendTitleHtml` with a hostile title and asserts it renders as text, not markup.

**Approach:** For `serve-static.js`, unit-test the exported helpers directly (no need to spin up a real HTTP server). For `public/index.js`, add `jsdom` as a dev dependency if a lightweight DOM is needed, or refactor the assertion to operate on the constructed DOM nodes directly without a full jsdom environment if feasible. Run `npm test` to confirm both pass and would fail against the pre-fix code (verify by temporarily reverting the relevant fix commit locally).

## R-07 — Bump the Node `engines` floor past EOL

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DEPS-02

**Current state:** `package.json`'s `engines.node` is `>=18`, and the README's prerequisite says "Node.js 18 or later" — but Node 18 has been EOL since 2025-04-30 and Node 20 since 2026-04-30, while CI itself already runs on Node 22. Nothing warns a new contributor away from installing an EOL runtime.

**Intended end state:** `engines.node` reads `>=22` (matching CI), the README prerequisite is updated to match, and installing with an older Node produces at least an `npm` warning (via `engine-strict` in `.npmrc`, optional but recommended).

**Approach:** Update both files; add `.npmrc` with `engine-strict=true` if enforcement (not just advisory) is wanted. Re-run `npm ci`/`npm test` to confirm nothing in the toolchain actually depends on a lower floor.

## R-08 — Fix WCAG AA contrast failures

**Severity:** Medium · **Effort:** Small · **Addresses:** F-UX-02

**Current state:** `public/poetic.css` uses `gray` (#808080, ≈3.95:1) for the poem byline, `#999` (≈2.85:1) for the site footer and two other text roles, and `#007AFF` (≈4.0:1) for several links/text — all below the WCAG AA 4.5:1 threshold for normal text, affecting every published page site-wide.

**Intended end state:** `.poem-info`, `.poetic-footer`, `.no-content`, `.filter-empty`, and the `#007AFF` text/link uses all meet at least 4.5:1 contrast against their background.

**Approach:** Darken the greys to `#767676` or better (a commonly-cited AA-safe grey on white); adjust `#007AFF` slightly or restrict its use to large-text/UI-component contexts where 3:1 is sufficient. Verify with a contrast checker against the actual computed colours, then visually confirm the rendered pages still read as intended (`npm run build && npm start`).

## R-09 — Bring `yaml-to-poem.js` back in sync with the current YAML shape

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-ARCH-01

**Current state:** `yaml-to-poem.js` silently drops object-form audio params, `segment.parts` (mixed WYSIWYG/embedded-block segments), and all `labels`/`directives` metadata when converting YAML back to `.poem` source — none of which `poem-parser.js`'s current output shape omits. No test exercises this seam with these shapes.

**Intended end state:** `yaml-to-poem.js` either round-trips every shape `poem-to-yaml.js` currently produces, or explicitly errors/warns on any it can't serialise (never silent data loss). A round-trip test (`.poem`→YAML→`.poem`→YAML, asserting the two YAML documents match) covers params, mixed parts, object-form audio, and labels/directives across the poem corpus.

**Approach:** Read `poem-parser.js`'s current output shape for each of the four gaps (audio param objects, `segment.parts`, `params`, `labels`/`directives`) and extend the corresponding `yaml-to-poem.js` writer functions to handle them, or add an explicit unsupported-shape error. Add the round-trip test mirroring `test/browser-render.test.js`'s approach for the browser/Node seam. This touches core conversion logic — verify against the full `src/poems/` corpus, not just new test fixtures.

## R-10 — Split `poem-parser.js` into focused modules

**Severity:** Medium · **Effort:** Large · **Addresses:** F-CODE-01

**Current state:** `src/tools/poem-parser.js` is a single 1854-line file with one `PoemParser` class implementing the entire `.poem` grammar (comments, line continuation, variables, header/version/segment parsing, audio, metadata, markup conversion) as ~50 methods sharing mutable instance state. It is more than 3x the size of the next-largest hand-written tool file.

**Intended end state:** The parsing responsibilities are split across a small number of focused modules (e.g. variable substitution, markup conversion, metadata/label parsing) following the pattern already established by `render-core.js`/`aggregate-render-core.js` extracting shared pure logic — without changing the parser's external behaviour or public API.

**Approach:** This is a pure internal refactor with no behaviour change, so the existing 493-test suite (particularly the poem-parser and golden tests) is the safety net: refactor incrementally, running `npm test` after each extraction, and do not touch grammar semantics in the same change. Given the size, expect this as a multi-PR effort rather than one large diff; each extraction (e.g. "extract variable substitution") can be its own small, independently reviewable PR per this repo's stated branch-workflow preference.

## R-11 — Extract duplicated escape-placeholder and beautify-options code

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-03, F-CODE-04

**Current state:** The `\x00ESCAPE<n>\x00` placeholder-protect/restore technique is implemented independently (and cross-referenced by comment) in both `poem-parser.js`'s `convertMarkup()` and `render-core.js`'s `renderTitleMarkup()`. Separately, the identical `js-beautify` options object is copy-pasted three times across `build-poems.js` and `build-all-poems.js`.

**Intended end state:** One shared helper implements the placeholder-protect/restore mechanism, called from both sites; one shared `BEAUTIFY_OPTIONS` constant is referenced from all three call sites.

**Approach:** Both are small, mechanical extractions suited to one focused PR. Add the shared helper/constant to an existing shared module (`render-core.js` for the escape helper; `repo-root.js` or a new small shared module for the beautify options) and update call sites. Run `npm test` to confirm the golden/snapshot tests still pass byte-for-byte.

## R-12 — Add a code-coverage tool

**Severity:** Low · **Effort:** Small · **Addresses:** F-TEST-03

**Current state:** No coverage tool is configured; coverage is only estimated by inspection, which is how gaps like F-TEST-01 (a whole file with zero test references) had to be found manually in this review.

**Intended end state:** `npm run coverage` (or similar) produces a coverage report using Node's built-in test runner, requiring no additional test-framework migration.

**Approach:** Add `c8` as a dev dependency and a script (`c8 node --test`); no CI coverage-floor gate is required initially — just visibility. Optionally wire a summary into CI output.

## R-13 — CI hardening: changelog-bump check and strict status checks

**Severity:** Low · **Effort:** Small · **Addresses:** F-CI-02, F-CI-03

**Current state:** Nothing in CI verifies that a `package.json` version bump comes with a matching `CHANGELOG.md` entry (it has worked so far by manual discipline alone); `main`'s branch protection does not require a PR branch to be up to date with `main` before merging (`strict_required_status_checks_policy: false`).

**Intended end state:** A CI check fails a release PR if `package.json`'s version changed but `CHANGELOG.md` has no corresponding diff. Optionally, strict status checks are enabled once branch lifetimes or PR volume make stale-branch merges a real risk.

**Approach:** Add a small script/step to `release.yml` (or a new lightweight workflow) comparing the version-bump commit's diff for both files. Enabling strict status checks is a one-line ruleset change but has a wider blast radius (could block a rebase-shy contributor) — treat as optional and lower priority than the changelog check.

## R-14 — Harden Blogger sync's operational resilience

**Severity:** Low · **Effort:** Medium · **Addresses:** F-OPS-01, F-OPS-02, F-PERF-01

**Current state:** `sync-blogger.yml` has no job `timeout-minutes`; `sync-blogger.js`'s `fetch()` calls have no request timeout and don't retry on network-level failure (only on `429`/`5xx` HTTP responses); the sync loop posts poems strictly sequentially with no concurrency, so a large collection's first sync could take a long time.

**Intended end state:** The sync job has a sensible timeout backstop; outbound requests have a timeout and retry transient network failures, not just HTTP error statuses; poem posting has bounded concurrency for large collections.

**Approach:** Add `timeout-minutes: 15` (or similar) to `sync-blogger.yml`'s job. Wrap `fetchWithRetry`'s `fetch()` calls in a `try/catch` that also retries on rejection, and add `AbortSignal.timeout(...)`. Add a small worker-pool (e.g. process N poems concurrently) to the `main()` loop only if sync runtimes are actually observed to be a problem — this part is the lowest-priority piece of this recommendation and can be deferred.

## R-15 — Add missing documentation cross-references

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-04, F-DOC-06

**Current state:** README.md never mentions the `poetic/browser` library export or `docs/RENDERER-BROWSER.md`, despite it being a real, tested, documented public API surface. `docs/POEM-TO-YAML.md` doesn't mention the incremental-rebuild/`--force` skip behaviour that applies to the script it documents (`docs/BUILD.md` covers it, but a reader of the narrower doc alone would miss it).

**Intended end state:** README links to `docs/RENDERER-BROWSER.md` alongside its other doc links; `docs/POEM-TO-YAML.md` has a short cross-reference to the incremental-rebuild mechanism and `--force`.

**Approach:** Two small, independent doc additions — a couple of sentences each. No code changes.

## R-16 — Small defensive-hardening batch (config, dev server)

**Severity:** Low · **Effort:** Small · **Addresses:** F-ARCH-02, F-SEC-01, F-SEC-02, F-DATA-01

**Current state:** Four small, independent hardening gaps: `poetic-config.js`/`sync-blogger.js` silently coerce an invalid enum config value to its default with no warning; `serve-static.js` sets a wildcard CORS header even when bound to loopback; `song-handlers.js` builds a `RegExp` from consumer config with no ReDoS/timeout guard (low priority — config is self-authored, not an external trust boundary); `sync-blogger.js` never re-checks the Blogger credentials file's permission bits after creation.

**Intended end state:** An invalid enum config value produces a warning (matching the existing `blog_id` precedent); the dev server's CORS header is scoped to loopback (or omitted) unless `--host 0.0.0.0` is explicitly passed; the credentials file's mode is checked and a warning issued if it's wider than `0600`. The config-regex ReDoS guard is explicitly deferred (not part of this recommendation's acceptance criteria) unless the config source's trust model changes.

**Approach:** Four small, independent one-line-to-a-few-lines changes suited to a single focused PR given their combined triviality. Each can be verified with a small targeted unit test (invalid enum value logs a warning; CORS header absent/scoped when loopback-bound; credentials file with widened permissions logs a warning).

## R-17 — Quote-style lint rule and JSDoc completion

**Severity:** Low · **Effort:** Medium · **Addresses:** F-CODE-02, F-CODE-05

**Current state:** No `quotes` ESLint rule is configured, and string-quote style drifts by file (some files consistently double-quoted, others consistently single-quoted). JSDoc (`@param`/`@returns`) discipline is inconsistent — thorough in newer modules like `sync-blogger.js`, sparse in `poem-parser.js` despite it being the highest-complexity file.

**Intended end state:** A `quotes` rule is added to `eslint.config.js` (pick either style, or `avoidEscape`) and the codebase reformatted to comply; `poem-parser.js`'s methods carry `@param`/`@returns` tags matching the standard already established elsewhere.

**Approach:** The lint-rule half is small and mechanical (`eslint --fix` after adding the rule, verify no behaviour change via `npm test`). The JSDoc half is larger (~50 methods) and lower urgency — treat as ongoing polish to apply opportunistically when next touching `poem-parser.js`, rather than a single dedicated pass.

## R-18 — Miscellaneous small fixes

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-03, F-TOOL-01, F-UX-05, F-DEPS-04

**Current state:** Four small, independent, low-priority gaps: standalone poem pages have no `<h1>` (only `h2.poem-title`); `editors/vim/ftdetect/poem.vim` still has an unfilled `(maintainer name)` placeholder and a stale `Last Change` date; the browser-renderer library surfaces plain, unclassified `Error` objects with no `.code`; `scripts/sync-framework.sh` overwrites a consumer's `package.json`/`package-lock.json` wholesale with no callout warning about custom edits being clobbered.

**Intended end state:** Poem pages have a proper heading hierarchy (an `h1`, or a documented rationale for `h2`); the vim ftdetect file's maintainer/date fields are filled in and current; `docs/SCRIPTS.md` warns to review the staged diff carefully if the consumer has customised `package.json`. The browser-renderer error-class item is optional/deferred (only worth doing if a real consumer needs to branch on error type).

**Approach:** Four small, independent one-off fixes with no shared theme beyond "trivial and low priority" — suited to a single cleanup-pass PR. No behaviour-changing risk beyond the heading-level change, which should be visually spot-checked after `npm run build`.
