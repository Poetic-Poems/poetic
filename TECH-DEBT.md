# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated. Once an issue has been resolved, remove
its entry.

Format:
```
## <id> <short title>

A description of what, why it matters, where, and a suggested fix.

```
Where `<id>` is a literal "TD" then the date followed by a zero-padded
sequential number (starting at 1 for the the first entry of a day). I.e.:
**TD*YYMMDDNN***

## TD26071101 No licence

The repo has no LICENSE file and no `license` field in `package.json`, yet the
README invites template use and the consumer model depends on copying framework
files. Consumers currently have no legal right to do so. Fix: add an
OSI-approved licence (MIT suggested), set the package.json field, sync the file
to consumers. (project-review-2026-07-11: F-GOV-01, R-01.)

## TD26071102 Site name "Fragments & Unity" hard-coded in generators

`src/tools/build-all-poems.js` bakes "Fragments & Unity" into `all-poems.html`
(lines ~124, ~133) and the default `index.html` template (~709, ~718); there is
no site-name config key, so every other consumer deploys pages with the wrong
name. Fix: add a top-level `title` key to `.poetic-config.yaml`, threaded like
`subtitle`. (project-review-2026-07-11: F-ARCH-01, R-02.)

## TD26071103 Poem conversion failures do not fail the build

`poem-to-yaml.js --all` logs per-file errors but exits 0, so a consumer's broken
`.poem` silently vanishes from the deployed site (YAML is gitignored; CI
regenerates it). Related: all-poems render errors are embedded as text in the
published page, and `$ref` cycles crash with a stack overflow instead of a clear
message. Fix: count errors and exit non-zero; add a `$ref` cycle guard.
(project-review-2026-07-11: F-ARCH-02, F-UX-02, F-ARCH-05, R-03.)

## TD26071104 blogger-auth and sync-blogger disagree on the credentials-file format

`blogger-auth.js` saves `.blogger-credentials.json` with top-level keys;
`sync-blogger.js` reads only the nested `installed` shape
(sync-blogger.js:101), so a saved file is silently ignored and the local
file-based sync flow is broken. No test round-trips the seam (all resolveConfig
tests pass `credentialsPath: null`). Fix: accept both shapes, return credentials
from resolveConfig instead of module globals, write the file 0600, add a
round-trip test. (project-review-2026-07-11: F-CODE-06, F-CODE-04, F-TEST-02,
R-04.)

## TD26071105 Embedded client JS is untested and unlintable

~370 lines of client-side JS live in template literals in
`build-all-poems.js` (all-poems script ~208-489; RENDER_POEMS_SCRIPT ~502-575),
duplicating date logic from `date-utils.js`, patched into previously built
index.html files by a greedy self-heal regex (~698-701). The generators
(`build-poems.js`, `build-all-poems.js`) have no direct tests. Fix: extract the
scripts to `public/` assets loaded via `<script src>`, pass poem data as JSON,
and add generator tests. (project-review-2026-07-11: F-CODE-01, F-TEST-01,
R-05.)

## TD26071106 package.json lacks name, version, license, engines

Only `dependencies` and `scripts` are present, though the code needs Node ≥ 18
(global `fetch`) and the project has tagged releases. The file is synced
verbatim to consumers. Fix: add the metadata and note the version-bump step in
the release process. (project-review-2026-07-11: F-DEPS-01, R-06.)

## TD26071107 sync-framework.sh never deletes upstream-removed files; dead tools ship

`git checkout <commit> -- <path>` overlays but never deletes, so framework
files removed upstream persist in consumers forever — including two already-dead
migration tools (`src/tools/convert-html-to-yaml.js`,
`src/tools/update-analysis-format.js`, both anchored on a defunct `poems/`
layout). Fix: delete the dead tools and propagate upstream deletions in the
sync script (diff-filter=D between synced commits, honouring skip_paths).
(project-review-2026-07-11: F-CODE-02, F-ARCH-03, R-09.)

## TD26071108 No linter; commit-format check is opt-in only

No ESLint/formatter config exists (vestigial `eslint-disable` comments in
`serve-static.js` reference a tool that isn't installed), and Conventional
Commits are enforced only by the opt-in local hook with no CI backstop. Fix:
add a minimal-ratchet linter + `.editorconfig` + a CI commit-format check.
(project-review-2026-07-11: F-CODE-05, F-TOOL-01, R-10.)
