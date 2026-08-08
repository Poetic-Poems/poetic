# Findings

All findings below were independently re-verified against current code this session (not carried over from prior reviews on trust). Four are marked **Informational**: a documented, deliberate design decision rather than a defect, or a confirmation that a prior finding is now fully resolved — these are excluded from the severity tally.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 8 |
| Low | 16 |

## Architecture and design (ARCH)

**Strengths:** No circular dependencies anywhere in `src/tools` (`madge --circular` on 30 files: clean). The single-poem/aggregate rendering split (`render-core.js` vs. `aggregate-render-core.js`) is a genuine, well-documented boundary, not duplication — both carry explicit "keep this browser-safe" headers, and `test/browser-render.test.js`/`test/browser-render-aggregate.test.js` assert byte-for-byte parity across the whole poem corpus, a real end-to-end seam test. `sync-blogger.js`, despite 1040 lines, is not a god object: `main()` (~124 lines) is a thin orchestrator over ~25 independently exported, independently testable functions. The riskiest cross-tool seam in the repo — `poem-to-yaml.js` / `yaml-to-poem.js`, given this window's round-trip-fidelity commit volume (PRs #143, #144, #147, #148) — is genuinely exercised end-to-end by `test/yaml-to-poem.test.js` and `test/yaml-to-poem-roundtrip.test.js`. Config/secrets handling is architecturally sound: Blogger credentials come from env vars or a gitignored, mode-0600 file, and every config-driven filesystem path is routed through shared `path-guard.js` containment primitives, including a symlink-aware `realpath` check. The last review's F-ARCH-01 (`yaml-to-poem.js --all`'s dead-code directory bug) is confirmed fixed.

### F-ARCH-01 — `serve-static.js` still has no importable `createServer()`; production code carries a workaround whose only purpose is its own test suite · **Low**

**Evidence:** `src/tools/serve-static.js` has no `module.exports`. `directoryExists(ROOT_DIR)`/`process.exit(1)` (lines 224-227) and `http.createServer(...)` (line 229) both run as module-load side effects. `test/serve-static.test.js:65` still compiles the file's source into a throwaway `Module` object per test instead of `require`-ing it. The graceful-shutdown handlers are keyed off `Symbol.for('poetic.serveStatic.shutdownHandlers')` on the global `process` object (`:399-411`) purely so re-loading the module per test replaces rather than accumulates `SIGINT`/`SIGTERM` listeners. Third consecutive review carrying this finding (previously F-ARCH-02, addressed by R-10).

**Impact:** Proportionate today, but every feature this module has grown has invented a new testability workaround rather than the module becoming importable.

**Direction:** Extract a `createServer(rootDir, opts)` factory returning `{ server, close }`. Addressed by R-14.

### F-ARCH-02 — `yaml-to-poem.js`'s HTML→Markdown reconversion is a hand-rolled, regex-driven subsystem that has grown almost entirely through point-fixes for specific round-trip bugs · **Medium**

**Evidence:** `convertHtmlToPlainText` (`src/tools/yaml-to-poem.js:583-688`, ~124 lines) is a block-by-block dispatcher with 7 branches, each guarded by dense prose explaining a specific historical bug it exists to prevent — comments cite `TD26072401`, `TD26072502`, and `TD-PPpoet-26080201` by ID inline. `splitParagraphRun` documents that an earlier, simpler regex was CodeQL-flagged for catastrophic backtracking and rewritten as a manual scan.

**Impact:** Well-mitigated by strong round-trip test coverage, so not an active bug — but the pattern (bespoke logic, patched reactively, 3 TD IDs deep already) is the shape that tends to keep finding new edge cases (nested lists explicitly fall through to a "verbatim passthrough" fallback).

**Direction:** No urgent action; addressed by R-08 (collapse the four near-duplicate heading branches; monitor whether the next round-trip bug is better spent hardening incrementally or restructuring).

## Code quality and maintainability (CODE)

**Strengths:** Zero `TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `src/`, `scripts/`, or `test/`. `npm run lint` is clean; `eslint.config.js` documents every rule relaxation with its rationale, matching actual usage. Error handling is consistently deliberate rather than swallowed (~50 catch sites sampled, none silently discarding). `path-guard.js`'s containment logic is small, single-purpose, and heavily commented on the *why*. Naming and module layout are consistent; no stray `var` usage in hand-written code.

### F-CODE-01 — Path-containment-with-fallback logic remains duplicated between `footer.js` and `build-blogger.js`, and has diverged further since the last review flagged it · **Low**

**Evidence:** `footer.js:48-60` and `build-blogger.js:49-86` each independently reimplement "resolve via `safeJoin`, check `isWithinRoot`, warn-and-fall-back" with different shapes — `footer.js` has one fallback, `build-blogger.js` now has a four-tier cascade. Unfixed since last review's F-CODE-01; the gap has widened, not narrowed.

**Impact:** Nothing structurally prevents the next edit to one from silently not being mirrored in the other.

**Direction:** Addressed by R-09: a shared `resolveContainedPath()`-shaped helper in `path-guard.js`.

### F-CODE-02 — `Date`-vs-string coercion for a YAML-parsed `date` field is still reimplemented ad hoc in `sync-blogger.js`, missing the `isNaN` guard its sibling implementations carry · **Low**

**Evidence:** `date-utils.js`'s `toISODate()` (lines 66-83) guards with `isNaN(dateStr.getTime())`. `sync-blogger.js:936-940` reimplements the coercion inline without that guard — `new Date(...).toISOString()` throws a `RangeError` on an invalid `Date` instead of degrading gracefully. Unchanged from last review's F-CODE-03.

**Impact:** Low practical risk, but the third independent reimplementation of this coercion, and the one without the safety guard the others have.

**Direction:** Addressed by R-09: replace with a call to `toISODate()`.

### F-CODE-03 — Four near-identical heading branches in `convertHtmlToPlainText` are copy-pasted, differing only in tag name and output level · **Low**

**Evidence:** `src/tools/yaml-to-poem.js:605-616` has four consecutive branches for `<h5>`/`<h4>`/`<h3>`/`<h2>` — h2 and h3 both collapse to a single `#`, an asymmetry easy to miss as intentional vs. a copy-paste slip.

**Impact:** A future change to heading detection has four call sites to update in lockstep.

**Direction:** Addressed by R-08 (bundled with F-ARCH-02, same function): collapse into a small loop/lookup table.

## Security (SEC)

**Strengths:** No live secrets anywhere in tracked files or `git log --all -p` — only obviously-fake fixture tokens. `npm audit` (root and `--omit=dev`) both report 0 vulnerabilities. The sole `child_process.execSync` uses run two fixed, non-interpolated git plumbing commands — no user input reaches the shell. `render-core.js`/`aggregate-render-core.js` implement careful escape-first title handling, including JSON-embedding-safe `<` escaping. `SECURITY.md` is current and names a private disclosure route. CodeQL runs on every PR/push plus weekly. `serve-static.js` binds to `127.0.0.1` by default with a safe, documented opt-in for LAN exposure. The last review's continuity item, `TD-PPpoet-26072801` (path-guard.js's symlink gap), is confirmed resolved and accurately recorded — `isWithinRoot()` now does `realpathSync`-based re-resolution after the lexical check, at all four call sites. The PKCE+CSRF OAuth flow, masked credential prompts, and atomic 0600 credential writes in `blogger-auth.js` all still hold on re-inspection.

