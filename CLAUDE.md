# Poetic — Poem Authoring Framework

A Node.js framework for writing poems in `.poem` plain-text format, building them to HTML,
and publishing to GitHub Pages.

This is the **framework repo**, not a poem collection. Poem collections are separate repos that
use this framework via `scripts/sync-framework.sh`.

## What this repo provides

- `.poem` plain-text format + converter to YAML (`src/tools/poem-to-yaml.js`)
- Build pipeline: `.poem` → YAML → HTML via Pug template (`src/templates/poem.pug`)
- Index and all-poems HTML generators
- Static dev server (`src/tools/serve-static.js`)
- Shell scripts for setup and framework syncing (`scripts/`)
- Vim syntax highlighting (`editors/vim/`)
- GitHub Actions workflows (`.github/workflows/`)

## Directory map

```
src/tools/        ← build scripts (Node.js) — the core of the framework
src/templates/    ← Pug template
src/poems/        ← example/test poems used for developing the framework
public/           ← generated HTML (build artefact)
scripts/          ← shell helpers synced to consumer repos
editors/vim/      ← Vim filetype + syntax files
docs/             ← documentation
examples/         ← example poem files
.github/workflows/← CI: build-poems.yml, release.yml, sync-framework.yml
```

## Build commands

```bash
npm run build          # .poem → YAML → HTML
npm run build:all      # build + start dev server at http://localhost:8080
npm start              # start dev server only
npm test               # run Node.js built-in test suite
npm run check          # verify no trailing whitespace in tracked files (also runs in CI)
npm run check:build    # verify expected build artefacts exist after `npm run build` (also runs in CI)
```

**On WSL/Linux**, use `./scripts/setup-linux.sh npm run ...` to ensure the correct Node.js is used.

## How consumer repos use this framework

1. Consumer creates a repo from the poetic template (or clones + rewires)
2. `scripts/sync-framework.sh` pulls framework files from this repo into the consumer repo
3. `.poetic-version` in the consumer repo records which commit/tag is synced
4. GitHub Action `sync-framework.yml` can automate syncing on a schedule

Files synced to consumers: `src/tools/`, `src/templates/`, `scripts/`, `editors/`, `package.json`,
`package-lock.json`, and a few root-level files. **Consumer poem source files are never touched.**

## Poem file format (brief)

```
Title of the Poem
YYYY-MM-DD

Line one of stanza one
Line two of stanza one

Line one of stanza two
```

Full spec: `docs/POEM-SYNTAX.md` and `poem-syntax.ebnf`.

## Release process

See `.github/workflows/release.yml`. Releases are tagged; consumer repos can pin to a tag via
`.poetic-version`.

## Documentation principles

- **`CHANGELOG.md`** is the only place for recording what changed and when.
  Add an entry under `[Unreleased]` for any notable change (one visible to poem
  authors or site publishers). Patch-level fixes and routine doc updates do not
  need entries.
- **All other docs are as-built.** Write them to describe the current state
  only — no "previously", "used to be", "now uses", "migration completed", or
  "old format (deprecated)" phrasing. Git log already records history; docs
  that repeat it become misleading as the codebase evolves.
- If you encounter historical language in an existing doc, remove it and move
  the substance to `CHANGELOG.md` if it is significant.

## Commit messages

All commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
(`<type>[(scope)][!]: <description>`, e.g. `fix(build-poems): resolve output path`). See the
"Commit messages" section in `README.md` for the full type list. A `commit-msg` hook
(`.githooks/commit-msg`) enforces this once a contributor runs
`git config core.hooksPath .githooks`.

## Tech debt

When you defer work, take a shortcut, or notice a known gap, record it in
`TECH-DEBT.md` at the repo root — do not leave it only in a commit message or in
chat. Keep entries short and dated, and delete one when it is resolved.

## Key docs

| File | Contents |
|------|----------|
| `docs/POEM-SYNTAX.md` | Complete `.poem` format spec |
| `docs/YAML-SCHEMA.md` | YAML poem schema |
| `docs/POEM-TO-YAML.md` | Converter (poem-to-yaml.js) docs |
| `docs/BUILD.md` | GitHub Pages deployment |
| `poem-syntax.ebnf` | Formal EBNF grammar |
| `docs/VIM-SYNTAX.md` | Vim integration docs |
