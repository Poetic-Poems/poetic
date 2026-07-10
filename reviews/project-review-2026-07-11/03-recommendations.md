# Recommendations

Thirteen recommendations, ordered by severity first and, at equal severity, by effort — quick
wins before longer campaigns. Every High and Medium finding is covered; the one uncovered Low
(F-GOV-02, bus factor) has no action available beyond the project's existing documentation
discipline. Each recommendation's "intended end state" doubles as the acceptance criteria for
its improvement prompt in [04-improvement-prompts.md](04-improvement-prompts.md).

| ID | Recommendation | Severity | Effort | Addresses |
|---|---|---|---|---|
| R-01 | Add a licence | High | Small | F-GOV-01 |
| R-02 | Make the site title configurable | High | Small | F-ARCH-01 |
| R-03 | Make the build fail loudly | Medium | Small | F-ARCH-02, F-UX-02, F-OPS-02, F-ARCH-05 |
| R-04 | Fix the Blogger credentials-file path end-to-end | Medium | Small | F-CODE-06, F-CODE-04, F-DOC-01, F-TEST-02, F-SEC-02 (partial), F-OPS-01 (optional) |
| R-05 | Extract embedded client JS and test the generators | Medium | Medium | F-CODE-01, F-TEST-01, F-TOOL-02 |
| R-06 | Complete package.json metadata | Medium | Small | F-DEPS-01 |
| R-07 | CI hygiene: `npm ci` and automated dependency updates | Low | Small | F-CI-01, F-CI-02, F-DEPS-02 |
| R-08 | Local-tool security hardening and SECURITY.md | Low | Small | F-SEC-01, F-SEC-02 (remainder), F-SEC-03 |
| R-09 | Remove dead tools; handle upstream deletions in sync | Low | Small | F-CODE-02, F-ARCH-03 |
| R-10 | Adopt a linter and editor baseline | Low | Medium | F-CODE-05, F-TOOL-01 |
| R-11 | Deduplicate poem listing; finish path anchoring | Low | Small | F-CODE-03, F-ARCH-04 |
| R-12 | Keyboard-accessible table sorting | Low | Small | F-UX-01 |
| R-13 | Documentation sweep | Low | Small | F-DOC-02 |

## R-01 — Add a licence

**Severity:** High · **Effort:** Small · **Addresses:** F-GOV-01

**Current state:** No LICENSE file, no `license` field in package.json, while the README
invites the public to use the template and consumers legally depend on copying framework files.

**Intended end state:** A LICENSE file at the repo root containing an OSI-approved licence of
the author's choosing (MIT matches the project's spirit and consumer model; any permissive
licence works); `"license"` set correspondingly in package.json; the README stating the
licence; the LICENSE file added to `FRAMEWORK_PATHS` in `scripts/sync-framework.sh` so
consumers receive it; a CHANGELOG entry under `[Unreleased]`.

**Approach:** The only genuine decision is *which* licence, and it belongs to the author —
the implementing agent should default to MIT unless told otherwise and say so in its report.
No dependency on other recommendations.

## R-02 — Make the site title configurable

**Severity:** High · **Effort:** Small · **Addresses:** F-ARCH-01

**Current state:** "Fragments & Unity" is hard-coded in `all-poems.html`'s title/heading
(build-all-poems.js:124,133) and the default index.html template (:709,:718); consumers have
no way to change it.

**Intended end state:** A top-level `title` key in `.poetic-config.yaml` (read by
`poetic-config.js`) naming the site; both generators use it, with a neutral default (e.g. the
existing `subtitle` default "My Poems" family) when unset; the self-heal path also keeps an
existing index.html's `<h1>`/`<title>` in sync the way `subtitle` already is; documented in the
README config table, `examples/poetic-config.example.yaml`, and `docs/BUILD.md`; a CHANGELOG
entry; existing behaviour for the author's own site preserved by setting the key in
fragments-and-unity (noted in the report, done in that repo).

**Approach:** Mirror exactly how `subtitle` flows through `build-all-poems.js` — the pattern
(config → default → replacement regex for existing files) already exists. Keep the CLAUDE.md
rule in mind: the example config must be updated in the same change.

## R-03 — Make the build fail loudly

**Severity:** Medium · **Effort:** Small · **Addresses:** F-ARCH-02, F-UX-02, F-OPS-02, F-ARCH-05

**Current state:** `poem-to-yaml.js --all` logs per-poem conversion errors and exits 0, so CI
deploys a site missing the broken poem; all-poems render errors are embedded as text in the
published page; `generateIndexHtml` failures only log; a cyclic `$ref` crashes with a stack
overflow.