### F-SEC-01 — `blogger-auth.js`'s OAuth loopback server reflects an unauthenticated `error` query parameter into an HTML response, and skips the CSRF `state` check on that path · **Medium**

**Evidence:** `src/tools/blogger-auth.js:336-387` (`waitForCode`). The `code` branch checks `returnedState !== expectedState` (lines 356-362); the `error` branch (lines 345-351) does not, and writes the raw parameter into the response body unescaped: `res.end(\`<html>...<p>${error}</p>...\`)`. The server binds to `127.0.0.1` but accepts any GET request matching the URL shape from any local process during the short auth window, so a local attacker could send `GET /?error=<img src=x onerror=alert(1)>` — no `state` needed — get it reflected, and abort the flow. `test/blogger-auth.test.js:78-92` doesn't cover the `error` branch's HTML output.

**Impact:** Bounded by the loopback bind and the flow's short, one-shot lifetime, so this does not reach the "harm escapes the project's boundary" tier — but it is a real, unauthenticated reflected-XSS-plus-flow-hijack in a script whose entire job is guarding OAuth credentials, and the CSRF check exists on one branch but not the other.

**Direction:** Addressed by R-01: HTML-escape `error` before interpolating, and apply the same `state` check to the `error` branch.

### F-SEC-02 — `markdown.js`'s renderer runs with `html: true` (raw author HTML passes through unsanitised) — a deliberate, documented trust boundary, not a defect · **Informational**

