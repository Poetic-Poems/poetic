# Recommendations

Ordered by severity first, then by effort (quick wins before long campaigns at equal severity). There are no Critical or High findings this window, so nothing is forced into the top of the list by that rule alone; the eight Medium findings still lead. Each recommendation that isn't already covered by a pre-existing tech-debt item has a matching `tech-debt/<id>.md` filed alongside this review (see the register update in `README.md`).

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Fix the OAuth loopback server's unescaped error reflection and missing CSRF check | Medium | Small | F-SEC-01 |
| R-02 | Fix `build-poems.test.js`'s flaky mtime-comparison pattern | Medium | Small | F-TEST-01 |
| R-03 | Add `--help` support across `src/tools/`'s CLIs | Medium | Small | F-UX-01 |
| R-04 | Fix README's YAML round-trip example | Medium | Small | F-DOC-01 |
| R-05 | Document the local dev/test loop for human contributors | Medium | Small | F-TOOL-01 |
| R-06 | Add test coverage for `sync-blogger.js`'s untested orchestration and network helpers | Medium | Medium | F-TEST-03 |
| R-07 | Claim and resolve the tech-debt-ID-allocation race (`TD-PPpoet-26080801`) | Medium | Medium | F-CI-02 |
| R-08 | Simplify `yaml-to-poem.js`'s heading-conversion duplication | Medium | Medium | F-ARCH-02, F-CODE-03 |
| R-09 | De-duplicate path-containment fallback and date-coercion logic | Low | Small | F-CODE-01, F-CODE-02 |
| R-10 | Unit-test `blogger-auth.js`'s OAuth URL construction | Low | Small | F-TEST-02 |
| R-11 | Bump `markdown-it` to v15 | Low | Small | F-DEPS-01 |
| R-12 | Add outbound-call timeouts to `blogger-auth.js` | Low | Small | F-OPS-02 |
| R-13 | Small documentation/config polish batch | Low | Small | F-CI-03, F-CI-04, F-GOV-01, F-DOC-02 |
| R-14 | Make `serve-static.js` importable via a `createServer()` factory | Low | Medium | F-ARCH-01 |
| R-15 | Fix the poem `$ref` caching subsystem's staleness and redundant-parse gaps | Low | Medium | F-PERF-01, F-PERF-02, F-OPS-01 |

`F-DEPS-02` (Node engines floor) and `F-SEC-02`/`F-CI-01`/`F-UX-02`/`F-GOV-02` (deliberate design decisions, confirmations, or judged-proportionate absences) carry no recommendation by design — each explicitly calls for no action at this time, per their findings-document entries.

## R-01 — Fix the OAuth loopback server's unescaped error reflection and missing CSRF check

**Severity:** Medium · **Effort:** Small · **Addresses:** F-SEC-01

**Current state:** `blogger-auth.js`'s `waitForCode()` (`:336-387`) checks the CSRF `state` parameter only on its `code` (success) branch; the `error` branch skips that check and writes the raw `error` query parameter into its HTML response with no escaping.

**Intended end state:** The `error` branch HTML-escapes `error` before interpolating it into the response, and checks `returnedState !== expectedState` the same way the `code` branch does before acting on the request. A test covers the `error` branch's HTML output and its state-mismatch behaviour.

