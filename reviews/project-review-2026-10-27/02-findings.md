# Findings

This review examined `poetic` at revision `c0f8460` across all thirteen checklist dimensions, close to exhaustively on the core framework code (`src/tools/`, `src/templates/`, `src/browser/`), with representative sampling of the remaining tooling and `scripts/`. See `01-summary.md`'s "Scope and method" for the full sampling statement.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 6 |
| Low | 15 |
| Informational | 5 |

## Architecture and design (ARCH)

**Strengths:** The module layering is clear and consistently followed — `src/tools/` sits above a small filesystem-free core (`poem-parser.js`, `render-core.js`, `aggregate-render-core.js`, `song-handlers.js`, generated `poem-templates.js`/`song-handlers-data.js`, `slugify.js`, `date-utils.js`) that both the Node build path and `src/browser/render.js` depend on, with zero circular dependencies (`npx madge --circular`). The `.poem` ⇄ YAML seam (`poem-to-yaml.js`/`yaml-to-poem.js`) is genuinely tested end-to-end — `test/yaml-to-poem-roundtrip.test.js` round-trips every fixture and the framework's own poem corpus byte-for-byte and asserts idempotency under a second round-trip, not just each side tested in isolation. Path-containment (`path-guard.js`) is a single, well-documented, symlink-aware helper reused consistently rather than reinvented per call site.

### F-ARCH-01 — No ADRs/design docs; architecture rationale lives only in code comments · **Low**
**Evidence:** No `docs/adr*`/`docs/decisions/` exists; `docs/` holds format/spec/build docs only. The rationale for non-obvious choices (e.g. why `selfHealLandmarks` in `build-all-poems.js:207-249` uses structural tag-depth matching instead of a DOM parser) is carried entirely in large doc comments next to the code.
**Impact:** Low today — the comments are unusually thorough and can't drift the way a separate ADR file could. The risk is narrow: a decision affecting several files has no single place stating it once.
**Direction:** not worth an ADR process at this size; watch item, no recommendation this cycle.

### F-ARCH-02 — Idempotent-rebuild "self-healing" is a recurring pattern implemented three different ways · **Low**
**Evidence:** The same detect-and-rewrite-a-legacy-artefact problem is solved independently in `footer.js:82-100` (regex replace), `build-all-poems.js:161-249` (`selfHealLandmarks`, tag-depth tracking), and `build-all-poems.js:372-387` (two bespoke `.replace()` branches).
**Impact:** Each instance is individually low-risk and well-tested; the cumulative risk is that a fourth self-healing need will clone one of these rather than reuse one.
**Direction:** extract a shared helper only if a fourth case arises; watch item, no recommendation this cycle.

### F-ARCH-03 — `serve-static.js`'s request handler is a single ~240-line function covering all routes · **Low**
**Evidence:** `createServer()` (`src/tools/serve-static.js:219-459`) inline-handles the `/all-poems` route, directory listing, static serving, and 404/error paths in one callback.
**Impact:** Bounded — a local dev server, not a production service. Cost is readability as routes grow.
**Direction:** factor into named handlers if a fifth route is added; watch item, no recommendation this cycle.

### F-ARCH-04 — Next plausible requirements are mostly easy to accommodate, with one friction point · **Informational**
**Evidence:** New song-handlers and new poem sections both follow an already-trodden, predictable path; the one friction point is that `poem-parser.js` (see F-CODE-01) is already large, so a new section's parsing logic lands on an already-large class.
**Impact:** Not a defect — included per the checklist's "how hard would the next requirement be" prompt.
**Direction:** none; informational.

## Code quality and maintainability (CODE)

**Strengths:** `npm run lint` passes with zero errors; zero TODO/FIXME/HACK markers and zero commented-out code anywhere in `src/`/`test/`; every sampled `catch` block either rethrows with context or carries an explanatory comment for why swallowing is safe; the three `eslint-disable` occurrences in the whole codebase each carry a one-line justification; JSDoc is used heavily and consistently (~370 `@param`/`@returns` tags against ~270 functions in `src/tools/`).