**Evidence:** `src/tools/markdown.js:10-13,29` configures `html: true` with an explicit "the sole author is trusted; no sanitisation is performed" comment, feeding only the analysis/postscript sections, not the poem body.

**Impact:** Not a vulnerability given the project's trust model (a poem author publishing their own static site) — analogous to any static-site generator's own-author content.

**Direction:** None needed now.

## Testing and quality assurance (TEST)

Fresh full-suite run this session: 703 tests, 699 pass, 0 fail, 4 skipped, 85.36% lines / 83.48% branches / 93.1% funcs — above the CI-enforced 80/79/88 floor.

**Strengths:** Test volume (~10,200 lines) is close to 1:1 with source and spans a genuine mix of kinds: unit, golden/snapshot, round-trip fixture, mocked-`fetch` integration, and hermetic subprocess-driven integration tests building throwaway git repos. No real external network calls anywhere in the suite. Riskiest-path coverage is strong: `path-guard.js` is 100% covered with its own 9-case file; the OAuth PKCE/state/CSRF primitives are directly tested; every `sync-blogger.js` pure helper plus its create/update/draft/delete decision logic is exercised via mocked-`fetch` tests. The local workflow (`npm run test:watch`, single-file subsetting) works as documented. The last review's F-TEST-02 (`build-blogger.js` orchestration untested) is confirmed resolved by PR #149 — coverage there is now 96.59% lines / 100% funcs, up from 59.21%.

### F-TEST-01 — `test/build-poems.test.js`'s mtime-comparison tests still don't backdate the output baseline, unlike the sibling files PR #133 fixed · **Medium**

**Evidence:** Both tests in question (`:101-123`, `:125-171`) already backdate the *input* mtime (since PRs `a84e929`/`576788c`), but neither backdates the *output* file's `mtimeBefore` baseline the way `test/poem-to-yaml.test.js:118-120` and `test/poem-to-raw-cli.test.js:127-129` do. `pageMtimeBefore` is still captured from a real, non-backdated wall-clock mtime, then compared with a strict `>` moments later — exactly the shape `TD-PPpoet-26072901` documented as flaking "roughly one run in three to five locally (WSL2)" in the two files that item's linked PR fixed. `TD-PPpoet-26072901` itself only covers `poem-to-raw`/`poem-to-yaml`, not `build-poems.test.js`.

**Impact:** Same class of intermittent CI/local failure `TD-PPpoet-26072901` already documented and fixed elsewhere, left open in one more file.

**Direction:** Addressed by R-02: apply the identical `fs.utimesSync`-backdating pattern.

### F-TEST-02 — `blogger-auth.js`'s network-calling helpers and `main()` orchestration remain untested · **Low**

**Evidence:** `test/blogger-auth.test.js` covers 6 of 10 exported functions. `parseArgs`, `exchangeCodeForTokens`, `lookupBlogId`, `listMyBlogs`, and all of `main()` are untested. Coverage: 49.83% lines, 57.14% funcs. Every security-sensitive primitive (PKCE, CSRF state, masked prompt, atomic 0600 write) remains directly tested — a one-off interactive script invoked from no CI workflow.

**Impact:** Low real-world risk given this is manually-invoked and non-CI.

**Direction:** Addressed by R-10: test the OAuth consent URL's query-parameter construction without mocking `fetch`.

### F-TEST-03 — `sync-blogger.js`'s `main()` and the network helpers only it calls are untested, and this repo's own CI never exercises that path · **Medium**

**Evidence:** `sync-blogger.js` exports 20 functions; `test/sync-blogger.test.js` covers 15. Untested: `getAccessToken`, `listAccessibleBlogs`, `listAllPosts`, `diagnoseBloggerFailure`, and `main()` itself. Fresh coverage: 80.96% lines / 81.48% funcs, uncovered ranges landing exactly on this set. Unlike `build-poems.js`'s/`build-all-poems.js`'s untested `main()` bodies (both invoked by the required `build` CI step, an effective smoke test), `sync-blogger.js`'s `main()` runs only via `.github/workflows/sync-blogger.yml`, which this framework repo's own absent `.poetic-config.yaml` never enables — the code path only runs for real in a consumer repo's production publish.