**Approach:** Small, self-contained fix in one function; reuse an existing HTML-escape helper from elsewhere in the codebase (e.g. `aggregate-render-core.js`'s `escapeHtml`) rather than writing a new one.

## R-02 — Fix `build-poems.test.js`'s flaky mtime-comparison pattern

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TEST-01

**Current state:** Two tests in `test/build-poems.test.js` (`:101-123`, `:125-171`) compare an output file's mtime before/after a rebuild without backdating the "before" baseline, the exact shape `TD-PPpoet-26072901` documented and PR #133 fixed in two sibling test files — but not in this one.

**Intended end state:** Both tests rewind the output file's baseline mtime into the past via `fs.utimesSync` before the "before" read, matching `test/poem-to-yaml.test.js`'s/`test/poem-to-raw-cli.test.js`'s pattern exactly.

**Approach:** Mechanical, self-contained; copy the established pattern verbatim.

## R-03 — Add `--help` support across `src/tools/`'s CLIs

**Severity:** Medium · **Effort:** Small · **Addresses:** F-UX-01

**Current state:** `blogger-auth.js` is the only CLI in `src/tools/` that recognises `--help`. `poem-to-yaml.js`/`yaml-to-poem.js` misread it as an input filename and throw `ENOENT`; `build-poems.js`/`poem-to-raw.js`/`sync-blogger.js` silently ignore it and run their default action, including a real build.

**Intended end state:** Every CLI entry point in `src/tools/` recognises `--help`/`-h` ahead of positional-argument parsing and prints its existing usage string with exit code 0, no side effects.

**Approach:** A small shared helper (or a per-tool guard at the top of `main()`) checking `args.includes('--help') || args.includes('-h')` before any file-path handling begins.

## R-04 — Fix README's YAML round-trip example

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DOC-01

**Current state:** README's "Convert to YAML (and back)" example runs `poem-to-yaml.js` on a single file, then `yaml-to-poem.js` against `src/poems/yaml/my-poem.yaml` — a path the single-file conversion never wrote to (it writes alongside its input by default).

**Intended end state:** The example either specifies an explicit output path for the single-file conversion, or drops the single-file variant and leads with `--all` (matching `docs/POEM-TO-YAML.md`, which already gets this right). Running the corrected example end-to-end succeeds when only the commands shown are run, in order.

**Approach:** Documentation-only change; verify by actually running the corrected commands in a scratch directory.

## R-05 — Document the local dev/test loop for human contributors

**Severity:** Medium · **Effort:** Small · **Addresses:** F-TOOL-01

**Current state:** README's "Contributing" section documents the PR/branch-protection process and commit format but never mentions `npm test`, `npm run lint`, `npm run coverage`, `npm run check`, or `npm run check:licenses` — the five things CI actually gates on. These are documented together only in `CLAUDE.md`, which targets AI agents.

**Intended end state:** A short "Local development" subsection (in README or a new `docs/CONTRIBUTING.md`) lists the local commands CI gates on, aimed at a human reader.

**Approach:** Documentation-only; can mirror `CLAUDE.md`'s "Build commands" list.

## R-06 — Add test coverage for `sync-blogger.js`'s untested orchestration and network helpers

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-TEST-03

**Current state:** `getAccessToken`, `listAccessibleBlogs`, `listAllPosts`, `diagnoseBloggerFailure`, and `main()` itself are untested; this code path is exercised for real only in a consumer repo's production Blogger-publish workflow, never in this repo's own CI.

**Intended end state:** At minimum, direct unit tests for the four untested helper functions with `global.fetch` mocked, matching the existing `createPost` test pattern. Ideally, `main()` refactored to accept injectable dependencies (mirroring `build-poems.js`'s `{ poemsDir, publicDir }` override pattern) so a test can drive the full per-poem loop end-to-end.

**Approach:** Start with the lower-cost helper tests; treat the `main()` refactor as optional follow-up if it doesn't fit the same change cleanly.

## R-07 — Claim and resolve the tech-debt-ID-allocation race (`TD-PPpoet-26080801`)

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-CI-02

**Current state:** `TD-PPpoet-26080801`, filed the same day as this review by another agent, already precisely scopes this gap: `scripts/next-tech-debt-id.pl` allocates IDs by scanning, not reserving, so two concurrent writers can be handed the same ID with no CI check catching it. The item's suggested fix (an atomic `reserve-tech-debt-id` script reusing the `td/<id>` claim-branch lock, plus an optional CI guard against unauthorised open-item body rewrites) is already written.

**Intended end state:** No new work from this review beyond confirming, on the record, that `TD-PPpoet-26080801` remains open and accurately describes current code (it does) — this recommendation exists to flag it for pickup via the repo's normal `td/<id>` claiming workflow, not to duplicate its scope in a second item.

**Approach:** Claim `TD-PPpoet-26080801` via the standard workflow (`scripts/get-tech-debt-record.pl`, `td/<id>` branch) rather than filing a competing item.

## R-08 — Simplify `yaml-to-poem.js`'s heading-conversion duplication

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-ARCH-02, F-CODE-03

**Current state:** `convertHtmlToPlainText` (`yaml-to-poem.js:583-688`) is a 124-line, 7-branch dispatcher that has grown by point-fixing specific round-trip bugs (3 tech-debt IDs cited inline); within it, four heading branches (`<h2>`–`<h5>`) are near-identical copy-paste, differing only in tag digit and output level.

**Intended end state:** The four heading branches collapse into one small loop or lookup table (`{ h5: '###', h4: '##', h3: '#', h2: '#' }`) parameterised by tag digit; the broader function structure is otherwise left alone given its strong round-trip test coverage, but a comment notes the accretion pattern for future maintainers considering a larger restructure.

**Approach:** Bundled because both findings are in the exact same function, discovered in the same pass — a positive reason (the dedup fix is a natural side effect of touching this function at all), not merely "both are code-quality."

## R-09 — De-duplicate path-containment fallback and date-coercion logic

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-01, F-CODE-02

**Current state:** `footer.js` and `build-blogger.js` each reimplement "resolve via `safeJoin`, check `isWithinRoot`, fall back" with diverging fallback strategies; `sync-blogger.js` reimplements `date-utils.js`'s `toISODate()` inline, missing its `isNaN` validity guard.

**Intended end state:** A shared `resolveContainedConfigPath(repoRoot, configuredPath, { fallback })` helper in `path-guard.js`, used by both `footer.js` and `build-blogger.js`; `sync-blogger.js`'s inline date branch replaced with `toISODate(raw.date) || ''`.

**Approach:** Bundled because both are small "extract and reuse an existing/shared helper" fixes discovered in the same CODE-dimension pass, not because they touch the same file.

## R-10 — Unit-test `blogger-auth.js`'s OAuth URL construction

**Severity:** Low · **Effort:** Small · **Addresses:** F-TEST-02

**Current state:** `main()`'s consent-URL construction (PKCE challenge/method, state, scopes) is untested; the security-sensitive helper functions it calls are already well-tested individually.

**Intended end state:** A test asserting the OAuth consent URL's query parameters are constructed correctly, without mocking `fetch` or requiring a live OAuth round-trip.

**Approach:** Optional given this script's low usage frequency and out-of-CI nature; do only if convenient alongside other `blogger-auth.js` work (e.g. R-01, R-12).

## R-11 — Bump `markdown-it` to v15

**Severity:** Low · **Effort:** Small · **Addresses:** F-DEPS-01

**Current state:** `package.json` pins `^14.2.0`; v15.0.0 is available. This review's changelog review found none of v15's breaking-change categories reachable from this codebase's actual `MarkdownIt` usage.

**Intended end state:** `markdown-it` at `^15.0.0`, full test suite (including markdown round-trip tests) passing with no rendering-output drift.

**Approach:** Let Dependabot's routine PR handle it, or bump manually; either way, run the full suite before merging given this dependency's role in postscript/analysis rendering.

## R-12 — Add outbound-call timeouts to `blogger-auth.js`

**Severity:** Low · **Effort:** Small · **Addresses:** F-OPS-02

**Current state:** `blogger-auth.js`'s three real network calls use plain `fetch()` with no timeout, unlike `sync-blogger.js`'s shared `fetchWithRetry()` used for the identical Google/Blogger endpoints.

**Intended end state:** The three calls in `blogger-auth.js` bound their hang time via `AbortSignal.timeout()`, reusing or mirroring `sync-blogger.js`'s existing timeout constant. Retry is not required (a one-shot interactive tool where a human can Ctrl-C), only the timeout.

**Approach:** Small, self-contained; extract the timeout wrapper to a shared helper if convenient, but a local copy is acceptable given the low churn risk.

## R-13 — Small documentation/config polish batch

**Severity:** Low · **Effort:** Small · **Addresses:** F-CI-03, F-CI-04, F-GOV-01, F-DOC-02

**Current state:** Four small, independent gaps: no CI/coverage badge on README; no documented rollback/yank path for a bad release; no `.github/PULL_REQUEST_TEMPLATE.md`; `docs/YAML-SCHEMA.md`'s segment-label example shows brackets the real schema doesn't store.

**Intended end state:** A CI status badge added near README's top; a short "if a release is bad" paragraph added to `docs/BUILD.md` or README; an optional PR template added under `.github/`; `docs/YAML-SCHEMA.md`'s example corrected to bracket-free `label:` values matching every other example in the same file.

**Approach:** Bundled as one batch because each item is a standalone, few-line documentation or config addition with no shared code path — reviewing four small diffs together is more efficient than four separate PR round-trips for changes this small.

## R-14 — Make `serve-static.js` importable via a `createServer()` factory

**Severity:** Low · **Effort:** Medium · **Addresses:** F-ARCH-01

**Current state:** `serve-static.js` starts a server as a module-load side effect with no exports, forcing its test suite to compile the file's source into a throwaway `Module`, and forcing production code (the graceful-shutdown handler) to guard against being re-registered on every test's module reload via a global `Symbol`. Open across three consecutive reviews now.

**Intended end state:** `serve-static.js` exports a `createServer(options)` factory that wires routes and signal handlers and returns the server without starting it; `.listen()` is called only under `require.main === module`. The test suite can `require()` the module directly instead of compiling its source.

**Approach:** A refactor with test-suite implications — budget time to update `test/serve-static.test.js` alongside the production change.

## R-15 — Fix the poem `$ref` caching subsystem's staleness and redundant-parse gaps

**Severity:** Low · **Effort:** Medium · **Addresses:** F-PERF-01, F-PERF-02, F-OPS-01

**Current state:** Three related gaps in the same `$ref`-resolution/caching subsystem (`poem-render.js`, `build-all-poems.js`, `serve-static.js`): the incremental-build skip path still fully parses the corpus and its `$ref` graph every run; `collectRefFiles()` re-parses a shared `$ref` target once per referencing poem instead of reusing the shared cache; and `serve-static.js`'s long-running `/all-poems` route never invalidates the process-lifetime `refCache`, so editing a shared partial while the dev server is running serves stale content until restart.

**Intended end state:** `collectRefFiles()` threads the caller's cache into its `yaml.load` calls (fixing the redundant-parse gap directly); the manifest-comparison pass persists the last-known ref graph so an unchanged corpus can skip the parse entirely; and `resolveRefs()` either accepts a request-scoped cache for the live-render path or `serve-static.js`'s `/all-poems` handler calls `clearRefCache()` at the top of the route.

**Approach:** Bundled because all three concern the same caching subsystem and the same underlying `refCache`/`yamlCache` machinery — fixing them in one pass avoids three separate PRs touching the same functions in sequence. If effort needs trimming, the `serve-static.js` staleness fix (F-OPS-01) is the one with user-visible impact and should not be dropped in favour of the two lower-impact PERF items.
