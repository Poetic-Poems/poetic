# Improvement prompts

One prompt per recommendation, in priority order. Each prompt is self-contained and may be
pasted into a fresh AI agent session with no other context. Ordering dependencies: run R-01
before R-06 (the licence value feeds the package.json field); run R-06 before R-07; run R-05
before R-10 and preferably before R-12 (they touch the client JS that R-05 relocates). All
other prompts are independent.

## Prompt for R-01 — Add a licence

**Bundles:** R-01 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework for authoring poems in a
plain-text .poem format and publishing them (github.com/warwickallen/poetic layout; framework
files are synced into separate consumer repos by scripts/sync-framework.sh).

Problem: the project has no licence at all — no LICENSE file at the repo root and no "license"
field in package.json — while its README invites the public to create sites from it as a
template and to contribute PRs, and its whole consumer model consists of other repositories
copying framework files. Under default copyright, consumers have no legal right to do this.

Task:
1. Add a LICENSE file at the repo root containing the MIT License, with the copyright line
   "Copyright (c) 2026 Warwick Allen". (MIT is the default choice; if the repository owner has
   stated a different preference anywhere in the repo, follow that instead and say so.)
2. Add "license": "MIT" to package.json (keep the file's existing key ordering style).
3. Add a short "Licence" section near the end of README.md stating the licence and linking to
   the file. Match the README's existing British-English style.
4. Add LICENSE to the FRAMEWORK_PATHS array in scripts/sync-framework.sh (keep the array's
   alphabetical-ish ordering) so consumers receive it on their next sync.
5. Add a CHANGELOG.md entry under [Unreleased] → Added, in the file's existing style.

Constraints: change nothing else; follow Conventional Commits for the commit message
(e.g. "chore: add MIT licence"); do not rewrap or reformat unrelated README content.

Verification: run `npm test` (all tests must pass) and `npm run check` (no trailing
whitespace). Confirm LICENSE appears in FRAMEWORK_PATHS by grepping scripts/sync-framework.sh.

Cost policy: this task is entirely mechanical and suits a low-cost model tier throughout; no
subagents are needed.

Deliverable: a single commit with the five changes and a one-paragraph summary noting that MIT
was the default choice for the owner to confirm.
```

## Prompt for R-02 — Make the site title configurable

**Bundles:** R-02 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework that builds poem collections
into static HTML sites. Consumers configure their site via .poetic-config.yaml, read by
src/tools/poetic-config.js; the generated pages are built by src/tools/build-all-poems.js
(all-poems.html and index.html) and src/tools/build-poems.js (per-poem pages). Generated HTML
under public/ is gitignored and rebuilt in CI on every deploy.

Problem: the site name "Fragments & Unity" (the author's own consumer site) is hard-coded in
the framework's generators: build-all-poems.js line ~124 (<title>Fragments &#38; Unity —
Concatenated View</title>) and line ~133 (<h1>) for all-poems.html, and lines ~709 and ~718 in
the default index.html template. There is no config key for the site name — only `subtitle`
exists — so every consumer other than the author's own site deploys pages carrying the wrong
name.

Task:
1. Add a top-level `title` key to .poetic-config.yaml handling in poetic-config.js (document it
   in the file's header comment, alongside favicon/subtitle).
2. Use it in build-all-poems.js everywhere "Fragments & Unity" appears: the all-poems <title>
   and <h1>, and the default index.html template's <title> and <h1>. Default when unset:
   "My Poems" (matching the existing subtitle default family). Mind the existing HTML entity
   escaping style (&#38;) — escape & in the configured value the same way the templates do.
3. For an existing index.html (the self-heal path in generateIndexHtml), keep the <h1> and
   <title> in sync with the configured title exactly the way `subtitle` is already synced
   (see the indexContent.replace calls around lines 653–668) — only replace when the key is
   explicitly set, mirroring the subtitle behaviour.
4. Document the key in: the README config table (alongside subtitle), the fully-commented
   examples/poetic-config.example.yaml (this repo's CLAUDE.md requires the example config to be
   updated in the same change as any config key change), and docs/BUILD.md if it has a config
   section.
5. Add a CHANGELOG.md entry under [Unreleased] → Added.

Constraints: do not change the subtitle behaviour; do not restructure the generators; keep the
framework repo's own build output stable except for the new default title; British English in
docs.

Verification: `npm test` passes; `npm run build && npm run check:build` passes; grep confirms
no "Fragments" remains in src/tools/; build once with a scratch .poetic-config.yaml containing
`title: Test Site` and confirm public/all-poems.html and public/index.html carry it (remove the
scratch config and regenerate afterwards, leaving the working tree clean apart from your
changes).

Cost policy: ordinary implementation against clear acceptance criteria — a mid-cost tier
suits the whole task; the doc updates in step 4 are mechanical and may be delegated to a
low-cost tier if subagents are available. Verify delegated work before integrating.

Deliverable: a single commit (Conventional Commits, e.g. "feat(config): make site title
configurable") plus a note reminding the owner to set `title: Fragments & Unity` in the
fragments-and-unity consumer repo before its next sync.
```

## Prompt for R-03 — Make the build fail loudly

**Bundles:** R-03 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework whose build pipeline is
`npm run build` = poem-to-raw → poem-to-yaml --all → build-poems → build-all-poems
(src/tools/*.js), run in consumer repos' CI (.github/workflows/build-poems.yml) before
deploying to GitHub Pages. Generated YAML is gitignored, so CI always regenerates it.

Problem: parts of the pipeline degrade silently instead of failing:
(a) poem-to-yaml.js main(), --all branch (lines ~1603-1611): per-file conversion errors are
    logged and the process exits 0 — so a consumer's broken .poem silently disappears from the
    deployed site (no YAML is produced, and build-poems.js never knows the poem existed).
(b) build-all-poems.js (~196-202): a poem that fails to render into all-poems.html embeds
    "Error rendering poem: <message>" into the published page instead of failing.
(c) build-all-poems.js generateIndexHtml catch (~744-747) returns null and main() (~814-816)
    logs "Skipped index.html update due to errors" but exits 0.
(d) poem-render.js resolveRefs (~129-188) has no $ref cycle detection: a YAML $ref chain that
    loops back to itself recurses to stack overflow. (Contrast the variable-expansion cycle
    guard in poem-to-yaml.js ~479-495, which warns and continues.)

Task: make every genuine failure fail the process, so CI stops before deploying a degraded
site:
1. In poem-to-yaml.js --all mode, count conversion errors and process.exit(1) after the loop
   when any occurred (mirror build-poems.js lines 185-187). Keep the existing per-file error
   messages and the stale-YAML warnings (warnings stay warnings).
2. In build-all-poems.js, replace the embed-the-error-in-HTML fallback with an error count
   that makes main() exit 1 after reporting all failing poems (report all, then fail — don't
   stop at the first). Same for the generateIndexHtml null path.
3. Add a cycle guard to resolveRefs (a visited set keyed the same way as its cache) that
   throws a clear error naming the referencing file and the cycle, and ensure that error
   propagates as a build failure via readPoemFile's callers (note readPoemFile currently
   returns null on error — the per-poem error counting from steps 1-2 handles that).
4. Add tests: a fixture poem that fails conversion makes the --all conversion path report
   failure (test the exported behaviour or the error count, following the existing test style
   in test/); a $ref cycle fixture produces the clear error rather than a RangeError.
5. CHANGELOG entry under [Unreleased] (behaviour visible to site publishers).

Constraints: the framework repo itself legitimately builds zero poems (only _-prefixed
examples) — "no poems found" must remain a warning, not an error. Do not change exit
behaviour for single-file (non --all) invocation beyond what already exists. Keep console
message wording style consistent with neighbours.

Verification: `npm test` passes including the new tests; `npm run build` still succeeds in
this repo (zero-poem path); temporarily add a syntactically broken .poem under
src/poems/poem/ (non-underscore name), confirm `npm run build` now exits non-zero, then
remove it.

Cost policy: the exit-code changes are ordinary implementation (mid-cost tier); the new tests
are well-specified and suit a low-cost tier via subagents if available; review delegated tests
before integrating.

Deliverable: one commit (e.g. "fix(build): fail the build when a poem fails to convert or
render") and a short report listing each failure mode now covered.
```

## Prompt for R-04 — Fix the Blogger credentials-file path end-to-end

**Bundles:** R-04 only (file-mode hardening included because it touches the same write; retry
is optional scope) · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework. Its Blogger publishing chain
is: src/tools/blogger-auth.js (one-time interactive OAuth helper that can save
.blogger-credentials.json locally) and src/tools/sync-blogger.js (the publisher, which takes
credentials from BLOGGER_* env vars with a documented fallback to that same file). Tests live
in test/sync-blogger.test.js; a fixture exists at test/fixtures/blogger-credentials.json.
docs/BLOGGER.md documents the flow.

Problem: the two tools disagree on the file format. blogger-auth.js (lines ~273-279) saves
top-level keys { client_id, client_secret, refresh_token, note }. sync-blogger.js resolveConfig
(line ~101) reads JSON.parse(raw)?.installed ?? {} — the nested Google client-secrets shape
(as in the test fixture). So a file saved by the auth helper is silently ignored and sync
reports "missing environment variable(s)". No test round-trips the seam (resolveConfig tests
all pass credentialsPath: null). Two adjacent defects: (1) resolveConfig populates module-level
mutable variables clientId/clientSecret/refreshToken (lines ~63-65) as a side effect, and
getAccessToken(env) ignores its env parameter and reads those globals — while the file header
lists resolveConfig under "pure, no network/fs"; (2) the credentials file is written with
default mode 0644 though it holds a refresh token with full blog write access.

Task:
1. Make sync-blogger.js accept BOTH file shapes: top-level keys and the nested `installed`
   object (top-level winning if both present). This is the backwards-compatible route.
2. Refactor the credential flow to be explicit: resolveConfig returns the resolved credentials
   (extend its return object; keep existing fields), main() passes them to getAccessToken,
   and the module-level variables are removed. Keep exported function names; where tests
   construct resolveConfig results, extend rather than break them.
3. Correct the file-header comment: resolveConfig reads the filesystem — move it out of the
   "pure" list or annotate it accurately.
4. In blogger-auth.js, write .blogger-credentials.json with { mode: 0o600 }.
5. Add a test that writes a temp file in blogger-auth's exact save format and asserts
   resolveConfig resolves credentials from it (and one for the nested shape, which the fixture
   already supports).
6. Check docs/BLOGGER.md describes the local-file flow accurately; fix if not.
7. CHANGELOG entry under [Unreleased] → Fixed.
Optional (only if it stays small): wrap the Blogger API fetches in a single retry with a short
delay on HTTP 429/5xx responses.

Constraints: do not change the env-var precedence (env always wins over the file); do not
alter workflow files; keep the "missing environment variable(s)" guidance message but make it
also mention the credentials file.

Verification: `npm test` passes including new tests; `node src/tools/sync-blogger.js` from the
repo root without credentials still prints the friendly missing-credentials message and exits
cleanly.

Cost policy: the refactor of credential flow should be done at a mid-cost tier and reviewed
carefully (it touches authentication paths); the new tests are well-specified and may be
delegated to a low-cost tier if subagents are available. Verify delegated work before
integrating.

Deliverable: one commit (e.g. "fix(sync-blogger): read credentials saved by blogger-auth")
and a short report; if the optional retry was skipped, add a TECH-DEBT.md entry per the
repo's format (see TECH-DEBT.md header) recording it.
```

## Prompt for R-05 — Extract embedded client JS and test the generators

**Bundles:** R-05 only · **Run after:** no prerequisites (but run before R-10 and R-12)

```text
You are working in the "poetic" repository, a Node.js framework that generates a static poem
site. src/tools/build-all-poems.js generates all-poems.html (with ~280 lines of client-side
JavaScript inline in a template literal: table sorting, a filter bar with URL state, back-to-
top) and index.html (whose poem-grid renderer is another ~75-line template-literal script,
RENDER_POEMS_SCRIPT, injected into fresh pages and patched into previously built pages by the
"self-heal" regex /function (?:formatPoemDate|renderPoems)[\s\S]*renderPoems\(\);/ at lines
~698-701). public/poetic.js (77 lines) is the existing home for shared client JS (the lazy
embed loader). public/*.html is gitignored; consumer repos rebuild pages in CI. Framework
files reaching consumers are listed in FRAMEWORK_PATHS in scripts/sync-framework.sh. Tests use
node:test in test/; poem fixtures can be built from src/poems/yaml/_example.yaml-style files.

Problems: (a) the embedded client JS is invisible to linters and tests, duplicates the date
parsing already in src/tools/date-utils.js, and duplicates filter logic between the two
scripts; (b) the self-heal regex is greedy and version-coupled — it breaks silently if the
page ever contains an unexpected "renderPoems();"; (c) the generators have no direct tests:
nothing covers the slug-collision/empty-slug guards (build-poems.js ~107-118), the index
self-heal and head-injection logic (~648-701), or generateIndexHtml's poem-array
serialisation (titles are embedded with only double quotes escaped).

Task:
1. Move the all-poems inline script and RENDER_POEMS_SCRIPT into real framework assets —
   either new files (e.g. public/poetic-all-poems.js, public/poetic-index.js) or sections of
   public/poetic.js — loaded via <script src> (defer) from the generated pages. Poem data for
   the index must reach the page as data, not code: emit a JSON payload (e.g.
   <script type="application/json" id="poem-data">…</script> or a const from JSON.stringify)
   that the external script reads. Use JSON.stringify for serialisation, eliminating the
   hand-rolled quote escaping.
2. Update the self-heal path for previously built consumer index.html files: use the existing
   greedy regex ONE more time to strip any legacy inline block, then ensure the <script src>
   reference and fresh JSON payload are present. The steady-state self-heal becomes replacing
   the JSON payload — no code patching. Preserve the existing favicon/subtitle sync and
   CSS/JS link-injection behaviour.
3. Add any new asset files to FRAMEWORK_PATHS in scripts/sync-framework.sh and mirror
   build-poems.yml's "Prepare deployment structure" step if root-level copies are needed
   (check how poetic.js is handled there and follow suit).
4. Add generator tests (new test/build-all-poems.test.js and test/build-poems.test.js) using
   temp-dir fixtures: slug collision and empty-slug guards error correctly; index generation
   from scratch produces the script reference and JSON payload; regenerating over a
   previously built index (including one with the LEGACY inline block, fixture it) heals
   correctly and idempotently; a title containing quotes/backslashes round-trips into the
   JSON payload intact.
5. Deduplicate what the extraction exposes where straightforward (the date-parsing duplicate
   of date-utils.js can become one client-side copy; do not over-abstract).
6. CHANGELOG entry under [Unreleased] → Changed.

Constraints: generated-page behaviour in the browser must be unchanged (sorting, filtering,
URL state, back-to-top, poem grid, filter creation); do not redesign the UI; keep node:test
style consistent with existing tests; do not break consumers whose index.html was built by
any prior framework version — that self-heal contract is the delicate part of this task.

Verification: `npm test` passes including the new tests; `npm run build` then serve
(`npm start`) and manually confirm in the built pages: table sort works, filter bar filters
and updates the URL, index grid renders with dates and labels, clicking a card navigates.
Confirm idempotency: run `npm run build` twice and diff public/index.html — no growth or
duplication.

Cost policy: the self-heal/migration design and its review need a high-capability tier — it
is the riskiest change in this review. The test-writing in step 4 is well-specified and suits
a low-cost tier via subagents; the mechanical extraction of script text suits a mid-cost tier.
Verify all delegated work before integrating.

Deliverable: one or two commits (extraction; tests) with Conventional Commit messages, and a
report describing how legacy consumer pages migrate.
```

## Prompt for R-06 — Complete package.json metadata

**Bundles:** R-06 only · **Run after:** R-01 (licence value must be known)

```text
You are working in the "poetic" repository, a Node.js framework versioned by git tags
(currently v5.1.0; see CHANGELOG.md) whose package.json is synced verbatim to consumer repos
by scripts/sync-framework.sh.

Problem: package.json contains only "dependencies" and "scripts" — no name, version, license,
or engines — although the code requires Node >= 18 (global fetch in src/tools/sync-blogger.js
and blogger-auth.js), README states "Node.js 18 or later", and the project has a real release
stream. Consumers inherit the gap.

Task: this assumes R-01 (licence) is done — verify a LICENSE file exists and read its type
before starting.
1. Add to package.json: "name": "poetic", "version" matching the latest released tag (check
   `git tag --sort=-v:refname | head -1` and CHANGELOG.md; omit the leading v),
   "private": true (it is not published to npm), "license" matching LICENSE, and
   "engines": { "node": ">=18" }.
2. Record the version-maintenance rule where the release process is described (CLAUDE.md's
   release section and/or README): the version field is bumped in the same commit that
   prepares a release tag.
3. CHANGELOG entry under [Unreleased].

Constraints: nothing else in package.json changes; key order: name, version, private, license,
engines, then the existing keys.

Verification: `npm install && npm test` still pass; `node -e "console.log(require('./package.json'))"`
shows the fields.

Cost policy: entirely mechanical — a low-cost tier suits the whole task.

Deliverable: one commit ("chore: add package metadata (name, version, licence, engines)").
```

## Prompt for R-07 — CI hygiene: npm ci and automated dependency updates

**Bundles:** R-07 only · **Run after:** R-06 (engines field should exist first)

```text
You are working in the "poetic" repository, a Node.js framework with GitHub Actions workflows
in .github/workflows/ (build-poems.yml runs tests/build/deploy; sync-blogger.yml publishes to
Blogger; both run `npm install`). package-lock.json is committed. There is no dependency
update automation. `npm outdated` currently shows js-beautify 1.15.4 (latest 2.0.3) and
js-yaml 4.3.0 (latest 5.2.1) a major behind, markdown-it and pug a minor/patch behind.

Task:
1. Replace `npm install` with `npm ci` in both workflows.
2. Add .github/dependabot.yml covering the npm ecosystem and github-actions ecosystem, weekly
   schedule, sensible PR limits (e.g. 5).
3. Take the safe updates: bump markdown-it and pug to current within their majors
   (`npm update markdown-it pug`), run the full test suite and build.
4. Attempt the two major bumps ONE AT A TIME (js-yaml 5, then js-beautify 2), running
   `npm test` and `npm run build` after each. js-beautify formats all generated HTML — if its
   2.x output differs, golden/expected output may churn here and in consumer repos; if either
   bump fails tests or visibly reflows output, revert THAT bump and record a TECH-DEBT.md
   entry (repo format: TD-id per the file's header) explaining what blocked it.
5. CHANGELOG entry only if a major bump lands (dependency majors are publisher-visible);
   otherwise none needed per the changelog policy.

Constraints: do not change any other workflow steps; keep node-version "22" in workflows
(compatible with engines >=18).

Verification: `npm ci && npm test && npm run build && npm run check:build` all green locally;
workflows still parse (yamllint or careful review).

Cost policy: steps 1-3 are mechanical (low-cost tier). Step 4's judgement about output churn
warrants a mid-cost tier. Verify delegated work before integrating.

Deliverable: one or two commits ("ci: use npm ci and add dependabot", "build(deps): …") and a
report stating which majors landed and which were deferred with the TECH-DEBT reference.
```

## Prompt for R-08 — Local-tool security hardening and SECURITY.md

**Bundles:** R-08 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework. Two local developer tools
need small security hardening, and the project lacks a disclosure route. The project's threat
model is a single trusted author building their own site; these are proportionate low-severity
hardenings, not emergencies.

Problems:
(a) src/tools/serve-static.js line ~323: server.listen(PORT) binds 0.0.0.0, exposing the dev
    server to the LAN; and its traversal guards (lines ~225 and ~274) use
    filePath.startsWith(ROOT_DIR) without a trailing separator, so a sibling directory whose
    name merely extends the root (e.g. "publicX") would pass the check.
(b) src/tools/blogger-auth.js consent URL (lines ~205-211) sends no `state` parameter (CSRF
    guard) and no PKCE, contrary to RFC 8252 practice for native-app OAuth flows. (The
    loopback server at least binds 127.0.0.1 already.)
(c) No SECURITY.md exists.

Task:
1. serve-static.js: bind 127.0.0.1 by default; add a --host flag (and HOST env var, matching
   the existing --port/PORT pattern in parseArgs) for the rare LAN-testing case; update the
   startup log and usage string. Fix both containment checks to compare against
   ROOT_DIR + path.sep (accepting the exact-root case where relevant).
2. blogger-auth.js: generate a random state value (crypto.randomBytes), include it in the
   consent URL, and reject the loopback callback if the returned state does not match. Add
   PKCE (S256 code challenge/verifier) if Google's token endpoint accepts it for this client
   type without complicating the flow — if it turns out fiddly, ship state-only and note it.
3. Add SECURITY.md at the repo root: supported-version statement (latest release), and a
   private reporting route (GitHub private vulnerability reporting, with the repository's
   Security tab as the channel). Keep it short and in British English.
4. Add a test for the traversal fix if serve-static has any test hooks; if it has none,
   extract safeJoin/containment into a small exported helper and test that (keep the change
   minimal).

Constraints: default behaviour change (localhost binding) must be called out in a
CHANGELOG.md [Unreleased] entry since site authors may notice; no new dependencies; keep the
zero-dependency claim in serve-static.js's header true.

Verification: `npm test` passes; `npm start` serves http://localhost:8080 as before; from the
code, confirm requests for a sibling-prefixed path return 403 (add the unit test rather than
manual probing where possible).

Cost policy: security-touching edits: implement and review at a mid-to-high-capability tier;
the SECURITY.md text is mechanical (low-cost tier). Verify delegated work before integrating.

Deliverable: one commit ("fix(security): bind dev server to localhost, tighten containment,
add OAuth state") plus SECURITY.md, and a note if PKCE was deferred.
```

## Prompt for R-09 — Remove dead tools; handle upstream deletions in sync

**Bundles:** F-CODE-02 and F-ARCH-03 together because deleting the dead tools only reaches
consumers once sync handles deletions · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework whose files are pulled into
consumer repositories by scripts/sync-framework.sh (it checks out each path in its
FRAMEWORK_PATHS array from an upstream commit; consumer repos run it unattended via
.github/workflows/sync-framework.yml, which opens a PR with the result).

Problems:
(a) Two one-off migration tools are dead: src/tools/convert-html-to-yaml.js and
    src/tools/update-analysis-format.js both anchor on path.join(process.cwd(), "poems") — a
    directory layout that no longer exists (poems live in src/poems/poem/), and the latter's
    own comment says it "was used to migrate existing YAML files". Both ship to consumers via
    the src/tools FRAMEWORK_PATHS entry.
(b) sync-framework.sh syncs with `git checkout "$POETIC_COMMIT" -- "$path"`, which overlays
    files but never deletes ones removed upstream — so files the framework deletes live on in
    consumer repos forever, including (a) once deleted.

Task:
1. Delete src/tools/convert-html-to-yaml.js and src/tools/update-analysis-format.js. Grep the
   repo (code, docs, workflows, package.json scripts) for references and remove any found.
2. Teach sync-framework.sh to delete: after the checkout loop, when the previously synced
   commit (OLD_COMMIT in the script) exists locally, compute
   `git diff --name-only --diff-filter=D "$OLD_COMMIT" "$POETIC_COMMIT" -- "${FRAMEWORK_PATHS[@]}"`
   and `git rm --quiet --ignore-unmatch` each resulting path, honouring is_skipped() and never
   touching paths outside FRAMEWORK_PATHS. When OLD_COMMIT is unavailable (first sync or
   rewritten history), skip deletion and say so in the output, mirroring the script's existing
   fallback style. Echo each deletion like the existing "synced/skipped" lines.
3. Test the script end-to-end in a scratch consumer: create a throwaway git repo, add a remote
   pointing at this working copy, place a .poetic-version, run the script against two commits
   where a framework file was deleted between them, and confirm the file is staged for
   deletion downstream. (A shell-based test in test/sync-framework.test.js exists — extend it
   if its harness supports this; otherwise verify manually and describe the procedure in the
   report.)
4. CHANGELOG entry under [Unreleased] for the sync behaviour change (visible to site
   publishers) and the tool removals.

Constraints: sync-framework.sh runs unattended in consumer CI — deletion must be conservative:
only paths that are (i) under FRAMEWORK_PATHS, (ii) deleted upstream between the two synced
commits, (iii) not in skip_paths. Do not delete based on "not present at target commit" alone
(that would clobber consumer files living under shared directories). Preserve the script's
existing self-sync/re-exec behaviour and bash strict-mode compatibility (set -euo pipefail —
mind empty-array expansion on older bash).

Verification: `npm test` passes (test/sync-framework.test.js in particular); bash -n
scripts/sync-framework.sh; the scratch-consumer procedure from step 3 shows the deletion.

Cost policy: the sync-script change needs care and review at a mid-to-high-capability tier
(it runs unattended downstream); the tool deletion and reference grep are mechanical
(low-cost tier). Verify delegated work before integrating.

Deliverable: one commit ("feat(sync-framework): propagate upstream deletions; remove dead
migration tools") — note the deletion behaviour prominently in the commit body.
```

## Prompt for R-10 — Adopt a linter and editor baseline

**Bundles:** F-CODE-05 and F-TOOL-01 together: CI's first lint job is also the natural home
for the commit-format backstop · **Run after:** R-05 (so extracted client JS gets linted)

```text
You are working in the "poetic" repository, a small Node.js (CommonJS) framework with
consistent hand-maintained style: 2-space indent, semicolons, single quotes predominant,
British-English comments. Quality gates today: `npm test` (node:test), `npm run check`
(trailing-whitespace via scripts/remove-trailing-spaces.sh), both run in
.github/workflows/build-poems.yml. There is no linter; vestigial
"// eslint-disable-next-line no-console" comments sit in src/tools/serve-static.js though
ESLint is not installed. Conventional Commits are enforced only by an opt-in local hook
(.githooks/commit-msg; enabled per-clone via `git config core.hooksPath .githooks`). Client-
side JS lives in public/*.js. This task assumes R-05 (client-JS extraction) is complete —
check whether public/ contains the extracted scripts; if not, still proceed, but do not
attempt to lint template-literal contents.

Task:
1. Add ESLint (flat config, eslint.config.js) as a devDependency, configured for: CommonJS
   Node sources (src/tools, scripts where applicable, test) and browser scripts (public/*.js)
   with appropriate globals. Start from the recommended rule set, relaxed to match existing
   style rather than restyling the codebase (allow console — these are CLI tools; no
   max-len; keep rules that catch real defects: no-unused-vars, no-undef, eqeqeq
   as warn-or-error per your judgement).
2. Make the codebase pass: prefer minimal code fixes for real findings; use targeted disables
   with a reason comment only where a finding is intentional. Remove the vestigial
   eslint-disable comments in serve-static.js or make them meaningful.
3. Wire it in: `npm run lint` script; add a lint step to build-poems.yml alongside the
   whitespace check. This introduces the repo's first devDependency — confirm `npm ci` in CI
   installs devDependencies (it does by default) and note the install-size change in the
   report.
4. Add .editorconfig matching current style (2-space indent, LF, final newline, trim trailing
   whitespace — align with what `npm run check` enforces).
5. Add a commit-format backstop in CI: a small job on pull_request that validates PR commit
   messages against the repo's Conventional Commits pattern (reuse the regex/logic from
   .githooks/commit-msg so there is one source of truth — extract it to a shared script if
   needed).
6. Decide and document sync behaviour: add eslint.config.js and .editorconfig to
   FRAMEWORK_PATHS in scripts/sync-framework.sh ONLY if they do not burden consumers (they
   also receive src/tools and test, so linting there is coherent — include them, and say so
   in docs/SCRIPTS.md if it lists synced paths). package.json is already synced, so the
   devDependency reaches consumers automatically.
7. CHANGELOG entry under [Unreleased].

Constraints: do not restyle the codebase (no formatter adoption in this task; the goal is a
ratchet); every disable must carry a reason; CI time increase should be seconds, not minutes.

Verification: `npm run lint` exits 0; `npm test`, `npm run check`, `npm run build` all green;
the CI workflow file parses; deliberately introduce an unused variable locally and confirm
lint catches it, then remove it.

Cost policy: config design and the judgement calls in step 2 suit a mid-cost tier; the
mechanical fix-ups across files and .editorconfig are low-cost-tier work for subagents if
available. Verify delegated work before integrating.

Deliverable: one or two commits ("ci: add eslint, editorconfig, and commit-format check").
```

## Prompt for R-11 — Deduplicate poem listing; finish path anchoring

**Bundles:** F-CODE-03 and F-ARCH-04 together: the sync-blogger call site is the same code
being consolidated · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js framework. The "list the poem YAML
files" logic — readdir, keep *.yaml/*.yml, drop YAML-SCHEMA*, drop _-prefixed — is duplicated
in src/tools/build-poems.js (~50-54), src/tools/build-all-poems.js (~28-32 and ~581-586), and
in a diverged form in src/tools/sync-blogger.js (~508-510) which only accepts .yaml (misses
.yml) and does not exclude YAML-SCHEMA. Separately, sync-blogger.js anchors on the current
working directory (line ~36: YAML_DIR from process.cwd(); line ~476 calls readPoeticConfig()
bare, which defaults to process.cwd()) while every other build tool anchors on REPO_ROOT from
src/tools/repo-root.js.

Task:
1. Create one exported helper — listPoemYamlFiles(dir) returning absolute paths (or names;
   pick what minimises call-site churn) — in an appropriate module (poem-render.js exports
   shared read helpers, or a tiny new src/tools/poem-files.js). Implement the union of the
   current filters: accepts .yaml and .yml, excludes YAML-SCHEMA*, excludes _-prefixed.
2. Use it at all four call sites. This deliberately CHANGES sync-blogger behaviour: .yml poems
   now sync to Blogger and YAML-SCHEMA files are excluded — call this out in a CHANGELOG
   [Unreleased] → Fixed entry.
3. Switch sync-blogger.js to REPO_ROOT (require ./repo-root) for YAML_DIR and pass REPO_ROOT
   to readPoeticConfig(), matching build-poems.js.
4. Add tests for the helper (fixture dir with .yaml, .yml, YAML-SCHEMA.yaml, _partial.yaml)
   pinning the filter rules.

Constraints: no behaviour change for the two build tools (they already accept .yml); keep
existing export lists intact; follow the existing node:test style.

Verification: `npm test` passes including new tests; `npm run build` unchanged;
`node src/tools/sync-blogger.js` from a subdirectory (e.g. cd src && node tools/sync-blogger.js)
now behaves identically to running from the root (prints the disabled/missing-config message
rather than an ENOENT).

Cost policy: entirely well-specified refactoring — a low-cost tier with a mid-cost review
pass suits this task.

Deliverable: one commit ("refactor(tools): single poem-listing helper; anchor sync-blogger on
repo root").
```

## Prompt for R-12 — Keyboard-accessible table sorting

**Bundles:** R-12 only · **Run after:** R-05 preferably (edit the extracted asset, not the
template literal)

```text
You are working in the "poetic" repository, a Node.js framework that generates a static poem
site. The all-poems.html page has a table of contents whose column headers sort the table via
bare onclick handlers on <th class="sortable"> elements (sortTable() — generated by
src/tools/build-all-poems.js around lines 158-165, with the sort logic in the page's client
script; if a previous improvement task has already extracted that script into a public/*.js
asset, edit the asset instead of the template literal — check first). Styling lives in
public/poetic.css (classes: sortable, sort-asc, sort-desc).

Problem: the sort affordance is mouse-only — no tabindex, no key handling, no aria-sort — so
keyboard and screen-reader users cannot sort the poem table.

Task:
1. Make each sortable header a real <button> inside the <th> (preferred), or give the <th>
   role="button", tabindex="0", and an Enter/Space keydown handler. Move the click wiring to
   addEventListener (dropping inline onclick) if it does not enlarge the change unduly.
2. Set aria-sort="ascending|descending" on the active column's <th> (and remove it from
   the others) whenever the sort changes.
3. Adjust public/poetic.css so the buttons inherit the existing header look (no visual
   regression: same font, cursor, sort indicators).
4. CHANGELOG entry under [Unreleased] only if the changelog policy considers this visible to
   site publishers (it is a reader-facing improvement — include a brief entry).

Constraints: no framework/library additions; behaviour for mouse users unchanged; the
generated-HTML structure change must be reflected wherever tests assert on it (check test/).

Verification: `npm test` and `npm run build` pass; `npm run build:all`, open
http://localhost:8080/all-poems.html, and confirm: Tab reaches each header, Enter/Space sorts,
the visual sort indicators still work, and aria-sort updates (inspect the DOM).

Cost policy: small, well-specified front-end task — a low-cost tier suits it, with the manual
browser verification done carefully.

Deliverable: one commit ("feat(all-poems): keyboard-accessible table sorting with aria-sort").
```

## Prompt for R-13 — Documentation sweep

**Bundles:** R-13 only · **Run after:** no prerequisites

```text
You are working in the "poetic" repository, a Node.js poem-publishing framework with extensive
Markdown docs (README.md, docs/*.md) that follow an "as-built" principle recorded in CLAUDE.md:
docs describe only the current state; history belongs in CHANGELOG.md; no
"previously/now uses/deprecated" phrasing.

Problems found by review: README.md line ~80 has a typo in a link label — "Framgents & Unity
Blogger site" (should be "Fragments"); README's "Repository structure" section describes
public/ as "Generated HTML (git-ignored by default)" but only public/*.html is ignored —
tracked framework assets (poetic.css, poetic.js, poetic-footer.html, logos) live there too.

Task:
1. Fix the "Framgents" typo (check whether the reference label is used elsewhere in the file —
   Markdown reference links must stay consistent).
2. Correct the public/ description to reflect reality (generated HTML ignored; framework
   assets tracked).
3. Sweep README.md and docs/*.md for: other misspellings, statements contradicting the current
   code (spot-check any command or path you touch by running/inspecting it), and
   historical-language violations of the as-built principle. Fix small issues directly; if you
   find anything large or uncertain, list it in your report rather than guessing.
4. No CHANGELOG entry (routine doc fixes are explicitly exempt per the changelog policy).

Constraints: British English; preserve each file's formatting conventions (reference-style
links in README); do not rewrite for style — this is a correctness sweep, not an edit pass.

Verification: `npm run check` passes (no trailing whitespace introduced); every command you
corrected or verified was actually run; Markdown link references resolve (grep for the
changed labels).

Cost policy: entirely mechanical — a low-cost tier suits the whole task.

Deliverable: one commit ("docs: fix typos and correct public/ description") and a list of
anything found but deliberately left for the maintainer.
```