**Impact:** A regression in this untested glue — e.g. the ad hoc date coercion in F-CODE-02 — would not be caught here, surfacing first as a broken publish against a real blog in a consumer repo.

**Direction:** Addressed by R-06: refactor `main()` to accept injectable dependencies (mirroring `build-poems.js`'s pattern), or at minimum add direct unit tests for the four untested helpers with mocked `fetch`.

## Dependencies and supply chain (DEPS)

**Strengths:** Still only 4 production dependencies, each load-bearing. `package-lock.json` committed, `npm ci` reproducible (188 packages, 0 vulnerabilities). `npm run check:licenses` passes against all 77 production packages. Dependabot covers `npm` + `github-actions` weekly, evidenced by PR #153/#154 (brace-expansion DoS bump).

### F-DEPS-01 — `markdown-it` remains one major behind (14.3.0 → 15.0.0); repo's usage looks unaffected by v15's breaking changes · **Low**

**Evidence:** `package.json:21` pins `^14.2.0`. v15's breaking changes (removed subpath exports, `linkify-it` v6 defaults, `validateLink`/`normalizeLink` moved to prototype, ESM/CJS resolution) don't reach this codebase's usage: `src/tools/markdown.js:21-29` sets no `linkify` option, no subpath import, no `validateLink`/`normalizeLink` override.

**Impact:** Low — not blocked, simply not yet done; should be validated against the test suite rather than assumed safe from static review alone.

**Direction:** Addressed by R-11: bump to `^15.0.0`, run `npm test` + `npm run build`.

### F-DEPS-02 — `engines.node` floor (`>=22`) unchanged; no new information invalidates last review's "no action needed" call · **Low**

**Evidence:** Both CI workflows pin `"22"`. No `.nvmrc`/`.tool-versions`. Node 22 remains Maintenance LTS.

**Impact:** Not urgent.

**Direction:** No action needed now; revisit near EOL.

## Tooling and developer experience (TOOL)

**Strengths:** The clone-to-running path works exactly as README/CLAUDE.md describe (`npm install` → `npm run build` → `npm test`, traced this session). `.editorconfig` carve-outs are thoughtfully documented. `eslint.config.js` runs clean. `scripts/setup-linux.sh` solves a real WSL/nvm PATH-shadowing problem. `editors/vim/` ships genuine editor support (syntax, ftdetect, install script, own README). `scripts/new-poem`/`edit-poem` are real local-dev affordances.

### F-TOOL-01 — README's "Contributing" section still never tells a human contributor to run tests, lint, or coverage locally · **Medium**

**Evidence:** `README.md:327–358` covers PR/branch-protection process and commit format, but a full-text grep for `npm test`/`npm run lint`/`npm run coverage`/`npm run check`/`check:licenses` returns zero matches. No `CONTRIBUTING.md` exists. These five commands remain documented together only in `CLAUDE.md:44-48`, written for AI agents. Unchanged from the 2026-07-31 review's F-TOOL-01; no PR since has touched this.

**Impact:** Not a hard blocker (CI catches it within a minute), but a human contributor's first PR iteration routinely surfaces failures a two-line note would have caught locally. Open three review cycles running.

**Direction:** Addressed by R-05: a short "Local development" subsection in README or a new `docs/CONTRIBUTING.md`.

*(F-TOOL — no CI/coverage badge — is the same fact independently found by the CI+GOV pass; recorded once as F-CI-03 below, not duplicated here.)*

## CI/CD and release engineering (CI)

**Strengths:** All 6 required status checks on the live branch ruleset resolve to real, present, correctly-named jobs — no drift between ruleset and workflow files. `build-poems.yml`/`release.yml` correctly avoid the "skipped but required checks" trap by omitting `paths:` filters and checking relevance inside the job. `commit-format.yml`/`tech-debt-register.yml` correctly use `pull_request`, not `pull_request_target`. Every job in all 7 workflows sets `timeout-minutes`. `release.yml` matches CLAUDE.md's documented release process exactly. `perl scripts/td-check.pl`: 76 items, 1 open / 73 resolved / 2 not-debt, consistent. Zero open PRs, zero open issues.

### F-CI-01 — `TD-PPpoet-26080101`'s register-drift resolution verified accurate · **Informational**

**Evidence:** Independently confirmed: `RULESET-CHANGELOG-CHECK.md` no longer exists, and `docs/TECH-DEBT-REGISTER.md`'s "Consistency gate" section documents exactly the claimed manual drift-check process.

**Impact:** None — the prior review's F-CI-01 is now fully closed.

**Direction:** No action needed.

### F-CI-02 — `TD-PPpoet-26080801` (tech-debt ID allocation is scan-not-reservation) is accurately described and represents a real, currently-uncaught gap · **Medium**

**Evidence:** `scripts/next-tech-debt-id.pl` computes the next free NN purely by scanning `tech-debt/` filenames at a ref; it reserves nothing. The failure mode — a stale-clone writer's file write lands as a content *modification* of an already-merged path rather than an *add* — is consistent with git's add/add-conflict semantics; neither the deletion/rename guard nor `td-check.pl` would catch it.

**Impact:** Medium as the item itself scopes it — concurrent multi-repo agent filing is routine, and the register's one guarantee (a filed item's body is a stable permanent record) is what this gap can silently break.

