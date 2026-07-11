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

## TD26071103 Poem conversion failures do not fail the build

`poem-to-yaml.js --all` logs per-file errors but exits 0, so a consumer's broken
`.poem` silently vanishes from the deployed site (YAML is gitignored; CI
regenerates it). Related: all-poems render errors are embedded as text in the
published page, and `$ref` cycles crash with a stack overflow instead of a clear
message. Fix: count errors and exit non-zero; add a `$ref` cycle guard.
(project-review-2026-07-11: F-ARCH-02, F-UX-02, F-ARCH-05, R-03.)

## TD26071105 Embedded client JS is untested and unlintable

~370 lines of client-side JS live in template literals in
`build-all-poems.js` (all-poems script ~208-489; RENDER_POEMS_SCRIPT ~502-575),
duplicating date logic from `date-utils.js`, patched into previously built
index.html files by a greedy self-heal regex (~698-701). The generators
(`build-poems.js`, `build-all-poems.js`) have no direct tests. Fix: extract the
scripts to `public/` assets loaded via `<script src>`, pass poem data as JSON,
and add generator tests. (project-review-2026-07-11: F-CODE-01, F-TEST-01,
R-05.)

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
