# Findings

All findings below were independently verified against the working tree at commit `38ae8c8` (branch `main`) this session — re-running commands and reading current file contents rather than trusting prior reviews or commit messages. Findings are grouped by dimension, in the checklist's order; each dimension also records a brief strengths note. Cross-references to `TECH-DEBT.md` use its `TD<id>` identifiers.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 8 |
| Low | 11 |

(One further item, F-UX-01, is recorded as informational/not-applicable — a limitation of this review's sandbox environment, not a project defect — and is excluded from the tally above.)

## Architecture and design (ARCH)

**Strengths:** The path-containment convention built for `serve-static.js` was extended this window to two more config-driven paths (`footer.js`, `build-blogger.js`), applying the same containment discipline consistently everywhere user config can name a filesystem path. `sync-blogger.js`'s `main()` — the last review's complexity hot-spot — is now a thin orchestrator around extracted, independently-tested functions, and the identical extraction shape was mechanically repeated for `poem-to-yaml.js`/`poem-to-raw.js`'s `--all` loops. The last review's F-ARCH-01 (inline `onclick` handlers violating the template's own "no `<script>` block here" rule) is fully resolved. The YAML-parse-once perf fix (`readYamlCached`) threads a single shared cache cleanly through `build-all-poems.js`'s three read sites.

### F-ARCH-01 — `yaml-to-poem.js --all` is dead code: wrong directory, wrong path convention, and no test would catch it · **Medium**

**Evidence:** `src/tools/yaml-to-poem.js:862`: `const poemsDir = path.join(process.cwd(), 'src', 'poems');` then loops for files ending `.yaml`. `src/poems/` holds only two subdirectories (`poem/`, `yaml/`) — no `.yaml` files sit directly in it, so the loop can never match. Running it confirms: `node src/tools/yaml-to-poem.js --all` → `Converted 0 YAML files to .poem format`, exit 0, no error. Two defects compound: it targets `src/poems` instead of `src/poems/yaml`, and it resolves via `process.cwd()` instead of the shared `REPO_ROOT` convention that `poem-to-yaml.js`'s and `poem-to-raw.js`'s `--all` modes both follow. This is a cross-tool-seam-consistency failure: the "convert every file in the tree" convention on one side of the poem-to-yaml.js/yaml-to-poem.js seam changed when the `poem/`/`yaml/` subdirectory split happened, and the other side never followed.

**Impact:** A user-facing bug in a documented CLI tool that fails silently — worse than a crash, since a user invoking `--all` by analogy with `poem-to-yaml.js --all` gets a plausible "0 converted" success message. Single-file mode (the only form README documents) works correctly, limiting the blast radius, but zero tests exercise this file's `main()`/`--all` at all.

**Direction:** Addressed by R-02. Cross-reference: addressed by R-02.

### F-ARCH-02 — `serve-static.js`'s production code carries a permanent workaround whose only purpose is its own test suite's re-compilation trick · **Low**

**Evidence:** `serve-static.js` has no `module.exports` and starts a real server as a load-time side effect, so `test/serve-static.test.js` compiles the file's source into a throwaway `Module` per test. This window's graceful-shutdown handlers are keyed off a `Symbol.for(...)` on the global `process` object purely so re-loading the module per test replaces rather than piles up listeners — the second distinct production-code accommodation this module's shape has forced for testability.

**Impact:** Proportionate today (small, well-commented, correctly guarded) but each feature added has invented a new testability workaround rather than the module being importable.

**Direction:** Addressed by R-10.

## Code quality and maintainability (CODE)

**Strengths:** No `TODO`/`FIXME`/`HACK` markers anywhere in `src/` — self-reported debt is consistently routed to `TECH-DEBT.md`. `npm run lint` is clean; `eslint.config.js`'s deliberate rule relaxations are documented inline and matched by actual usage. `test/golden.test.js` pins `poem-to-yaml.js`'s exact output against fixtures, catching accidental shape/ordering drift early.

### F-CODE-01 — Path-containment-with-fallback logic is duplicated between `footer.js` and `build-blogger.js`, and has already begun to diverge · **Low**

**Evidence:** `footer.js`'s `resolveFooterSourcePath` and `build-blogger.js`'s `resolveTemplatePath` (both closing TD26072606 this window) independently reimplement the same three-step "resolve via `safeJoin`, check `isWithinRoot`, warn-and-fall-back" pattern — but with different fallback strategies, and `path-guard.js` (which both already import from) has no shared combinator for it.

**Impact:** Today both copies are correct, but nothing stops the next edit to one from silently not being mirrored in the other — the checklist's "copy-pasted logic that has already begun to diverge" hazard, concretely.

**Direction:** Addressed by R-09.

### F-CODE-02 — `yaml-to-poem.js`'s `main()`/`--all` has zero test coverage, unlike its two siblings covered in the same review window · **Medium**

**Evidence:** Commit `a1d4608` extracted and unit-tested `poem-to-yaml.js`'s and `poem-to-raw.js`'s `--all` loops specifically because "only the project's own pristine example poems have ever exercised it" — and deliberately left `yaml-to-poem.js` untouched, the one file whose `--all` was already broken (F-ARCH-01).

**Impact:** A real, currently-shipping bug sat undetected specifically in the one CLI entry point this window's own coverage initiative didn't reach.

**Direction:** Addressed by R-02.

### F-CODE-03 — `Date`-vs-string handling for a YAML-parsed `date` field is reimplemented ad hoc in `sync-blogger.js` instead of reusing the shared `date-utils.js` helper, with a small behavioural gap · **Low**

**Evidence:** `date-utils.js` centralises "a YAML-parsed date may come back as either a string or a JS `Date`" via `toISODate()`. `sync-blogger.js:936` reimplements the same check inline, without `toISODate()`'s `isNaN(date.getTime())` guard — an invalid `Date` instance would throw rather than degrade gracefully.

**Impact:** Low practical risk, but the third independent reimplementation of this logic in the codebase, and the one outside `date-utils.js` is also missing the guard the others carry.

**Direction:** Addressed by R-09.

## Security (SEC)

**Strengths:** No live secrets anywhere in tracked files or git history. `npm audit` (with and without dev deps) reports 0 vulnerabilities. `blogger-auth.js`'s OAuth flow is textbook: PKCE (S256), a checked CSRF `state` parameter, `crypto.randomBytes` throughout, a masked secret prompt, and an atomic 0600 credentials write. `sync-blogger.js` warns on over-permissive credential files, never logs secrets, and correctly exempts `createPost` from retry to avoid duplicate posts. `serve-static.js`'s path-traversal guards and directory-listing escaping both have passing regression tests. `SECURITY.md` is current and candid about the single-maintainer/no-succession posture. CodeQL runs on every PR/push plus weekly. No `eval`, dynamic `require`, or shell-injection-prone `child_process` use.

### F-SEC-01 — `path-guard.js`'s containment checks remain purely lexical (symlink gap) · **Medium**

**Evidence:** `src/tools/path-guard.js:17-31` — neither `safeJoin()` nor `isWithinRoot()` resolves symlinks via `fs.realpathSync`; containment is string-comparison only. Confirmed all four current call sites still rely on this alone: `serve-static.js`'s two guard sites, `build-blogger.js`'s `blogger.template` resolver, and `footer.js`'s `footer.source` resolver. A symlink committed inside a served/config root resolves to an in-root path string, passes the check, and its target is read/served/published verbatim. `TD26072801` (open, no `Resolved`/`Ref`) describes exactly this and is confirmed still accurate against current code.

**Impact:** Requires an attacker to get a symlink committed first, at which point they could usually commit the target's contents directly — correctly rated below the config-path bypass `#113` already fixed. Stays Medium because the blast radius (arbitrary local file disclosure / published-content injection) is real and now spans four call sites in three files.

**Direction:** No new work this review — `TD26072801` already records the deliberate scope decision. Addressed by R-08 (confirmation only).

## Testing and quality assurance (TEST)

**Strengths:** Test code is roughly as large as source and the suite is fast (~23-28s for 672 tests) and green (668 pass, 0 fail, 4 deliberately-skipped `vim-syntax` tests with a documented environment-conditional reason). Coverage clears an 80/79/88% CI-enforced gate. The tech-debt-register test suite is genuinely thorough, building throwaway git repos to exercise its Perl scripts hermetically. The mtime-granularity flaky-test fix from PR #133 is applied correctly in the two files it targeted. The documented fast-subset/watch-mode workflow is real and verified working.

### F-TEST-01 — `test/build-poems.test.js` still uses the pre-#133 mtime-comparison pattern PR #133 fixed elsewhere · **Medium**

**Evidence:** Two tests (`test/build-poems.test.js:110-122`, `:154-171`) capture the output file's "before" mtime as real wall-clock time (never backdated) and compare with `>` after a fast in-process rebuild — the identical shape PR #133 proved flaky and fixed in `test/poem-to-yaml.test.js`/`test/poem-to-raw-cli.test.js` by explicitly rewinding the baseline mtime 60 seconds into the past first. This file's two "regenerates when X changes" tests were not updated to match.

**Impact:** A CI runner or contributor machine with coarser mtime resolution, or two writes landing in the same timestamp tick, can make the assertion fail despite correct code — a known gap given the pattern was proven flaky elsewhere in this exact codebase.

**Direction:** Addressed by R-04.

### F-TEST-02 — `build-blogger.js`'s entire orchestration function is untested and unreachable by CI · **Medium**

**Evidence:** `test/build-blogger.test.js` imports only three pure helpers from `build-blogger.js`, never `injectCSSIntoTemplate` (the real file-read/write orchestration, lines 145-244). c8 confirms 59.21% lines, uncovered ranges covering essentially the whole orchestration body. Unlike other low-coverage build scripts whose untested `main()` bodies are still exercised as CI smoke tests, `build-blogger.js` is invoked from no workflow at all — `grep -rn "build:blogger" .github/workflows/*.yml` returns nothing.

**Impact:** The function performing the security-relevant path-containment check, the unsafe-CSS-tag rejection gate, and the actual template-injection logic are covered by neither a unit test nor any CI job — a regression would surface only when a maintainer runs it manually and it visibly breaks.

**Direction:** Addressed by R-03.

### F-TEST-03 — `blogger-auth.js`'s network/orchestration path is untested, but the higher-risk logic is covered · **Low**

**Evidence:** `blogger-auth.js` is 49.83% lines covered; uncovered ranges are `main()` and its thin `fetch()`-wrapper helpers. Every security-sensitive or non-trivially-branching function (PKCE/state generation, CSRF checking, masked prompting, atomic 0600 writes) already has direct tests.

**Impact:** Lower risk than F-TEST-02: a one-off interactive script never invoked by CI, whose tested parts are exactly the parts that would cause silent credential mishandling if broken.

**Direction:** Addressed by R-11 (optional).

## Dependencies and supply chain (DEPS)

**Strengths:** Only 4 production dependencies, each with an obvious, load-bearing purpose. `package-lock.json` is committed. `npm audit` reports 0 vulnerabilities. The licence-compatibility check runs against all 77 production packages with a narrow, permissive-only allow-list, wired into CI as a required step. `.github/dependabot.yml` covers both `npm` and `github-actions` ecosystems weekly.

### F-DEPS-01 — `markdown-it` is one major behind (14.3.0 → 15.0.0) · **Low**

**Evidence:** `npm outdated`: `markdown-it 14.3.0 (wanted) / 15.0.0 (latest)`. Every other production dependency is already at latest.

**Impact:** Low — a single trailing major on one of four dependencies, not a pattern of neglect; Dependabot will raise it on its own schedule.

**Direction:** Addressed by R-12.

### F-DEPS-02 — `engines.node` floor (`>=22`) is on the older of two current LTS lines, not yet EOL but worth a forward note · **Low**

**Evidence:** Node 22 entered Maintenance LTS in October 2025 (EOL ~April 2027); Node 24 is the more current Active LTS line. CI pins `node-version: "22"`, matching the floor.

**Impact:** Not urgent — roughly eight months of supported life remain from this review date.

**Direction:** No action needed now; revisit near Node 22's EOL or opportunistically. No recommendation filed.

## Tooling and developer experience (TOOL)

**Strengths:** The clone-to-running-site path for a poem author was traced and actually run end to end this session (`npm install` → `sync-framework.sh` → `new-poem` → `npm start`, serving `200` within two seconds). `scripts/edit-poem`/`new-poem` are genuine local-dev affordances. `.editorconfig` and `eslint.config.js` are thoughtfully scoped and documented. `scripts/setup-linux.sh` handles a real WSL/nvm PATH issue. `npm run build:all` chains build+serve, and `serve-static.js` supports `--port`/`--dir`/`--host` plus graceful shutdown.

### F-TOOL-01 — README's "Contributing" section never tells a human contributor to run tests, lint, or coverage locally · **Medium**

**Evidence:** `README.md` mentions none of `npm test`, `npm run lint`, `npm run coverage`, `npm run check`, or `npm run check:licenses` — its "Contributing" section covers the PR/branch-protection process and commit format in detail but stops short of the local dev loop. These five commands are documented together only in `CLAUDE.md`, which is written for AI agents, not a human clicking "Use this template."

**Impact:** Not a hard blocker — CI catches the same problems within about a minute — but a human's first PR iteration routinely surfaces failures a two-line note would have caught locally first.

**Direction:** Addressed by R-07.

### F-TOOL-02 — No CI/coverage status badge in README · **Low**

**Evidence:** No badge near the top of README, unlike the existing screenshot/logo.

**Impact:** Minor discoverability gap only; purely polish.

**Direction:** Addressed by R-13.

## CI/CD and release engineering (CI)

**Strengths:** Every one of the seven workflows sets `timeout-minutes` on every job, matching `TD26072612`'s resolved claim. `build-poems.yml` and `release.yml` both carry comments explaining why their triggers deliberately omit a `paths:` filter (avoiding GitHub's "skipped but required checks" trap). `npm ci` (not `npm install`) is used for the real build. 59 of the last 60 sampled CI runs succeeded. `release.yml`'s logic matches CLAUDE.md's documented release process exactly, and `CHANGELOG.md`'s current `[Unreleased]` section is legitimate, not stale.

### F-CI-01 — Tech-debt register (`TD26072604`) and `RULESET-CHANGELOG-CHECK.md` are both stale — the fix they describe as pending already happened · **High**

**Evidence:** Live ruleset state, fetched independently this session: `gh api repos/Poetic-Poems/poetic/rulesets/18226786` shows `required_status_checks` already includes `changelog-check` (and `register`), with `updated_at: 2026-07-28T00:37:09Z`. But `TECH-DEBT.md`'s `TD26072604` entry is still `open`, with a body describing the fix as needing to happen ("needs admin/maintain permission on the repo"). `RULESET-CHANGELOG-CHECK.md` at the repo root (added by PR #110, which added *only* this doc file — no API call, since a GitHub Actions job cannot self-grant the ruleset-editing permission) narrates the change as already applied, which was not true at the moment it merged. Correlating merge timestamps (`PR #110` merged `2026-07-27T13:31:59Z`; `PR #124` merged `2026-07-28T00:33:49Z`; ruleset `updated_at` `2026-07-28T00:37:09Z`, 3m20s after #124) strongly suggests the maintainer applied both `changelog-check` (21 hours overdue) and `register` (from #124, never tracked as missing by any tech-debt item) by hand via the GitHub UI on 2026-07-28 — the ruleset's own `/history` audit log returned `403` to this session's token, so exact attribution isn't retrievable programmatically, but the correlation is strong circumstantial evidence.

**Impact:** The whole point of a per-item tech-debt register is to be the trustworthy source of "what's still open" — here it has been wrong, for three days and five PRs, about whether a release-integrity check can be bypassed at merge time, and the register's own consistency CI gate (`td-check.pl`) didn't catch it because that gate checks internal row/body consistency, not consistency against live GitHub state.

**Direction:** Addressed by R-01. This review flips `TD26072604` to resolved directly (see the tech-debt register update below) and files `TD26080101` for the residual: deleting the stale doc file and the absence of any drift-detection mechanism.

### F-CI-02 — No documented rollback/yank path for a bad tagged release · **Low**

**Evidence:** `release.yml`'s `release` job tags and publishes the moment `package.json`'s version changes on `main`, with no corresponding "if this release was bad" step or doc. No mention of rollback/yank/revert-release anywhere in README/docs/CLAUDE.md.

**Impact:** Low — not a live service, and a consumer repo's own CI gates a bad framework release from silently propagating — but there is no written procedure to reach for under pressure.

**Direction:** Addressed by R-13.

## Performance and scalability (PERF)

**Strengths:** #128's YAML-parse-once fix eliminated the one algorithmic inefficiency previously found. `sync-blogger.js`'s strictly-sequential posting (TD26072602, `not-debt`) is a deliberate, correct safety choice, not a scaling problem at this project's scale. No further algorithmic red flags found.

**No findings.** This dimension is largely inapplicable to a CLI/build tool with no request handlers or runtime resource growth to speak of; recorded explicitly per the checklist's guidance rather than left silently omitted.

## Usability and accessibility (UX)

**Scope note:** a CLI + static-site generator, not an interactive web app; internationalisation is judged inapplicable (no i18n infrastructure exists, and poem text is author-supplied in whatever language the poet writes).

**Strengths:** Every interactive control sampled in the generated pages is a real `<button type="button">`, so all are natively keyboard-operable without extra keydown handling — including the delegated-listener refactor of the analysis toggle. The prior postscript-toggle and `<main>`/`<header>` landmark fixes both check out against current code. Focus rings are preserved or deliberately replaced with a visible substitute everywhere `outline: none` appears. Sort headers keep `aria-sort` in sync with visual state.

### F-UX-01 — `npm run a11y` could not be executed in this review's sandbox (environment gap, not a repo defect) · **N/A — informational**

**Evidence:** `npm run a11y` correctly reports "No Chrome/Chromium executable found... skipping" (exit 0) per its own documented, non-blocking design. This sandbox has no root, so Chrome and its ~20 shared-library dependencies cannot be installed. CI wiring was confirmed independently by reading `.github/workflows/build-poems.yml:164-167`: the step is genuinely `continue-on-error: true` inside the required `build` job, so a real accessibility violation can never block a merge, exactly as documented.

### F-UX-02 — `.back-to-top` renders white text on `#007AFF`, the exact WCAG-AA-failing colour a prior fix eliminated everywhere else · **Medium**

**Evidence:** `TD26072108` (fixed by PR #85) darkened every other `#007AFF` text/background use to `#0062CC` (≈5.8:1) because `#007AFF` measures ≈4.02:1, below the 4.5:1 AA threshold. `public/poetic.css:481-489`'s `.back-to-top` still uses `background: #007AFF; color: white;` for a 20px "↑" glyph (normal-text size under WCAG's large-text carve-out, so 4.5:1 applies). Computed contrast: 4.02:1. This selector was not touched by `#85`'s diff or either later CSS-touching commit.

**Impact:** The one interactive, potentially-always-visible chrome element still carrying a contrast defect a dedicated PR was created specifically to eliminate site-wide — a regression-of-omission against an already-fixed, already-tested pattern.

**Direction:** Addressed by R-06.

### F-UX-03 — `.audio-cell:empty::after`'s "—" placeholder renders at ≈1.6:1 contrast · **Low**

**Evidence:** `public/poetic.css:465-468`: `color: #ccc` for generated `"—"` content on a white table background — computed contrast ≈1.6:1, far below even the 3:1 non-text floor.

**Impact:** Low — a decorative "no audio" placeholder in one table column, with the column header and absent icon already conveying the same information; still close to invisible for a low-vision reader.

**Direction:** Addressed by R-06.

## Documentation (DOC)

**Strengths:** `docs/RENDERER-BROWSER.md` is fully accurate against current code, including every documented export and the `package.json` `exports` map. `examples/poetic-config.example.yaml` is in full sync with `poetic-config.js`'s key list. `docs/BUILD.md`'s file-structure/synced-vs-gitignored claims all check out. A targeted grep for historical-drift phrasing across `docs/`/README found no violations of the "as-built, no history" documentation principle.

### F-DOC-01 — README's "Convert to YAML (and back)" example doesn't round-trip as written · **Medium**

**Evidence:** `README.md:205-216` shows single-file `poem-to-yaml.js`, then `--all`, then `yaml-to-poem.js src/poems/yaml/my-poem.yaml`. Running the first command as written produces the YAML *alongside* the source `.poem` file, in `src/poems/poem/`, not in `src/poems/yaml/` — confirmed by direct reproduction, which fails at the third command with `ENOENT`. `docs/POEM-TO-YAML.md` documents the same command correctly (no `src/poems/yaml/` claim), so the drift is specific to README.

**Impact:** A newcomer following README's own snippet verbatim hits a file-not-found error on the very next command with no explanation.

**Direction:** Addressed by R-05.

### F-DOC-02 — `docs/YAML-SCHEMA.md`'s segment-label example bakes in brackets that the real schema doesn't store · **Low**

**Evidence:** `docs/YAML-SCHEMA.md:18-34` shows `label: "[Verse 1]"`, but real generated YAML stores bracket-free labels (`label: Stanza 1`), and the visual `[...]` wrapping is added only at HTML-render time by `_poem-content.pug`.

**Impact:** Low — one example line; copying it literally would double-wrap the rendered label.

**Direction:** Addressed by R-13.

## Governance and project health (GOV)

**Strengths:** `LICENSE` (MIT) is present and matches `package.json`. Governance reality — single-maintainer status, self-review via a second GitHub account, no succession plan — is documented in `CLAUDE.md` rather than glossed over. `CODEOWNERS` names both handles for the one maintainer. `TECH-DEBT.md` is a mature register with its own CI gate.

**Cross-reference, not a separate finding:** the register-drift fact described above is filed once, as **F-CI-01**, since it is fundamentally a CI/branch-protection state fact; it is also a governance-relevant failure (the whole point of the register is to be trustworthy), so treat F-CI-01 as covering this dimension too.

### F-GOV-01 — No PR template · **Low**

**Evidence:** No `.github/PULL_REQUEST_TEMPLATE.md` or `CONTRIBUTING.md` exists.

**Impact:** Low — a single-maintainer, self-review repo; matters mainly if/when external contribution becomes real.

**Direction:** Addressed by R-13.

## Observability and operations (OPS)

**Strengths:** `sync-blogger.js`'s console output is clear and actionable per operation. Graceful `SIGINT`/`SIGTERM` shutdown was added to `serve-static.js` (TD26072619, confirmed present). `sync-blogger.js` has a comprehensive timeout (30s via `AbortSignal.timeout()`) and single-retry policy, with `createPost` correctly exempted from retry to avoid duplicate posts.

**No findings.** This dimension is largely inapplicable to a CLI/build tool with no long-running service, metrics surface, or stateful system to back up.

## Data handling and privacy (DATA)

**Strengths:** Credential-file permissions are checked and warned on. No real personal data appears in any fixture — only obviously-fake tokens and placeholder IDs. Secrets are never logged.

**No findings.** This dimension is judged inapplicable to a personal-use authoring framework with no user accounts or personal-data collection of its own; poem content is the author's own, held and published entirely at their discretion.