**Direction:** No new tech-debt item needed for the fix itself — `TD-PPpoet-26080801` already scopes it precisely. Addressed by R-07: claim and resolve it via the standard workflow.

### F-CI-03 — No CI/coverage status badge in README · **Low**

**Evidence:** `README.md:1-13` has no `![CI](...)`/shields.io badge. Carried forward from the prior review's R-13 bundle.

**Impact:** Low, cosmetic/discoverability only.

**Direction:** Addressed by R-13.

### F-CI-04 — No documented rollback/yank path for a bad tagged release · **Low**

**Evidence:** `release.yml`'s `release` job tags and publishes unconditionally the moment `package.json`'s version changes on `main`. No rollback/yank language anywhere in `docs/BUILD.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`. Still open from the prior review's R-13 bundle.

**Impact:** Low — not a live service, consumer repos pin via `.poetic-version` — but no written procedure exists to reach for under pressure.

**Direction:** Addressed by R-13.

## Performance and scalability (PERF)

**Scope note:** a CLI/build-tool framework with no request handlers or runtime resource growth of its own; the only genuinely hot paths are the poem-corpus build loop and `sync-blogger.js`'s outbound calls.

**Strengths:** The last review's fix (parsing each poem's YAML at most once per build via a shared cache) is still intact and correctly threaded through `build-all-poems.js`. `sync-blogger.js`'s strictly sequential per-poem posting is a deliberate, correct safety choice (`TD26072602`, `not-debt`), not a scaling problem; `listAllPosts()` paginates correctly. No quadratic loops over the poem corpus were found.

### F-PERF-01 — `build-all-poems.js`'s "skip if up to date" fast path still fully parses the whole corpus (and its `$ref` graph) every run · **Low**

**Evidence:** `build-all-poems.js:466-476` computes the staleness-check `sources` set via `collectRefFiles()`, which parses every poem's YAML and recursively `yaml.load()`s every `$ref` target — unconditionally, even on the common "nothing changed, skip" path.

**Impact:** Negligible today (3-poem example corpus); the unskippable parse cost grows linearly with a consumer repo's poem count and `$ref` fan-out.

**Direction:** Addressed by R-15: persist the last-known ref graph alongside the manifest.

### F-PERF-02 — `collectRefFiles()` re-parses a shared `$ref` target once per referencing poem instead of reusing the shared cache · **Low**

**Evidence:** `poem-render.js:206-211` reads a `$ref` target via a bare `yaml.load`, not `readYamlCached()`, even though the caller is handed the shared cache. `collectRefFiles`'s own `seen` Set is freshly created per call.

**Impact:** Compounds F-PERF-01's cost by "how many poems share this partial" — a perverse incentive against using the `$ref` feature it's meant to encourage.

**Direction:** Addressed by R-15: thread the caller's cache into `collectRefFiles`'s `yaml.load` call.

## Usability and accessibility (UX)

**Environment note:** `npm run a11y` was attempted directly this session; no Chrome/Chromium binary exists in this sandbox (no root), so it correctly reports the gap and exits 0. Contrast findings below are hand-computed via the WCAG relative-luminance formula — an environment limitation carried unchanged from the last five reviews, not a regression.