**Intended end state:** any poem that fails conversion or rendering makes the corresponding
npm script exit non-zero (so CI stops before deploy); the "Error rendering poem" placeholder
no longer ships in published HTML (fail instead); `$ref` cycles are detected and reported as a
clear error naming the file, like variable cycles already are; stale-artefact warnings remain
warnings; tests cover each failure mode.

**Approach:** Count errors in `poem-to-yaml.js` main() and `process.exit(1)` after the loop
(mirroring build-poems.js:185-187); replace the all-poems catch block with a rethrow or error
count that fails `main()`; add a visited-set to `resolveRefs`. Verify the framework repo's
legitimate zero-poem build still succeeds.

## R-04 — Fix the Blogger credentials-file path end-to-end

**Severity:** Medium · **Effort:** Small · **Addresses:** F-CODE-06, F-CODE-04, F-DOC-01, F-TEST-02, F-SEC-02 (file mode), F-OPS-01 (optional)

**Current state:** blogger-auth.js saves flat JSON; sync-blogger.js reads only the nested
`installed` shape, so the saved file is silently ignored. Credentials then live in module-level
mutable state populated by a `resolveConfig` the file header calls pure; the file is written
world-readable; no test round-trips the seam.

**Intended end state:** sync-blogger reads both shapes (flat and `installed`-nested) — or the
two tools agree on one documented shape; `resolveConfig` returns credentials instead of setting
module globals, and `getAccessToken` receives them explicitly; the header comment matches
reality; the credentials file is written with mode 0600; a test writes a file in
blogger-auth's format and asserts sync-blogger's resolveConfig picks it up; docs/BLOGGER.md
reflects the flow. Optionally, wrap Blogger API calls in a single retry on 429/5xx.

**Approach:** Accept-both-shapes is the backwards-compatible route (existing users may hold
either file). Keep the exported function signatures stable where tests rely on them, extending
rather than breaking `resolveConfig`'s return shape.

## R-05 — Extract embedded client JS and test the generators

**Severity:** Medium · **Effort:** Medium · **Addresses:** F-CODE-01, F-TEST-01, F-TOOL-02

**Current state:** ~370 lines of client JS live inside template literals in
build-all-poems.js, duplicating date logic and filter logic, patched into old builds by a
greedy regex; the generators (slug guards, self-heal, array serialisation) have no tests.

**Intended end state:** the all-poems and index client scripts live as real .js assets (e.g.
`public/poetic-all-poems.js`, `public/poetic-index.js`, or folded into `public/poetic.js`)
referenced by `<script src>` — making the self-heal regex unnecessary or trivial (a script tag
swap); poem data reaches the index page as embedded JSON data rather than generated JS object
literals; the assets are added to `FRAMEWORK_PATHS`; new tests cover `generateIndexHtml` and
`concatenateAllHtmlFiles` output (slug collision, empty slug, title with quotes, favicon/
subtitle/title sync on an existing file) using fixture poems, which also gives the framework
repo a tested non-zero-poem path; all 292 existing tests still pass and a built page works in
the browser.

**Approach:** The self-heal contract with previously built consumer index.html files is the
delicate part: replacing the whole managed block with a `<script src>` reference must handle
pages built by every prior version (the existing greedy regex actually helps here — use it one
last time to remove the legacy inline block). Verify with `npm run build` plus loading the
site. Touches sync-framework.sh — coordinate with R-09 if run together.

## R-06 — Complete package.json metadata

**Severity:** Medium · **Effort:** Small · **Addresses:** F-DEPS-01

**Current state:** package.json has only `dependencies` and `scripts` — no name, version,
licence, or engines — and is synced verbatim to consumers.

**Intended end state:** `name` (e.g. "poetic"), `version` matching the current release,
`license` matching R-01, `engines: { "node": ">=18" }`, `private: true` unless npm publishing
is intended; a release-process note (or script) keeping `version` aligned with tags; consumers
receive the fields on next sync; CHANGELOG entry.

**Approach:** Trivial edit; the only care point is stating how `version` stays current — at
minimum a line in the release section of CLAUDE.md/README. Run after R-01 so the licence value
is known.

## R-07 — CI hygiene: `npm ci` and automated dependency updates

**Severity:** Low · **Effort:** Small · **Addresses:** F-CI-01, F-CI-02, F-DEPS-02

**Current state:** Workflows run `npm install` against a committed lockfile; nothing watches
for new advisories or updates; js-beautify and js-yaml sit a major behind.

**Intended end state:** `npm ci` in both installing workflows; a `.github/dependabot.yml`
(npm + github-actions ecosystems, weekly) or equivalent; optionally an `npm audit` step in
build-poems.yml; the two major-version bumps either taken (tests green) or consciously
deferred with a TECH-DEBT.md entry.

