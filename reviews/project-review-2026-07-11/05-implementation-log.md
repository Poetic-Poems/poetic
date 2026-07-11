# Implementation log — remediation of project-review-2026-07-11

**Skill:** project-remediation · **Started:** 2026-07-11 · **Project root:** `/home/wallen/Code/poetic`
**Revision at start:** `06b5e63` (main) · **Commit policy:** working-tree (changes left uncommitted; a suggested Conventional Commit subject is recorded per unit)

This log is the durable record of the campaign. It consumes
[03-recommendations.md](03-recommendations.md) and [04-improvement-prompts.md](04-improvement-prompts.md)
and the register at [../../TECH-DEBT.md](../../TECH-DEBT.md).

## Backlog (work units)

Thirteen recommendations plus three tech-debt entries were fused into fourteen work units. Overlaps
merged: R-09⇄TD26071107 and R-10⇄TD26071108 (each tech-debt entry cites its recommendation), and
TD26071109 is the register entry recording R-07's conscious deferral of the js-yaml v5 bump.

| Unit | Covers | Severity | Effort | Tier | Status |
|---|---|---|---|---|---|
| U-01 | R-01 (licence) | High | Small | — | already-resolved |
| U-02 | R-02 (site title configurable) | High | Small | — | already-resolved |
| U-03 | R-03 (build fails loudly) | Medium | Small | — | already-resolved |
| U-04 | R-04 (Blogger credentials path) | Medium | Small | — | already-resolved |
| U-05 | R-05 (extract client JS + generator tests) | Medium | Medium | — | already-resolved |
| U-06 | R-06 (package.json metadata) | Medium | Small | — | already-resolved |
| U-07 | R-07 (npm ci, dependabot, dep bumps) | Low | Small | — | already-resolved |
| U-08 | R-08 (local-tool security hardening) | Low | Small | — | already-resolved |
| U-09 | R-09 + TD26071107 (dead tools; sync deletion) | Low | Small | high | pending |
| U-11 | R-11 (dedup poem listing; anchor sync-blogger) | Low | Small | mid | pending |
| U-12 | R-12 (keyboard-accessible table sorting) | Low | Small | mid | pending |
| U-13 | R-13 (documentation sweep) | Low | Small | low | pending |
| U-10 | R-10 + TD26071108 (linter + editor baseline) | Low | Medium | mid | pending |
| U-14 | TD26071109 (js-yaml v5 bump) | Low | Medium | — | deferred |

Order of implementation for pending units: U-09, U-11, U-12, U-13, U-10 (dependencies already satisfied —
R-05, on which R-10 and R-12 depend, is resolved; U-10 runs last so its linter sees the final tree).

## Reconciliation (Step 2)

Baseline before any change: `npm test` → **327 pass, 0 fail** at `06b5e63`.

**R-01–R-08 were already implemented** in commits between `bceb0cc` (the review) and `06b5e63`. Verified
against the acceptance criteria, not just commit subjects:

- **U-01 / R-01** — `LICENCE` file present (British spelling), `"license": "MIT"` in package.json, README
  §Licence, `LICENCE` in FRAMEWORK_PATHS (`scripts/sync-framework.sh:131`), CHANGELOG entry. Commit `c5d7825`.
- **U-02 / R-02** — `title` key handled in `poetic-config.js`; no `Fragments` string remains in `src/tools/`.
  Commit `e0ac584`.
- **U-03 / R-03** — `process.exit(1)` on conversion failure in `poem-to-yaml.js` `--all`; `resolveRefs` has a
  `visited` cycle guard (`poem-render.js:144-162`). Commit `79ea363`.
- **U-04 / R-04** — `sync-blogger.js` reads both top-level and `installed`-nested shapes
  (`client_id: parsed.client_id ?? nested.client_id`); credentials written `mode: 0o600`. Commit `f8f9500`.
- **U-05 / R-05** — client JS extracted to `public/all-poems.js`, `public/index.js`, `public/date-utils.js`;
  generator tests added. Commits `e105d2a`, `f4b94bc`.
- **U-06 / R-06** — package.json has `name`, `version`, `private`, `license`, `engines`. Commit `c5d7825`.
- **U-07 / R-07** — `npm ci` in both workflows, `.github/dependabot.yml` present, markdown-it/pug/js-beautify
  bumped; js-yaml v5 consciously deferred → TD26071109. Commits `6dc35f5`, `937e7a4`, `a704d5d`.
