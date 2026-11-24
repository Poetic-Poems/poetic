# Project map — poetic

**Revision:** 9918545cd3ffe91db3cf555ccd578f59c2080064 (main, as of 2026-11-24)

## What it is

A Node.js (>=22) framework for authoring poems in a plain-text `.poem` format,
converting them to YAML, and rendering to HTML via a Pug template, for
publishing to GitHub Pages. This is the framework repo (not a poem
collection); consumer repos pull `src/tools/`, `src/templates/`, `src/browser/`,
`scripts/`, `editors/` via `scripts/sync-framework.sh`. Single maintainer
(Warwick Allen / `@warwickallen` / `@Warwick-Allen`), self-review by design
(per AGENTS.md / SECURITY.md). MIT licensed, private (`"private": true` in
package.json, meaning "do not publish to npm", not secret — the repo is
public on GitHub).

This is the **11th** project review of this repository (prior reviews:
2026-07-07, 07-11, 07-21, 07-26, 07-31, 08-08, 09-21, 10-27 — 8 folders exist
under `reviews/`). The project is mature and has been reviewed heavily;
expect few new findings and note where a finding was already addressed by a
prior cycle.

## Structure

```
src/tools/     33 JS files — the framework core (build pipeline, parser,
               renderer, blogger sync, dev server, config)
src/browser/   browser-safe renderer entry (renderPoem/renderPoemPage),
               deliberately filesystem-free (tested for zero Node builtins
               in its require graph — test/browser-render.test.js)
src/templates/ Pug template
src/poems/     example/test poems
lib/           changelog-grammar.sh (shared shell parsing logic)
scripts/       shell helpers, synced to consumers
editors/vim/   vim syntax/filetype files
docs/          documentation (POEM-SYNTAX, YAML-SCHEMA, BUILD, BLOGGER, etc.)
examples/      example poem files + poetic-config.example.yaml
test/          63 files, 894 tests (890 pass, 4 skipped), node --test
tech-debt/     frozen per-item register (scope PPpoet), all items resolved
               or not-debt — nothing open
reviews/       prior review folders
.github/workflows/  10 workflows: build-poems, changelog-section, codeql,
               commit-format, release, required-checks-drift, secret-scan,
               shellcheck, sync-blogger, sync-framework
```

Largest files: `poem-parser.js` (1652 lines), `yaml-to-poem.js` (1177),
`sync-blogger.js` (1087), `poem-templates.js` (981, generated).

## Automated checks run (all from a fresh `npm ci`)

| Check | Result |
|---|---|
| `npm ci` | clean install, 199 packages |
| `npm test` (`node --test`) | 894 tests: 890 pass, 0 fail, 4 skipped |
| `npm run lint` (eslint) | clean, no errors |
| `npm run check` (trailing whitespace) | 325 files processed, 0 offending |
| `npm run check:licenses` | 77 production packages, all on allow-list |
| `npm run build` (full `.poem`→YAML→HTML pipeline) | succeeds, 2 poems built |
| `npm run check:build` | all expected artefacts present |
| `npm run coverage` (c8) | 90.8% lines / 85.58% branches / 97.99% functions — passes configured thresholds (80/79/88); `poem-templates.js` (generated) line coverage is 48.62%, notably lower than every other file |
| `npm audit` | 6 moderate advisories: `glob` (9.0.0–14.0.1, GHSA-3g3m-2fjr-6pw4) and `minimatch` (7.0.0–11.0.0, GHSA-g3hv-75wg-m249), both transitive — via `js-beautify` (prod dep) → `editorconfig`/`glob`, and via `c8`/`eslint` (dev deps). Fix requires a breaking `js-beautify` major bump per `npm audit fix --force`. |

## Issue tracker state

- Open `pw::type:tech-debt` issues: **1** (#337 — shellcheck discovery still
  directory-scoped for `editors/vim/install.sh` and `lib/changelog-grammar.sh`).
- Open PRs: **0**.
- Most recent review (2026-10-27) found 0 Critical, 1 High (a dependency
  advisory since resolved), 6 Medium, 15 Low findings and filed 10 issues
  (#297–#306), all now closed.

## Sampling strategy

Given the project's modest size (137 source/test/doc files excluding
`.git`/`node_modules`/`.claude`) and its maturity (10 prior review cycles),
this review reads exhaustively in the security-, build-, and seam-critical
paths (parser/renderer round-trip, CI workflows, secret handling, the
browser/Node renderer seam) and samples representatively elsewhere,
cross-checking against the prior review's findings and the current open
issue list so as not to re-report resolved work.