### F-CODE-01 — `poem-parser.js` is the project's largest and most complex file: one 1652-line class with 40 methods, several >100 lines · **Medium**
**Evidence:** `src/tools/poem-parser.js`, `class PoemParser`, 40 methods; largest are `scanShellWord` (123 lines, 333-432), `parsePostscriptNote` (108 lines, 1320-1427), `processVariables` (103 lines, 511-613), `parseSegment` (94 lines, 937-1030).
**Impact:** This is the framework's core parser, so any change here has the widest blast radius in the codebase; the round-trip/corpus tests mitigate but don't eliminate the review burden of a large, dense file.
**Direction:** no change needed to ship today (well tested, well commented); if the file grows further, extract the shell-word/param-list tokenizer into its own module. Watch item — not recommended for action this cycle given the "no change needed" assessment.

### F-CODE-02 — `yaml-to-poem.js` has the same large-method pattern as the parser it mirrors · **Low**
**Evidence:** `escapeSegmentLiteral` (136 lines) and `convertHtmlToPlainText` (119 lines) in `src/tools/yaml-to-poem.js`.
**Impact:** Same category of risk as F-CODE-01, smaller in scope — both methods are self-contained and round-trip-tested.
**Direction:** no action required; watch item.

### F-CODE-03 — `sync-blogger.js`'s `explainBloggerFailure` is a 138-line, deeply-nested string catalog · **Low**
**Evidence:** `src/tools/sync-blogger.js:632-770`.
**Impact:** Low — diagnostic/error-message logic, not business logic; proportionate to the ~8 Blogger/OAuth failure modes it explains.
**Direction:** no action needed; watch item.

## Security (SEC)

**Strengths:** No secrets found anywhere in the repository (grepped for API keys, passwords, tokens, private keys across all tracked files); the credentials fixture is obviously fake and the real credential filename is gitignored. `path-guard.js`'s traversal guard is symlink-aware, not just lexical. `serve-static.js` scopes its wildcard CORS header to non-loopback binds only. `markdown-it`'s `html: true` configuration is a deliberate, documented trusted-single-author decision. All 13 historical CodeQL alerts on the repo are `fixed`; zero open.

### F-SEC-01 — `markdown-it` carries an unpatched high-severity ReDoS advisory · **High**
**Evidence:** `npm audit` on a fresh `npm ci`: `markdown-it 15.0.0 - 15.0.2`, high severity, GHSA-vfgh-jcmw-g37q / GHSA-gfr2-rv44-r23c (quadratic-time DoS in inline HTML parsing and multi-line reference-definition rendering). `src/tools/markdown.js:29` constructs `new MarkdownIt({ html: true, typographer: true })` — `html: true` is exactly the configuration GHSA-vfgh-jcmw-g37q names as the trigger.
**Impact:** `renderGfm()` runs on every poem's analysis/postscript Markdown and any `<<<markdown ... >>>` block, at build time and in the dev server. Content is single-trusted-author today (bounding the worst case to the maintainer hanging their own build), but the advisory's severity doesn't depend on who triggers it, and a future contributor-authored poem or a consumer repo with less-trusted contributors would also reach this path.
**Direction:** addressed by R-01.

### F-SEC-02 — No automated secret-scanning gate in CI · **Low**
**Evidence:** no `gitleaks`/`trufflehog`/secret-scanning workflow under `.github/workflows/`; `SECURITY.md` documents CodeQL but not secret scanning.
**Impact:** low given the single-maintainer, every-PR-reviewed process, but a dedicated gate would catch an accidental credential commit even when the one reviewer misses it — relevant given the self-review-by-design model this repo discloses.
**Direction:** addressed by R-10.

## Testing and quality assurance (TEST)