**Strengths:** All three accessibility commits since the last review check out against current code, not just commit messages. `.back-to-top` recomputed at ≈5.80:1 (was ≈4.02:1); `.audio-cell:empty::after` at ≈4.95:1. The muted-grey pass correctly reasoned about the fragment-rendering context and fixed a `.song-segment` opacity interaction that would have silently reintroduced a failure. The postscript-clamp inversion is genuinely correct, verified across CSS, JS, and the Pug template together: a script-disabled visitor gets the full postscript instead of truncated content with no way to read the rest. `generateIndexHtml`'s landmark self-heal is confirmed present; both generated index pages carry `<header>`/`<main>`. Every interactive control sampled is a real, natively keyboard-operable `<button>`. Every `outline: none` has a visible focus substitute.

### F-UX-01 — `--help` is unrecognised across most of `src/tools/`, with two tools misreading it as a filename · **Medium**

**Evidence:** `blogger-auth.js` is the one CLI with real `--help`. `poem-to-yaml.js --help` and `yaml-to-poem.js --help` both fail with `Error: ENOENT: ... open '--help'` — read as the input filename. `build-poems.js --help`, `poem-to-raw.js --help`, `sync-blogger.js --help` all silently run their default action instead — including a real build — confirmed by direct execution.

**Impact:** A newcomer's first instinct when unsure of arguments is undermined twice over: confusing raw ENOENT errors from two tools, and three more silently doing something (including a filesystem write) instead of nothing.

**Direction:** Addressed by R-03: a shared `--help`/`-h` check at the top of each tool's `main()`.

### F-UX-02 — Recurring `#007AFF` remains one AA-failing use, isolated to CSS custom-property definitions rather than a live text/background pairing · **Informational**

**Evidence:** Remaining `#007AFF` uses are a border colour (3:1 threshold, not 4.5:1) or dark-mode link text on near-black (≈4.71:1, passes). No remaining text-on-light-background pairing.

**Impact:** None currently — recorded so a future addition of this recurring hex gets the same treatment.

**Direction:** No action needed now.

## Documentation (DOC)

**Strengths:** `docs/BUILD.md`, `docs/BLOGGER.md`, `docs/POEM-TO-YAML.md`, `scripts/new-poem`'s usage comment all check out exactly against current code/behaviour. A grep for historical-drift phrasing across `docs/*.md` and `README.md` found only legitimate uses — no "as-built" principle violations. `CHANGELOG.md`'s `[Unreleased]`/`[6.4.0]` entries are accurate and current.

### F-DOC-01 — README's "Convert to YAML (and back)" example still doesn't round-trip when only the single-file step is followed · **Medium**

**Evidence:** `README.md:207-216` shows single-file conversion, then `--all`, then `yaml-to-poem.js src/poems/yaml/my-poem.yaml`. Reproduced directly in a scratch clone: the single-file command writes YAML *next to the source* file in `src/poems/poem/`, not into `src/poems/yaml/`; the third command then fails with `ENOENT`. Running all three commands in sequence happens to succeed because the middle `--all` command incidentally also converts the same file first — papering over the bug for that one execution path, which may explain why it survived two review cycles.

**Impact:** A newcomer following the single-file half of the snippet verbatim hits a file-not-found error with no explanation.

**Direction:** Addressed by R-04: pass an explicit output path, or drop the single-file variant and lead with `--all`.

### F-DOC-02 — `docs/YAML-SCHEMA.md`'s segment-label example still bakes in brackets the real schema doesn't store · **Low**

**Evidence:** `docs/YAML-SCHEMA.md:23,27` shows `label: "[Verse 1]"`. Real generated YAML (`src/poems/yaml/_example.yaml`, `examples/example-blockquote.yaml`) has bracket-free labels; the `[...]` wrapping is added only at render time (`_poem-content.pug:73`), a different bracket-adding role entirely.

**Impact:** A reader copying the example literally would double-wrap the rendered label on first build.

**Direction:** Addressed by R-13.

## Governance and project health (GOV)

