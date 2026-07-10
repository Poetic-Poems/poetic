# Findings

Findings are grouped by review dimension, each with evidence a reader can verify
independently. Severities weigh the project's purpose: this is a small personal framework, but
it is *distributed* — consumers copy its files — so defects that propagate to consumers are
rated on the harm they cause downstream, not on the repo's size. Strengths are recorded per
dimension; they are what the recommendations must not break.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 6 |
| Low | 22 |

## Architecture and design (ARCH)

**Strengths:** Clear layering — parser → render model → emitters — with one canonical parse
(`parsePoemFile`) backing the YAML, HTML, and plain-text outputs so semantics cannot drift
between pipelines. The song-handler registry ([src/song-handlers.yaml](../src/song-handlers.yaml),
[src/tools/song-handlers.js](../src/tools/song-handlers.js)) is declarative end-to-end with
documented deep-merge overrides. [repo-root.js](../src/tools/repo-root.js) anchors build paths
to the module location, resolving the prior review's working-directory finding.

### F-ARCH-01 — Consumer site name "Fragments & Unity" is hard-coded in generated pages · **High**

**Evidence:** [build-all-poems.js:124](../src/tools/build-all-poems.js#L124) and
[:133](../src/tools/build-all-poems.js#L133) bake `Fragments &#38; Unity` into
`all-poems.html`'s `<title>` and `<h1>`; [:709](../src/tools/build-all-poems.js#L709) and
[:718](../src/tools/build-all-poems.js#L718) do the same in the default `index.html` template.
`.gitignore` ignores `public/*.html`, so CI regenerates both files on every deploy from a fresh
checkout. `.poetic-config.yaml` offers `subtitle` but no site-name key
([poetic-config.js](../src/tools/poetic-config.js), README config table).

**Impact:** every consumer other than the author's own fragments-and-unity site deploys pages
headed with another site's name. This is the one place the framework's provider/consumer
separation fails outright, and it is invisible to the author because their sole consumer is
that site.

**Direction:** add a site-name config key and thread it through both generators. Addressed by R-02.

### F-ARCH-02 — `.poem` conversion failures do not fail the build · **Medium**

**Evidence:** in `--all` mode, [poem-to-yaml.js:1603-1611](../src/tools/poem-to-yaml.js#L1603-L1611)
catches per-file errors, logs them, and never sets a non-zero exit code. `npm run build` chains
the steps with `&&`; a failed poem simply produces no YAML, so
[build-poems.js](../src/tools/build-poems.js)'s own error handling (which does `exit 1`,
[:185-187](../src/tools/build-poems.js#L185-L187)) never sees it, and
[check-build-artifacts.sh](../scripts/check-build-artifacts.sh) checks only three site-level
files. Generated YAML is gitignored, so in CI the poem vanishes from the deployed site.

**Impact:** a consumer's syntax error silently removes that poem from their published site; the
only trace is a warning in the Actions log of a green run.

**Direction:** count failures and exit non-zero. Addressed by R-03.

### F-ARCH-03 — `sync-framework.sh` never deletes files removed upstream · **Low**

**Evidence:** syncing uses `git checkout "$POETIC_COMMIT" -- "$path"` per framework path
([sync-framework.sh:166](../scripts/sync-framework.sh#L166) area), which overlays files but
does not remove ones absent at that commit — for directory paths such as `src/tools`, files
deleted upstream remain in the consumer.

**Impact:** dead framework files accumulate in consumer repos indefinitely (compounded by
F-CODE-02's already-dead tools). Addressed by R-09.

### F-ARCH-04 — Residual `process.cwd()` anchoring in two entry points · **Low**

**Evidence:** [sync-blogger.js:36](../src/tools/sync-blogger.js#L36) builds `YAML_DIR` from
`process.cwd()`; `readPoeticConfig()` defaults to `process.cwd()` and
[sync-blogger.js:476](../src/tools/sync-blogger.js#L476) calls it bare. Every other tool uses
`REPO_ROOT`.

**Impact:** running `node src/tools/sync-blogger.js` from any other directory fails obscurely
(ENOENT on the YAML dir) instead of working like its siblings. Addressed by R-11.

### F-ARCH-05 — `$ref` resolution has no cycle guard · **Low**

**Evidence:** [poem-render.js:129-188](../src/tools/poem-render.js#L129-L188) caches then
re-resolves referenced data with no cycle detection; a YAML `$ref` chain that loops back to
itself recurses until stack overflow. Contrast the parser's variable expansion, which detects
cycles and warns ([poem-to-yaml.js:479-495](../src/tools/poem-to-yaml.js#L479-L495)).

**Impact:** an authoring mistake crashes the build with a stack-overflow trace instead of a
clear "reference cycle" message. Addressed by R-03.

## Code quality and maintainability (CODE)

**Strengths:** Exceptional comment discipline — docstrings explain invariants and *why*, not
*what* (the substitution-once rule in `scanShellWord`, the CI auth-header workaround in
`sync-framework.sh`, the Blogger permalink-baking dance). Zero TODO/FIXME/HACK markers in the
entire tree. Consistent naming and small, focused utility modules.

### F-CODE-01 — ~370 lines of client-side JavaScript embedded in template literals · **Medium**

**Evidence:** [build-all-poems.js:208-489](../src/tools/build-all-poems.js#L208-L489) (the
all-poems inline `<script>`: sorting, filter bar, URL state) and
[:502-575](../src/tools/build-all-poems.js#L502-L575) (`RENDER_POEMS_SCRIPT` for `index.html`),
while [public/poetic.js](../public/poetic.js) (77 lines) is the designated shared client file.
The inline code duplicates the date parsing in
[date-utils.js](../src/tools/date-utils.js) and duplicates filter logic between the two
embedded scripts. The `index.html` "self-heal" replaces everything matched by
`/function (?:formatPoemDate|renderPoems)[\s\S]*renderPoems\(\);/`
([:698-701](../src/tools/build-all-poems.js#L698-L701)).

**Impact:** the largest maintenance hazard in the repo — invisible to any linter or test, and
the greedy version-coupled self-heal regex fails silently if the surrounding markup ever
contains an unexpected `renderPoems();`. Addressed by R-05.

### F-CODE-06 — The two Blogger tools disagree on the credentials-file format · **Medium**

**Evidence:** [blogger-auth.js:273-279](../src/tools/blogger-auth.js#L273-L279) saves
`.blogger-credentials.json` with top-level keys (`{ client_id, client_secret, refresh_token }`);
[sync-blogger.js:101](../src/tools/sync-blogger.js#L101) reads `JSON.parse(raw)?.installed ?? {}`
— the nested Google client-secrets shape, as codified in
[test/fixtures/blogger-credentials.json](../test/fixtures/blogger-credentials.json). A file
written by the auth helper is always ignored by the sync tool.

**Impact:** the documented local flow (mint token → save → run sync without env vars) is broken
end-to-end; sync reports "missing environment variable(s)" with the file sitting right there.
Addressed by R-04.

### F-CODE-02 — Dead one-off migration tools still shipped and synced · **Low**

**Evidence:** [convert-html-to-yaml.js:10-11](../src/tools/convert-html-to-yaml.js#L10-L11) and
[update-analysis-format.js:10](../src/tools/update-analysis-format.js#L10) anchor on a
`poems/` directory that no longer exists; the latter's own comment says it "was used to
migrate existing YAML files". `src/tools` is a `FRAMEWORK_PATHS` entry, so both propagate to
every consumer.

**Impact:** dead code contradicts the repo's as-built documentation principle and inflates the
sync surface. Addressed by R-09.

### F-CODE-03 — Poem-listing logic duplicated three times, already diverging · **Low**

**Evidence:** the readdir + `.yaml`/`.yml` + `YAML-SCHEMA` + `_` filter block appears at
[build-poems.js:50-54](../src/tools/build-poems.js#L50-L54),
[build-all-poems.js:28-32](../src/tools/build-all-poems.js#L28-L32) and
[:581-586](../src/tools/build-all-poems.js#L581-L586); the variant at
[sync-blogger.js:508-510](../src/tools/sync-blogger.js#L508-L510) silently omits `.yml` files
the builders accept.

**Impact:** a poem stored as `.yml` builds to the site but never syncs to Blogger — the
divergence this duplication invites has already happened. Addressed by R-11.

### F-CODE-04 — Credentials in module-level mutable state; impure `resolveConfig` · **Low**

**Evidence:** [sync-blogger.js:63-65](../src/tools/sync-blogger.js#L63-L65) module-level
`clientId`/`clientSecret`/`refreshToken` are populated as a side effect of `resolveConfig`
(listed in the file header as "pure, no network/fs" yet reading disk at
[:98-105](../src/tools/sync-blogger.js#L98-L105)); `getAccessToken(env)` ignores its `env`
parameter ([:342-357](../src/tools/sync-blogger.js#L342-L357)).

**Impact:** call-order coupling and a misleading contract; the tests dodge rather than cover it.
Addressed by R-04.

### F-CODE-05 — No linter or formatter · **Low**

**Evidence:** no eslint/prettier/biome configuration anywhere; vestigial
`// eslint-disable-next-line` comments in
[serve-static.js:318-328](../src/tools/serve-static.js#L318-L328) reference a tool that is not
installed. The only style gate is the trailing-whitespace check.

**Impact:** consistency currently rests on one author's discipline; drift risk grows with any
second contributor, human or agent. Addressed by R-10.

## Security (SEC)

**Strengths:** No secrets in the tree or in git history (the one credentials-named fixture
contains dummy values); `npm audit` clean; CI secrets only via GitHub Actions secrets with
least-privilege `permissions` blocks; the trusted-single-author HTML model is an explicitly
documented decision ([markdown.js](../src/tools/markdown.js) header); the OAuth helper uses the
modern loopback flow bound to 127.0.0.1.

### F-SEC-01 — Dev server binds all interfaces; containment check is prefix-based · **Low**

**Evidence:** [serve-static.js:323](../src/tools/serve-static.js#L323) `server.listen(PORT)`
(no host, so 0.0.0.0); the traversal guard `filePath.startsWith(ROOT_DIR)`
([:274](../src/tools/serve-static.js#L274)) lacks a trailing-separator check, so a sibling
directory whose name extends the root (e.g. `publicX/`) passes.

**Impact:** on a shared network the local dev server is reachable by others; bounded, dev-only.
Addressed by R-08.

### F-SEC-02 — OAuth helper lacks state/PKCE; credentials file written world-readable · **Low**

**Evidence:** the consent URL ([blogger-auth.js:205-211](../src/tools/blogger-auth.js#L205-L211))
carries no `state` nonce or PKCE challenge (RFC 8252 recommends PKCE for native flows);
[:279](../src/tools/blogger-auth.js#L279) writes `.blogger-credentials.json` with default
mode 0644.

**Impact:** bounded to same-machine attackers, but `{ mode: 0o600 }` and a random `state` are
near-free hardening for a refresh token that grants full blog write access. Addressed by
R-04 (file mode) and R-08 (flow hardening).

### F-SEC-03 — No SECURITY.md or disclosure route · **Low**

**Evidence:** no SECURITY.md at root or under `.github/`; README's help section points to
public issues only.

**Impact:** no private channel for a vulnerability report. Addressed by R-08.

**Accepted risk (informational, no action urged):** generated HTML embeds author content
unescaped by design (Pug `!=` interpolation, `convertMarkup` link URLs, titles into the
`index.html` script with only `"` escaped). Consistent with the documented trusted-author
model; revisit only if poems from untrusted contributors are ever built.

## Testing and quality assurance (TEST)

**Strengths:** 292 tests, all passing in 1.7 s with zero test dependencies (`node --test`).
Golden-file tests print regeneration instructions on failure
([golden.test.js:16-21](../test/golden.test.js#L16-L21)). Vim syntax is tested against real
Vim, and CI installs Vim so those tests cannot silently self-skip. Hermeticity concerns from
the previous review are fixed (`sharedPoemPath: null`, `credentialsPath: null` used
throughout). The trickiest code (parser params, variables, cycles, escaping) has the densest
tests.

### F-TEST-01 — The HTML generators have no direct tests · **Medium**

**Evidence:** no `build-poems.test.js` or `build-all-poems.test.js` exists. Untested:
slug-collision/empty-slug guards ([build-poems.js:107-118](../src/tools/build-poems.js#L107-L118)),
the `index.html` self-heal regex and head-injection logic
([build-all-poems.js:648-701](../src/tools/build-all-poems.js#L648-L701)), and
`generateIndexHtml`'s poem-array serialisation.

**Impact:** the fragile self-heal path (F-CODE-01) is exactly the code that breaks silently on
refactor, and nothing would catch it. Addressed by R-05.

### F-TEST-02 — The credentials-file seam is untested · **Low**

**Evidence:** every `resolveConfig` test passes `credentialsPath: null`
([sync-blogger.test.js:66-70](../test/sync-blogger.test.js#L66-L70)); no test round-trips
blogger-auth's save format into sync-blogger's read.

**Impact:** the seam drifted (F-CODE-06) and the suite could not notice. Addressed by R-04.

## Dependencies and supply chain (DEPS)

**Strengths:** Four runtime dependencies, each justified; no devDependencies at all; lockfile
committed; audit clean; nothing abandoned.

### F-DEPS-01 — `package.json` lacks name, version, license, and engines · **Medium**

**Evidence:** [package.json](../package.json) contains only `dependencies` and `scripts`. The
code requires Node ≥ 18 (global `fetch` in the Blogger tools) and README says "Node.js 18 or
later", but there is no `engines` field; no `license` field (see F-GOV-01); no `name`/`version`
despite a real release stream (v5.1.0). The file is synced verbatim to consumers.

**Impact:** Node 16 fails at runtime with an opaque `fetch is not defined` instead of at
install; licence/SBOM tooling sees an anonymous, unversioned, unlicensed package — in every
consumer repo too. Addressed by R-06 (and R-01 for the licence field).

### F-DEPS-02 — Two majors behind; no update automation · **Low**

**Evidence:** `npm outdated`: js-beautify 1.15.4 → 2.0.3, js-yaml 4.3.0 → 5.2.1; no
dependabot/renovate config, no scheduled audit.

**Impact:** currently harmless (audit clean), but the previous review caught six
vulnerabilities precisely because nothing automated was watching. Addressed by R-07.

## Tooling and developer experience (TOOL)

**Strengths:** The documented newcomer path was executed during this review and works
(`npm install` → `npm run build` → `npm run check:build`, all green). Rich npm-script surface
including a Windows stop variant; [setup-linux.sh](../scripts/setup-linux.sh) solves a real WSL
node-shadowing papercut; [edit-poem](../scripts/edit-poem) (fuzzy find → vi → rebuild on
change) is a genuine author affordance; first-class Vim integration.

### F-TOOL-01 — Commit hook is opt-in; no editor baseline · **Low**

**Evidence:** Conventional Commits enforcement requires each clone to run
`git config core.hooksPath .githooks` (README); nothing in CI checks commit format; no
`.editorconfig`.

**Impact:** one skipped README line bypasses the commit convention with no downstream catch.
Addressed by R-10.

### F-TOOL-02 — The framework repo's own build only exercises the zero-poem path · **Low**

**Evidence:** `src/poems/poem/` holds only `_`-prefixed examples, all excluded from the build;
`npm run build` here prints "Warning: No YAML files found" and builds an empty site (verified).

**Impact:** framework developers never locally exercise the real poem flow; consumer CI covers
it only incidentally. Addressed by R-05 (fixture-driven generator tests).

## CI/CD and release engineering (CI)

**Strengths:** [build-poems.yml](../.github/workflows/build-poems.yml) gates on tests +
whitespace + build + artefact check and installs Vim so syntax tests really run; the
`.poetic-version` precheck lets one workflow serve framework and consumers; the
[sync-framework.yml](../.github/workflows/sync-framework.yml) consumer updater is
channel-aware with idempotent PR creation; releases are tag-driven with generated notes; the
CHANGELOG discipline is real.

### F-CI-01 — Workflows use `npm install`, not `npm ci` · **Low**

**Evidence:** [build-poems.yml:68](../.github/workflows/build-poems.yml#L68) and the
sync-blogger install step, with `package-lock.json` committed.

**Impact:** CI can drift from the lockfile; `npm ci` is faster and reproducible. Addressed by R-07.

### F-CI-02 — No scheduled audit or dependency-update automation · **Low**

**Evidence:** no `dependabot.yml`, no renovate, no audit step in any workflow.

**Impact:** new advisories surface only when someone runs `npm audit` by hand. Addressed by R-07.

## Performance and scalability (PERF)

**Strengths:** Build time is linear and small; the lazy-embed loader keeps third-party iframes
off the page until clicked — a page-weight win; `$ref` resolution is cached per build.

No rated findings. Two informational notes, proportionate to a build-time CLI: Pug templates
are recompiled per poem (`cache: false` in
[poem-render.js:253,273](../src/tools/poem-render.js#L253)) — negligible at tens of poems,
first thing to revisit at thousands; `all-poems.html` embeds every poem with no size ceiling —
acceptable for any realistic personal collection.

## Usability and accessibility (UX)

**Strengths:** The README is written for genuine beginners (it explains what a terminal is,
and compares three repo-creation paths in a table). Generated pages carry real accessibility
work: `aria-pressed` scope toggles, `aria-live` result counts, labelled date fields, `lang`
attributes. Warnings tell the author the exact fix (unknown song service names the config key
to add; the `blog_id` precision warning shows the exact YAML edit).

### F-UX-01 — Poem-table sorting is mouse-only · **Low**

**Evidence:** TOC headers use bare `onclick` on `<th>`
([build-all-poems.js:161-163](../src/tools/build-all-poems.js#L161-L163)) with no
tabindex/keydown/`aria-sort`.

**Impact:** keyboard and screen-reader users cannot sort the table. Addressed by R-12.

### F-UX-02 — Render-error text is embedded in the published page · **Low**

**Evidence:** a poem that fails to render into `all-poems.html` emits
"Error rendering poem: <message>" into the public page
([build-all-poems.js:196-202](../src/tools/build-all-poems.js#L196-L202));
`generateIndexHtml` failures merely log "Skipped index.html update"
([:744-747, :814-816](../src/tools/build-all-poems.js#L744-L747)).

**Impact:** internal error text can reach the published site instead of failing the build.
Addressed by R-03.

## Documentation (DOC)

**Strengths:** Outstanding coverage for a solo project: ~3,000 doc lines, a 1,155-line syntax
spec, a formal EBNF grammar, a fully-commented example config that matches the code's key set
exactly, and a 511-line disciplined CHANGELOG. Spot-checks against reality passed. The
as-built principle (history lives only in the CHANGELOG) is actually followed.

### F-DOC-01 — `sync-blogger.js` header contradicts the implementation · **Low**

**Evidence:** header lists `resolveConfig` under "pure, no network/fs"
([sync-blogger.js:8-11](../src/tools/sync-blogger.js#L8-L11)); it reads disk and mutates
module state (see F-CODE-04).

**Impact:** the next maintainer trusts the header. Addressed by R-04.

### F-DOC-02 — Minor documentation defects · **Low**

**Evidence:** [README.md:80](../README.md#L80) typo "Framgents & Unity"; README's repository
structure describes `public/` as "git-ignored by default" while several tracked framework
assets live there (only `public/*.html` is ignored).

**Impact:** cosmetic. Addressed by R-13.

## Governance and project health (GOV)

**Strengths:** Real release engineering (SemVer tags, generated releases, consumer pinning
with a channels model); Conventional Commits with a provided hook; a *working* tech-debt
register culture — CHANGELOG entries cite debt IDs they resolve, and the register is empty
because items were resolved and removed as its protocol prescribes.

### F-GOV-01 — No licence · **High**

**Evidence:** no LICENSE/LICENCE file; no `license` field in [package.json](../package.json);
the README invites template use ("Use this template", clone-and-rewire instructions) and PR
contributions, and the sync model copies framework files into consumer repos.

**Impact:** under default copyright, consumers have no legal right to copy, modify, or
redistribute the framework — the entire consumer model rests on unlicensed copying. Severity
is deliberately not moderated by project size: the defect affects every downstream user's
legal position, and the fix is one file. Addressed by R-01.

### F-GOV-02 — Bus factor of one · **Low**

**Evidence:** 123/123 commits by one author; no second maintainer or CODEOWNERS.

**Impact:** accepted reality for a personal framework, and unusually well mitigated by the
documentation and changelog quality — recorded so readers know it was weighed, not missed. No
recommendation; no action available beyond the existing writing-down discipline.

## Observability and operations (OPS)

Largely inapplicable in the classic sense — the deliverable is a static site plus an on-demand
sync; there is no long-running service, so metrics, tracing, alerting, and backup/restore have
no surface. Judged on what exists:

**Strengths:** Logging is levelled by convention and actionable. The Blogger sync is stateless
and reconciling, supports `--dry-run` and `--only`, refuses to compute removals on a filtered
run, and defaults removals to recoverable 'draft' rather than 'delete'. Site rollback is
inherent (redeploy any prior commit).

### F-OPS-01 — Blogger sync aborts the whole run on one API error · **Low**

**Evidence:** every fetch throws via `assertOk` out of `main()`
([sync-blogger.js:329-334](../src/tools/sync-blogger.js#L329-L334)); no retry on 429/5xx, no
per-poem isolation.

**Impact:** a transient Google hiccup leaves a partial sync until the next push — harmless
(the next run reconciles) but noisy. Optional hardening under R-04.

### F-OPS-02 — Degradations are visible only as log lines in green runs · **Low**

**Evidence:** skipped poems, stale-artefact warnings, and "Skipped index.html update" all end
as log lines in successful CI runs (see F-ARCH-02, F-UX-02).

**Impact:** the author must read logs to notice loss; failing exit codes are the systemic fix.
Addressed by R-03.

## Data handling and privacy (DATA)

No rated findings — the data surface is minimal and handled proportionately. Personal data is
limited to author names and dates the author chooses to publish; generated pages contain no
analytics, trackers, or cookies; the lazy-embed design means no third-party request occurs
until a visitor clicks a player — a genuine privacy feature. The Blogger refresh token (full
blog write access) lives only in GitHub Actions secrets or a gitignored local file
(file-permission hardening noted under F-SEC-02). Fixtures contain no real personal data.
`blogger.removed: delete` permanently deletes posts, but the default is 'draft' and `--dry-run`
exists — adequately handled.