**Approach:** Mechanical. The major bumps need a test run each — js-beautify 2.x may reflow
generated HTML, which would churn golden expectations in consumers; if so, defer it and record
the reason. Run after R-06 (engines field informs the node-version matrix if one is added).

## R-08 — Local-tool security hardening and SECURITY.md

**Severity:** Low · **Effort:** Small · **Addresses:** F-SEC-01, F-SEC-02 (state/PKCE), F-SEC-03

**Current state:** Dev server listens on all interfaces with a prefix-only containment check;
the OAuth consent flow has no state/PKCE; there is no vulnerability-disclosure route.

**Intended end state:** serve-static binds 127.0.0.1 by default with a `--host` opt-out;
containment compares against `ROOT_DIR + path.sep`; blogger-auth sends and verifies a random
`state` (PKCE too if straightforward with Google's token endpoint); a short SECURITY.md names a
private contact route; tests cover the containment fix.

**Approach:** Each item is a few lines. Keep the dev server's existing CLI flags and defaults
documented in its usage string.

## R-09 — Remove dead tools; handle upstream deletions in sync

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-02, F-ARCH-03

**Current state:** convert-html-to-yaml.js and update-analysis-format.js reference a defunct
layout and ship to consumers; sync-framework.sh overlays but never deletes, so removed
framework files persist downstream forever.

**Intended end state:** the two dead tools deleted (CHANGELOG entry; their absence propagates
once deletion handling exists); sync-framework.sh removes files under framework-owned directory
paths that no longer exist at the target commit (respecting skip_paths), or — if deletion is
judged too risky — the limitation documented in docs/SCRIPTS.md and a TECH-DEBT.md entry
recording it.

**Approach:** For deletion semantics, `git diff --name-only --diff-filter=D` between the
previously synced commit and the target, filtered to FRAMEWORK_PATHS, is a surgical option that
avoids clobbering consumer files. Test in a scratch consumer clone before release; this script
runs unattended in consumer CI.

## R-10 — Adopt a linter and editor baseline

**Severity:** Low · **Effort:** Medium · **Addresses:** F-CODE-05, F-TOOL-01

**Current state:** No linter or formatter; vestigial eslint-disable comments; commit-message
hook is opt-in per clone with no CI backstop; no .editorconfig.

**Intended end state:** a linter (ESLint flat config or Biome) with a minimal rule set that
passes on the existing codebase (fix or explicitly disable, no blanket ignores), wired into
`npm run check` or a sibling script and into build-poems.yml; an .editorconfig matching current
style; a commit-format check in CI (e.g. on PR titles or commits); the vestigial
eslint-disable comments either honoured or removed; config synced to consumers only if it
doesn't burden them.

**Approach:** Run after R-05 so the extracted client JS gets linted too. Keep the rule set
small — the codebase is already consistent; the goal is a ratchet, not a restyle.

## R-11 — Deduplicate poem listing; finish path anchoring

**Severity:** Low · **Effort:** Small · **Addresses:** F-CODE-03, F-ARCH-04

**Current state:** The YAML-listing filter block exists in three places plus a diverged
variant in sync-blogger.js that misses `.yml` files; sync-blogger and bare `readPoeticConfig()`
still anchor on process.cwd().

**Intended end state:** one exported helper (natural home: poem-render.js or a small
poem-files.js) used by build-poems, build-all-poems (both call sites) and sync-blogger —
making sync-blogger accept `.yml` and skip `YAML-SCHEMA` like the builders; sync-blogger uses
REPO_ROOT; behaviour otherwise identical; tests pin the helper's filter rules.

**Approach:** Pure consolidation refactor; the `.yml` fix is the one deliberate behaviour
change and deserves its own CHANGELOG line.

## R-12 — Keyboard-accessible table sorting

**Severity:** Low · **Effort:** Small · **Addresses:** F-UX-01

**Current state:** all-poems TOC sort headers are `<th onclick=...>` — unreachable by keyboard,
unannounced to screen readers.

**Intended end state:** headers contain real `<button>`s (or carry tabindex + Enter/Space
handling), with `aria-sort` set on the active column; visual style unchanged; works in the
built page.

**Approach:** If R-05 has run, make the change in the extracted asset; otherwise in the
template literal. Verify by keyboard in the served site (`npm run build:all`).

## R-13 — Documentation sweep

**Severity:** Low · **Effort:** Small · **Addresses:** F-DOC-02

**Current state:** README typo "Framgents & Unity" (line 80); README describes `public/` as
git-ignored though tracked framework assets live there; assorted small drift risks.

**Intended end state:** typo fixed; the repository-structure note describes `public/`
accurately (generated HTML ignored; framework assets tracked); a quick pass over docs/ for
similar small inaccuracies; no historical-language regressions introduced (per CLAUDE.md's
as-built principle).

**Approach:** Entirely mechanical.