**Strengths:** `LICENCE` (MIT) matches `package.json`. `LICENCE-POEMS.md` cleanly separates framework/content licensing with a well-executed dual-licence design. `CODEOWNERS` names both of the maintainer's handles, matching `git log`'s author concentration. `SECURITY.md`'s candour about the single-maintainer/no-succession posture is consistent with `CLAUDE.md`. Zero open issues/PRs. CLAUDE.md's "Branch workflow" section already candidly documents the single-maintainer/two-handle self-review setup and non-strict required-status-checks policy as deliberate trade-offs — neither is flagged as a defect here.

### F-GOV-01 — No `.github/PULL_REQUEST_TEMPLATE.md` · **Low**

**Evidence:** No template file exists anywhere under `.github/`. Still open, unchanged from the prior review.

**Impact:** Low — a single-maintainer, self-review repo where PR descriptions are already prose-quality in practice; matters mainly if external contribution becomes real.

**Direction:** Addressed by R-13.

### F-GOV-02 — No roadmap or direction statement · **Low**

**Evidence:** No `ROADMAP.md`, no "Future"/"Roadmap" section anywhere in project-owned docs.

**Impact:** Low — `CHANGELOG.md`'s `[Unreleased]` section and the tech-debt register already function as a de facto near-term work list for a single-maintainer personal framework; a forward-looking roadmap is a lower-value artefact here than for a project soliciting outside contribution.

**Direction:** None recommended; judged proportionate to the project's scope and maturity.

## Observability and operations (OPS)

**Scope note:** one real long-running process (`serve-static.js`) and one batch of outbound API calls (`sync-blogger.js`/`blogger-auth.js`).

**Strengths:** `sync-blogger.js`'s `fetchWithRetry` is a solid outbound-call policy: 30s timeout, single retry on 429/5xx, with `createPost` correctly opting out of rejection-retry to avoid duplicate posts. `.github/workflows/sync-blogger.yml`'s `concurrency` group prevents overlapping syncs; credentials flow through `env:`/`secrets:` only. `serve-static.js`'s graceful shutdown is present and correctly implemented. Secrets are never logged incidentally.

### F-OPS-01 — `serve-static.js`'s long-running `/all-poems` endpoint never invalidates `poem-render.js`'s process-lifetime `$ref` cache, so editing a shared partial while the dev server runs serves stale content until restart · **Low**

**Evidence:** `poem-render.js`'s module-level `refCache` is evicted only via `clearRefCache()`, called by `build-poems.js` (a fresh process each time, so a no-op there) and by tests — never by `serve-static.js`. The `/all-poems` route re-renders on every request but always consults the shared, never-cleared cache. Undocumented and untested.

**Impact:** Low in practice — only `/all-poems` does live rendering, only `$ref`-using poems are affected, and restarting the server is a trivial workaround once known — but a real, verifiable caching-correctness gap in the one part of the framework that behaves like a live service.

**Direction:** Addressed by R-15: either thread a request-scoped cache through `resolveRefs()`, or have the route call `clearRefCache()`.

### F-OPS-02 — `blogger-auth.js`'s outbound `fetch()` calls carry no timeout, unlike the discipline `sync-blogger.js` established for the same API · **Low**

**Evidence:** Three real network calls in `blogger-auth.js` use plain `fetch()` with no `AbortSignal.timeout()` and no retry, unlike `sync-blogger.js`'s shared `fetchWithRetry()` for the identical Google/Blogger endpoints.

**Impact:** Low — a manually-run, one-time interactive helper, not a CI/unattended path — but a hung DNS resolution or non-responding endpoint would leave the script hanging indefinitely with no indication anything is wrong.

**Direction:** Addressed by R-12: reuse `sync-blogger.js`'s timeout pattern.

## Data handling and privacy (DATA)

**Dimension judgement: largely inapplicable, with one exception carved out and verified.** No user accounts, no analytics, no multi-user data model — poem content is the author's own. The one relevant surface, Blogger OAuth credential material, was checked directly: credential-file permissions are checked and warned on, the file is written 0600 atomically, `.gitignore` covers it and its temp siblings, no real personal data appears in any fixture/test/example (targeted email-pattern grep across `src/poems/` and `examples/` returned nothing beyond obvious placeholders), and secrets are never logged. `docs/BLOGGER.md` documents a real retention/deletion pathway (`blogger.removed` config). No findings filed; independently re-verified this session via direct fixture/history search, not carried over from the prior review.