- **U-08 / R-08** — `serve-static.js` binds `127.0.0.1` with `--host` opt-out and `isWithinRoot` containment;
  `blogger-auth.js` sends+verifies CSRF `state` and S256 PKCE; `SECURITY.md` present. Commit `9640c08`.

**U-09–U-13 confirmed still open** in the working tree (dead tools present, no sync deletion, no linter/
editorconfig, no `listPoemYamlFiles` helper, sync-blogger still on `process.cwd()`, `<th onclick>` sort
headers with no `aria-sort`, "Framgents" typo present). **U-14** is a conscious deferral.

## Unit outcomes

### U-09 — Remove dead tools; handle upstream deletions in sync · **resolved**

**Covers:** R-09, TD26071107 · **Findings:** F-CODE-02, F-ARCH-03 · **Tier:** high-capability (opus)

**Changed:**
- Deleted `src/tools/convert-html-to-yaml.js` and `src/tools/update-analysis-format.js` (dead migration tools anchored on the defunct `poems/` layout). Only repo references were TECH-DEBT.md and the review docs.
- `scripts/sync-framework.sh` — added upstream-deletion propagation after the checkout loop: when the previously synced commit is available locally, `git diff --diff-filter=D OLD..NEW -- FRAMEWORK_PATHS` drives `git rm --ignore-unmatch` for each path, honouring `is_skipped()` and only for paths the consumer actually tracks. Three fallback guards (no prior commit / same commit / commit not in object DB) each print an explanatory line and skip, preserving `set -euo pipefail`.
- `test/sync-framework.test.js` — 3 new hermetic tests (deletion propagates; skip_paths honoured for a deleted path; first-sync fallback message).
- `CHANGELOG.md` — `[Unreleased]`: Changed (sync deletion behaviour) + Removed (two tools).
- `TECH-DEBT.md` — TD26071107 deleted per the register's delete-on-resolve convention (TD26071108, TD26071109 untouched).