**Strengths:** `npm test` passes 827/0/4(skip) of 831; `npm run coverage` (c8) reports 90.79% statements / 85.56% branches / 97.98% functions, comfortably above the configured thresholds. `test/path-guard.test.js` gives the path-traversal/symlink-escape guard exhaustive, security-relevant coverage. All network-calling code (`sync-blogger.js`, `blogger-auth.js`) is tested via fully mocked `fetch` — the suite makes no real network call anywhere — and every server test binds an ephemeral port (`server.listen(0, ...)`), never a hardcoded one.

### F-TEST-01 — New CI-gating shell logic (changelog grammar, assembly) shipped with zero automated tests · **Medium**
**Evidence:** `scripts/check-changelog-section.sh` (193 lines), `lib/changelog-grammar.sh` (199 lines), and `scripts/assemble-changelog.sh` (611 lines), all added 2026-09-26 in PR #263, have no test coverage anywhere in `test/` and no shell-test harness (bats or otherwise) exists in the repo. Both carry `# shellcheck` directives that aren't enforced in CI (see F-CI-02).
**Impact:** `check-changelog-section.sh` backs a required status check; `assemble-changelog.sh` is release-critical (folds every merged PR description into `CHANGELOG.md`'s `[Unreleased]` section). A bug in either's hand-written grammar walker could silently corrupt a release's changelog or wrongly block a valid PR, with nothing automated to catch it.
**Direction:** addressed by R-05.

### F-TEST-02 — Coverage thresholds are aggregate-only; no per-file floor · **Low**
**Evidence:** `package.json`'s `c8` block sets `lines`/`branches`/`functions` thresholds with no `perFile` option. `blogger-auth.js` sits at 71.4% statements (uncovered: the interactive OAuth `main()` flow) and `poem-templates.js` (generated) at 48.62% — both deliberately-scoped exceptions, not neglect.
**Impact:** Low — but an aggregate-only gate means a newly added low-coverage file could hide behind the rest of the codebase's average.
**Direction:** consider `perFile: true` with a modest floor the next time a new high-risk file is added; watch item, no recommendation this cycle.

## Dependencies and supply chain (DEPS)

**Strengths:** Minimal, justified dependency surface — 4 direct production dependencies, 78 total once transitive deps are counted, each checked against a licence allow-list (`npm run check:licenses`, clean). `package-lock.json` is committed. Dependabot is configured for both `npm` and `github-actions` ecosystems weekly. `npm outdated` shows nothing more than a few patch/minor versions behind, all already covered by open Dependabot PRs.

### F-DEPS-01 — Dependabot's markdown-it security-fix PR is red on a stale, unrelated base · **Medium**
**Evidence:** PR #291 (bump to 15.0.3, the fix for F-SEC-01) is `MERGEABLE` but its `build` job fails — not on the version bump itself, but on `npm run check:licenses` rejecting `argparse@3.0.3`'s `PSF-2.0` licence, a problem already fixed on `main` by commit `c0f8460`/#292 (merged after #291's branch point). Every other check on #291 (CodeQL, commit-format, changelog checks) is green.
**Impact:** A High-severity dependency advisory sits unpatched for longer than necessary because its own fix PR is CI-red for a reason unrelated to the change it makes.
**Direction:** addressed by R-01.

### F-DEPS-02 — Dependabot's open-PR cap is already saturated · **Low**
**Evidence:** `.github/dependabot.yml` sets `open-pull-requests-limit: 5` for `npm`; exactly 5 npm Dependabot PRs are open at review time.
**Impact:** Dependabot will silently skip opening a PR for any new npm advisory or release until one of the five is merged or closed — no error, no notification.
**Direction:** addressed by R-07.

## Tooling and developer experience (TOOL)

**Strengths:** The newcomer path (README "Quick start" → `scripts/sync-framework.sh` → `scripts/new-poem` → `npm start`) was traced command-by-command and matched documentation exactly. `scripts/new-poem`/`edit-poem` are genuine authoring conveniences beyond a bare build loop. `.editorconfig`'s per-filetype exceptions are self-documenting. Vim support (`editors/vim/`) is a real, well-maintained differentiator, documented at both quick-start and deep-dive levels.

### F-TOOL-01 — PR template checklist omits 3 of the 5 local checks README tells a contributor to run · **Low**
**Evidence:** `.github/PULL_REQUEST_TEMPLATE.md:27-33` lists only Conventional Commits format, `npm run check`, `npm run build`, `npm test`, and "Documentation updated" — omitting `npm run lint`, `npm run coverage`, and `npm run check:licenses`, all three of which README's "Local development" section lists and `build-poems.yml`'s `build` job actually gates on.
**Impact:** A contributor who checks every box on the template in good faith can still fail CI on lint/coverage/licence grounds, because the template never asked.
**Direction:** addressed by R-06.

## CI/CD and release engineering (CI)

**Strengths:** `build-poems.yml`'s `build` job runs test → coverage → lint → licence-check → whitespace-check → build → build-artefact-check → (non-blocking) a11y, in that order; every workflow file carries unusually thorough inline rationale for its own design choices. `required-checks-drift.yml` (new since the prior review) diffs the live branch-protection ruleset against `.github/required-checks.txt` daily and found zero drift when checked directly against GitHub's own ruleset this review. No workflow uses `pull_request_target`; only first-party Actions are used.

### F-CI-01 — No mechanism nudges a stale, CI-red Dependabot PR toward a rebase · **Low**
**Evidence:** Dependabot's default `rebase-strategy` only re-rebases on a textual merge conflict, not a red status check against an unconflicted base — exactly PR #291's situation (`mergeable: MERGEABLE`, `build: FAILURE` for 6 days with no bot action).
**Impact:** Low, normal mechanics — but a minor recurring piece of manual upkeep every time an unrelated fix lands on `main` between a Dependabot PR's open and its review.
**Direction:** addressed by R-07.

### F-CI-02 — `shellcheck` directives exist in the shell scripts, but `shellcheck` never runs in CI · **Low**
**Evidence:** `# shellcheck source=`/`# shellcheck disable=` comments exist in `scripts/check-changelog-section.sh` and `scripts/assemble-changelog.sh`, but no CI job runs `shellcheck` anywhere.
**Impact:** Static analysis the author already trusts enough to annotate for isn't enforced for anyone else touching these required-check-adjacent/release-critical scripts.
**Direction:** addressed by R-08.

## Performance and scalability (PERF)

**Strengths:** A genuine two-tier incremental-build cache (cheap manifest pre-check before the expensive full derivation); no N+1 or quadratic hot spots found in the build pipeline (`yamlCache` ensures each poem's YAML is parsed at most once per build); static file serving streams via `fs.createReadStream(...).pipe(res)` rather than buffering; the dev server's resource handling (traversal guards before any `fs` access, graceful `close()`) is sound.

### F-PERF-01 — Dev server's `/all-poems` endpoint re-renders every poem on every request · **Low**
**Evidence:** `serve-static.js`'s `/all-poems` route calls `concatenateAllHtmlFiles()` unconditionally on every hit, bypassing the incremental-build machinery. Carried forward unchanged from the 2026-09-21 review.
**Impact:** Negligible at this repo's own 6-poem dev corpus; would matter for a large consumer repo.
**Direction:** not urgent; watch item.

### F-PERF-02 — Full (non-incremental) build loops are sequential with no parallelism · **Low**
**Evidence:** `buildAllPoems()` and `convertAllPoemsToYaml()` each use a single synchronous `for` loop. Carried forward unchanged from the 2026-09-21 review.
**Impact:** Immaterial today; only matters at a scale (hundreds of poems, from-scratch build) this repo doesn't itself exercise.
**Direction:** not worth acting on absent a real report; watch item.

## Usability and accessibility (UX)

**Strengths:** CLI `--help` is uniformly good across all 12 entry points, routed through the shared `cli-help.js` helper. The Vim plugin installs and works exactly as documented. Every interactive control in the Pug templates is a real `<button>`/`<a>` with correct ARIA wiring, matched by CSS attribute selectors. The `#707070` WCAG contrast fix from the prior review holds, with a dated, citation-backed comment. Every code example in `docs/RENDERER-BROWSER.md` runs exactly as documented. `npm run a11y` correctly detects the absence of an installable Chromium in this sandbox and exits 0 with its documented message rather than failing — `discoverCheckTargets()`'s broadened sample from the prior review's #233 fix is confirmed in code, though its actual axe-core output remains unverified here (same gap the prior review recorded).

### F-UX-01 — `serve-static.js` crashes with a raw Node.js stack trace on a port collision, instead of a clear next step · **Medium**
**Evidence:** `src/tools/serve-static.js:429-431` has no `server.on('error', ...)` handler anywhere in the file. Reproduced directly: a second `node src/tools/serve-static.js --port 8080` while one is already bound produces an unhandled `EADDRINUSE` exception with a raw Node stack trace, not one of this tool's own clean `console.error(...)` messages.
**Impact:** `npm start` is the first command a new user runs after `npm run build`; a stray background process on 8080 is an easy way to hit this, and the fix ("pass `--port <n>`, or stop the other process") is never stated.
**Direction:** addressed by R-04.

## Documentation (DOC)

**Strengths:** the config-example/code sync is exemplary — every key `poetic-config.js` documents is both read by exactly the files the docs claim and fully documented in `examples/poetic-config.example.yaml`, with no undocumented or stale key found. `docs/BUILD.md`'s step numbering is correct throughout (confirming the prior review's fix holds). `CONTRIBUTING.md`, the issue template, and the PR template are all short, accurate, and consistent with `AGENTS.md`'s rules verbatim. `CHANGELOG.md`'s `[Unreleased]` section is correctly empty with no version drift.

### F-DOC-01 — `docs/YAML-SCHEMA.md` omits the `$ref` form for postscript notes, which `poem-to-yaml.js` actually emits · **Medium**
**Evidence:** converting the framework's own `_example.poem` produces a `postscript` entry shaped `{ $ref: _shared.yaml#/disclaimer }`; `docs/YAML-SCHEMA.md`'s "Postscript Notes" section documents only `{ label, params, content }`. `docs/POEM-TO-YAML.md:73` explicitly promises "see `docs/YAML-SCHEMA.md` for the exact shapes," but the `$ref` shape isn't there — the same class of gap the 2026-09-21 review found and fixed for the `parts` mixed-segment field.
**Impact:** A consumer building a renderer/validator against the documented YAML shape would miss a real, used variant.
**Direction:** addressed by R-02.

### F-DOC-02 — `src/poems/yaml/_example.yaml`, cited by `docs/POEM-TO-YAML.md` as "Expected YAML output for the example," has drifted from the actual converter output and has no test guarding it · **Medium**
**Evidence:** running `convertPoemToYaml('src/poems/poem/_example.poem')` today and diffing against the committed `_example.yaml` shows two real differences (a missing escaped-`%` clause in Stanza 2; a missing `example.preamble` directive entry). `_example.poem` was last touched 2026-07-19; `_example.yaml` was last touched 2026-07-10 and never regenerated since. `test/golden/_example.yaml` — the fixture CI actually protects — matches current output byte-for-byte; only the doc-cited copy has drifted.
**Impact:** a reader following the doc's own pointer to "the expected YAML output" lands on a file that silently under-represents two documented features, with no CI signal that it's wrong.
**Direction:** addressed by R-03.

### F-DOC-03 — README's "Local development" checklist omits `npm run build` / `npm run check:build`, which CI actually gates on · **Low**
**Evidence:** `README.md:386-394` lists 5 commands as "the same checks your pull request will run against in CI," omitting two blocking gates (`build`, `check:build`) that `build-poems.yml` actually runs.
**Impact:** minor — a contributor following the list precisely wouldn't catch a broken build locally before pushing, despite the list's claim of CI parity.
**Direction:** addressed by R-06.

## Governance and project health (GOV)

**Strengths:** licence posture is sound and actively maintained (the PSF-2.0 allow-list fix, #292, shipped with a documented rationale); the contribution path the prior review recommended (`CONTRIBUTING.md`, issue template, PR template) is in place and adequate; issue/PR hygiene is excellent (zero open issues, five routine Dependabot PRs 3-6 days old, no stale human-authored PR); governance is self-auditing beyond documentation alone (`required-checks-drift.yml` found zero drift against GitHub's live ruleset this review).

### F-GOV-01 — No `CODE_OF_CONDUCT.md` · **Informational**
**Evidence:** confirmed absent at repo root and `.github/`. Carried forward unchanged from the prior review, which judged it not worth a dedicated recommendation.
**Impact:** negligible for a single-maintainer technical framework with no external-contributor friction observed.
**Direction:** none; informational, watch item.

### F-GOV-02 — Self-review disclosure covers the maintainer, not the review process that audits the maintainer · **Informational**
**Evidence:** `AGENTS.md`/`SECURITY.md` disclose the maintainer's self-review-by-design model; the periodic project-review process itself is run by the same maintainer's tooling with no outside commissioning party.
**Impact:** low — a natural extension of the already-disclosed bus factor, not a new risk.
**Direction:** none required; informational.

## Observability and operations (OPS)

**Strengths:** outbound network calls (Blogger/Google APIs) have real timeout (30s `AbortSignal.timeout`) and retry discipline, with a documented, deliberate exception for the non-idempotent `createPost` call. Failure diagnosis (`explainBloggerFailure()`) turns anonymous API errors into actionable, account-aware guidance without ever echoing a secret. Runbooks (`docs/BLOGGER.md`) cover every failure mode the code can produce, cross-referenced from the runtime error text itself. CI secrets handling follows least privilege (`contents: read`, env vars scoped to the one step that needs them, a feature-flag gate before any secret is referenced). Absence of metrics/tracing/health-check infrastructure is the right call — nothing here runs as a long-lived service.

### F-OPS-01 — `serve-static.js` has no per-request access logging · **Informational**
**Evidence:** the request handler never logs method/path/status per request. Carried forward unchanged from the prior review.
**Impact:** negligible — a local-loopback dev convenience server.
**Direction:** none needed; informational.

### F-OPS-02 — `blogger-auth.js`'s OAuth loopback listener has no timeout on waiting for the redirect · **Low**
**Evidence:** `waitForCode()` (`src/tools/blogger-auth.js:344-395`) blocks forever on an abandoned browser flow — no timer, unlike every other outbound call in this codebase, which applies a 30s timeout.
**Impact:** low — a one-shot interactive CLI tool; the practical failure mode is a Ctrl-C, not a service-level resource leak.
**Direction:** addressed by R-09.

## Data handling and privacy (DATA)

**Strengths:** the one personal/sensitive-data surface — Blogger OAuth credentials — is handled carefully end-to-end: atomic, mode-0600 writes with symlink-plant protection; an active on-disk permission check on every run; no real credential or personal data found committed anywhere; credentials never reach a log; the two-homes-for-credentials design (local file vs. GitHub secrets) is explicitly documented.

### F-DATA-01 — The one-time OAuth helper prints the raw refresh token to the terminal · **Informational**
**Evidence:** `blogger-auth.js:514-518` prints the token to stdout unconditionally, as the only practical way to get it into GitHub Actions secrets by hand.
**Impact:** low — the standard pattern for comparable CLI tools (e.g. `gh auth login`'s device-code display); residual exposure is terminal scrollback/session-recording, which the docs don't call out.
**Direction:** optional, not urgent; informational, watch item.