**Verification (independently re-run):** `bash -n scripts/sync-framework.sh` OK; `npm test` → **330 pass, 0 fail** (was 327; +3 new tests); working tree scope clean (only the intended files + the campaign's own bookkeeping). Read the deletion block directly — conservative as required: FRAMEWORK_PATHS-scoped pathspec, `--diff-filter=D` (never "absent at target"), skip_paths-honouring, tracked-only gate, strict-mode-safe.

**Suggested commit:** `feat(sync-framework): propagate upstream deletions and drop dead migration tools`

### U-11 — Deduplicate poem listing; anchor sync-blogger on repo root · **resolved**

**Covers:** R-11 · **Findings:** F-CODE-03, F-ARCH-04 · **Tier:** mid-cost (sonnet)

**Changed:**
- `src/tools/poem-render.js` — new exported `listPoemYamlFiles(dir)` (accepts `.yaml`/`.yml`, excludes `YAML-SCHEMA*` and `_`-prefixed), documented in the module header.
- `src/tools/build-poems.js`, `src/tools/build-all-poems.js` (both call sites) — inline readdir/filter chains replaced with the helper; behaviour unchanged (`.sort()` preserved in `generateIndexHtml`).
- `src/tools/sync-blogger.js` — uses the helper (behaviour change: `.yml` poems now sync, `YAML-SCHEMA*` now excluded) and anchors on `REPO_ROOT` (`require('./repo-root')`, `readPoeticConfig(REPO_ROOT)`) instead of `process.cwd()`.
- `test/poem-render.test.js` — 3 new tests pinning the filter union, basename return, and empty-dir case.
- `CHANGELOG.md` — two `[Unreleased]` → Fixed entries (filter union / `.yml`+`YAML-SCHEMA`; REPO_ROOT anchoring).

**Verification (independently re-run):** `npm test` → **333 pass, 0 fail** (+3); helper present and exported; all four call sites converted; no inline filters remain; `sync-blogger.js` runs identically from repo root and from a subdirectory (no ENOENT). Out-of-scope `yaml-to-poem.js` (different directory + explicit skip-list, not one of the four named sites) deliberately left untouched.

**Suggested commit:** `refactor(build): unify poem-YAML listing into listPoemYamlFiles; anchor sync-blogger.js on REPO_ROOT`

### U-12 — Keyboard-accessible table sorting · **resolved**

**Covers:** R-12 · **Findings:** F-UX-01 · **Tier:** mid-cost (sonnet)

**Changed:**
- `src/tools/build-all-poems.js` — the three sortable headers now generate `<th class="sortable" aria-sort="none"><button type="button" class="sort-button" data-column="N" data-sort-type="…">…</button></th>` (real buttons, no inline `onclick`).
- `public/all-poems.js` — `initSortButtons()` wires each `.sort-button` via `addEventListener('click', …)`; `sortTable()` sets `aria-sort="ascending"|"descending"` on the active `<th>` and `"none"` on the others alongside the existing class toggle. Native `<button>` gives Tab focus + Enter/Space activation, so no custom keydown handler is needed.
- `public/poetic.css` — `.toc-table th .sort-button` inherits font/colour, fills the cell (`box-sizing: border-box`), keeps `cursor: pointer`, adds `:focus-visible`; the `::after` sort-indicators retargeted onto the button.
- `CHANGELOG.md` — `[Unreleased]` reader-facing accessibility entry.

**Verification (independently re-run):** `npm test` → **333 pass, 0 fail**; scope clean; read the generated markup (buttons + `aria-sort`) and the JS (`addEventListener`, aria-sort maintenance) directly; `grep` confirms no `onclick="sortTable"` remains. **Caveat:** live-browser keyboard/screen-reader verification (Tab/Enter/Space, visual indicators) could not be performed in this environment by either the subagent or the orchestrator; the change relies on native `<button>` semantics (inherently keyboard-operable) + `aria-sort`, verified statically. A quick manual `npm run build:all` keyboard pass by the maintainer is worth doing before release.

**Suggested commit:** `fix(a11y): make all-poems.html sort headers keyboard- and screen-reader-accessible`

### U-13 — Documentation sweep · **resolved**

**Covers:** R-13 · **Findings:** F-DOC-02 · **Tier:** low-cost (haiku)

**Changed:**
- `README.md` — "Framgents" → "Fragments" in both the reference-link use (line 54) and its definition (line 80), keeping the label consistent; `public/` repository-structure note corrected to "Generated HTML (git-ignored); tracked framework assets (CSS, JS, footer, logos)".

**Verification (independently re-run):** `grep` confirms no "Framgents" remains anywhere in README/docs and the reference label resolves; `npm run check` → clean; scope limited to README.md. No CHANGELOG entry (routine doc fix, exempt). Sweep of README/docs found no further misspellings, code contradictions, or as-built violations.

**Suggested commit:** `docs: fix Fragments typo and clarify public/ description`

### U-10 — Adopt a linter and editor baseline · **resolved**

**Covers:** R-10, TD26071108 · **Findings:** F-CODE-05, F-TOOL-01 · **Tier:** mid-cost (sonnet)

**Changed / added:**
- `eslint.config.js` (new) — flat config: Node-CommonJS block (`src/tools`, `scripts`, `test`), browser block (`public/*.js`), from `@eslint/js` recommended, relaxed to the codebase's style (`no-console` off; `eqeqeq: smart`; `no-unused-vars` with `^_` ignores; `no-constant-condition: {checkLoops:false}`).
- `.editorconfig` (new) — 2-space/LF/final-newline/trim, mirroring `remove-trailing-spaces.sh` exceptions for `*.poem`/`*.md`.
- `.githooks/check-commit-format.sh` (new) — Conventional-Commits pattern extracted from `commit-msg` as the single source of truth; `.githooks/commit-msg` now delegates to it.
- `.github/workflows/commit-format.yml` (new) — `on: pull_request`, validates each PR commit subject via the shared script.
- `.github/workflows/build-poems.yml` — added a Lint step; path filters include the new config files.
- `package.json`/`package-lock.json` — `lint` script + first devDependencies: `eslint ^9.39.5`, `@eslint/js ^9.39.5`. (Initially eslint 10, downgraded to 9 in a follow-up so the installed engine floor `^18.18 || ^20.9 || >=21.1` stays consistent with the repo's synced `engines.node: ">=18"` — eslint 10 requires node ≥20.19.)
- Minimal lint fix-ups (behaviour-preserving, guarded by the unchanged 333-test suite): removed 4 vestigial `eslint-disable` comments in `serve-static.js`; `_`-renamed unused catch bindings in `poem-to-yaml.js`/`song-handlers.js`/`sync-blogger.js`; dropped useless regex escapes; removed 2 dead imports in tests; one reasoned disable retained.
- `scripts/sync-framework.sh` — `eslint.config.js` + `.editorconfig` added to `FRAMEWORK_PATHS` (they govern the synced `src/tools`/`test`; the commit-format hook + CI job were deliberately **not** synced, matching the pre-existing `.githooks/` exclusion — Conventional Commits is a framework-repo convention, not one imposed on poem consumers).
- `CHANGELOG.md` — two `[Unreleased]` → Added entries.
- `TECH-DEBT.md` — TD26071108 deleted per the register's convention (only TD26071109 remains).

**Verification (independently re-run):** `npm run lint` → **exit 0**; `npm test` → **333 pass, 0 fail**; `npm run check` clean; `npm run build` + `npm run check:build` OK; both workflow YAMLs parse; installed eslint engines now include node 18. Full working-tree scope reviewed — every change maps to a unit, nothing unexpected touched.

**Suggested commit:** `feat(lint): add ESLint, .editorconfig, and a CI commit-format backstop`

### U-14 — js-yaml v5 bump · **deferred** (maintainer decision required)

**Covers:** TD26071109 · **From:** R-07's conscious deferral · **Tier:** — (not dispatched)

**Why deferred, not forced:** this is a dependency **major** bump whose blocker is a genuine semantic decision that belongs to the maintainer, not the remediation skill. js-yaml v5's timestamp-detection regex no longer treats a zero-padded placeholder year `0000` as a timestamp, so `yaml.dump({date: '0000-01-01'})` emits `date: 0000-01-01` (unquoted) where v4 emitted `date: '0000-01-01'` (quoted). This breaks exactly one golden fixture — `test/golden/_minimal.yaml`, which uses the placeholder year `0000`. **Real four-digit poem dates (e.g. 2023) are unaffected**, and only `yaml.load`/`yaml.dump` are used in the codebase, so no v5 API-removal issue exists.

**To resolve (maintainer's choice):** either (a) accept that v5's narrower timestamp regex is fine for this framework — real dates are always four-digit years — then bump js-yaml to `^5`, regenerate/adjust `test/golden/_minimal.yaml` (or change the `_minimal` fixture's placeholder year away from `0000`), and confirm `npm test`; or (b) leave on `^4.1.0` until upstream intent is confirmed. TD26071109 remains in the register recording this.

**Evidence unchanged:** `package.json` still pins `js-yaml ^4.1.0`; TD26071109 present in `TECH-DEBT.md`.

## Summary

Run completed 2026-07-11. Revision at start `06b5e63`; changes left **uncommitted** in the working tree (default policy), one suggested Conventional Commit subject recorded per unit above.

| Outcome | Count | Units |
|---|---|---|
| Resolved this run | 5 | U-09, U-10, U-11, U-12, U-13 |
| Already resolved (before run) | 8 | U-01…U-08 |
| Deferred (maintainer decision) | 1 | U-14 (js-yaml v5) |
| Blocked | 0 | — |
| Remaining | 0 | — |

**Recommendations cleared:** R-01…R-13 (all thirteen). **Tech-debt cleared:** TD26071107 (via U-09), TD26071108 (via U-10). **Tech-debt remaining:** TD26071109 (deferred, U-14).

Final gate on the full working tree: `npm run lint` exit 0 · `npm test` 333 pass / 0 fail · `npm run check` clean · `npm run build` + `npm run check:build` OK · both changed workflows parse.

Suggested commit sequence if committing the working tree (one per unit):
1. `feat(sync-framework): propagate upstream deletions and drop dead migration tools`
2. `refactor(build): unify poem-YAML listing into listPoemYamlFiles; anchor sync-blogger.js on REPO_ROOT`
3. `fix(a11y): make all-poems.html sort headers keyboard- and screen-reader-accessible`
4. `docs: fix Fragments typo and clarify public/ description`
5. `feat(lint): add ESLint, .editorconfig, and a CI commit-format backstop`

Note for the fragments-and-unity consumer repo (from R-02, already resolved upstream): set `title: Fragments & Unity` in its `.poetic-config.yaml` before its next framework sync so its pages keep the correct site name.
