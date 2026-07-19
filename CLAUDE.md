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
                    (incl. generated song-handlers-data.js + poem-templates.js;
                    regenerate with `npm run build:generated`)
src/templates/    ← Pug template
src/browser/      ← browser-safe renderer entry (renderPoem/renderPoemPage) —
                    see docs/RENDERER-BROWSER.md; keep it filesystem-free
src/poems/        ← example/test poems used for developing the framework
public/           ← generated HTML (build artefact)
scripts/          ← shell helpers synced to consumer repos
editors/vim/      ← Vim filetype + syntax files
docs/             ← documentation
examples/         ← example poem files
.github/workflows/← CI: build-poems.yml, codeql.yml, commit-format.yml, release.yml,
                    sync-blogger.yml, sync-framework.yml
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

Files synced to consumers: `src/tools/`, `src/templates/`, `src/browser/`, `scripts/`, `editors/`,
`package.json`, `package-lock.json`, and a few root-level files. **Consumer poem source files are
never touched.**

## Poem file format (brief)

```
Title of the Poem
YYYY-MM-DD

Line one of stanza one
Line two of stanza one

Line one of stanza two
```

Full spec: `docs/POEM-SYNTAX.md` and `poem-syntax.ebnf`.

## Branch workflow

`main` is protected: it does not accept direct commits or pushes, from anyone
or anything, including maintainers and AI agents. Every change goes through a
pull request. A repo ruleset scoped to the default branch restricts merges
into `main` to squash only (other branches allow any merge method) — so a
pull request's title becomes the subject line of the single commit that
lands on `main`.
Write that title in Conventional Commits format (see "Commit messages"
below); the individual commits on the branch are discarded when squashed, so
only the title needs to conform. The squash commit's body is pre-filled from
the pull request's description (GitHub repo setting `squash_merge_commit_message:
PR_BODY`), so a filled-in PR description carries through to `main`'s history —
write one whenever the change needs more context than the title alone gives.

Because every change is gated by a PR and CI regardless of who or what proposes it, agents
work autonomously up to the PR stage: commit, push a branch, and open the pull request
without pausing to ask permission first. Review happens on the PR, not before it — the repo
owner reviews there and requests changes if needed. This does not extend to actions on `main`
itself (direct commits/pushes are rejected by the branch protection anyway) or to
force-pushing/merging, which still require explicit instruction.

All Poetic repositories, this one included, operate in a multi-agent environment: autonomous
and interactive agents, and the maintainer, may push branches, merge pull requests, and move
`main` at any time. Before commencing any changes, make your own dedicated shallow clone of
`origin/main` and work in that — never in a checkout shared with anyone else, such as the
user's working copy (which may be edited at any moment) or a clone another agent is already
using:

```bash
git clone --depth 1 https://github.com/Poetic-Poems/poetic.git <scratch-dir>/poetic
```

Deepen the clone if the task turns out to need history — for example, a rebase onto a `main`
that has moved needs the merge base (`git fetch --unshallow`, or `git fetch --depth=<n>`).
Commit, push the feature branch, and open the pull request from that clone; delete the clone
once the work has landed. And when you open the PR, do not assume `origin/main` is still in
the state it was when you cloned — another change may have merged meanwhile, which is why the
post-PR mergeable check below is mandatory.

Keep feature branches short-lived and narrowly scoped. Prefer breaking a large piece of
work into a series of small pull requests, each a safe, self-contained, independently
reviewable and mergeable unit, over accumulating many changes on one long-running branch.
As soon as a branch reaches such a unit of work — coherent on its own, with CI passing —
open it (or mark an existing draft) as "Ready for review" rather than holding it back to
bundle in more. Smaller PRs review faster, land sooner, and keep branches close to `main`,
which minimises the divergence and conflicts that long-running branches invite. Split off
follow-on work into its own branch and PR.

In this workspace, a local `post-checkout` Git hook in `.githooks/` refreshes the local
`main` branch from `origin/main` after switching to `main`, helping keep the branch aligned
with GitHub while working locally.

After opening (or updating) a pull request, confirm it is actually mergeable via `gh`
(e.g. `gh pr view <n> --json mergeable,mergeStateStatus`) — in addition to, not instead
of, whatever local checks the agent already ran. The remote can diverge from what the
agent last saw locally (another PR merging to `main` first, for example), so this check
has to happen after the PR exists, against GitHub's own view of it, not inferred from the
local working tree. If it comes back conflicting, resolve the conflict (e.g. rebase onto
the current `main`) and push the fix; force-pushing to update a branch still requires
explicit instruction, per above.

## Release process

`package.json`'s `version` field is the single source of truth. To release, open a pull
request that bumps it (titled `chore: release vX.Y.Z`) and squash-merge it into `main`;
`.github/workflows/release.yml` tags that commit and publishes the GitHub release
automatically, so the tag can't drift out of sync with `package.json`. Consumer repos can
pin to a tag via `.poetic-version`.

## Exemplar config

`examples/poetic-config.example.yaml` documents every `.poetic-config.yaml`
option as a commented-out section, so a consumer can uncomment just the
feature they want instead of hunting through docs. It is synced to consumers
(the `examples/` path is framework-owned). Whenever a config key is added,
renamed, or removed in `src/tools/poetic-config.js` or elsewhere, update this
file in the same change — keep it aligned with the code and with
`docs/BUILD.md` / `docs/BLOGGER.md`.

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
`git config core.hooksPath .githooks`. Because `main` only accepts squash merges (see
"Branch workflow" above), the pull request title is what actually becomes the commit on
`main` — CI (`.github/workflows/commit-format.yml`) checks both the PR title and every
commit on the branch.

## Tech debt

When you defer work, take a shortcut, or notice a known gap, record it in
`TECH-DEBT.md` at the repo root — do not leave it only in a commit message or in
chat. Keep entries short and aligned to the format outlined in `TECH-DEBT.md`,
and delete one when it is resolved. If you add an entry in `TECH-DEBT.md` and
refer to that entry in other places (e.g., code comments), note that reference
in the `TECH-DEBT.md` entry, so whoever addresses that item knows to also remove
the references.

`TECH-DEBT.md` ends with a permanent Ledger table recording every ID ever
allocated, so a removed entry's ID is never reused. Get a new entry's ID from
`scripts/next-tech-debt-id.pl` rather than counting by hand; add the entry's
body under the `## Current Items` heading as a `### <id> <title>` section, and
add a Ledger row (`open`) alongside it. When picking up an existing open item,
follow the "Claiming an item" workflow at the top of `TECH-DEBT.md` — flip its
Ledger row to `in-progress` and open a draft PR immediately, so the claim is
visible to other agents/developers before the fix lands.

## Key docs

| File | Contents |
|------|----------|
| `docs/POEM-SYNTAX.md` | Complete `.poem` format spec |
| `docs/YAML-SCHEMA.md` | YAML poem schema |
| `docs/POEM-TO-YAML.md` | Converter (poem-to-yaml.js) docs |
| `docs/RENDERER-BROWSER.md` | Browser-safe renderer (`renderPoem`/`renderPoemPage`) |
| `docs/BUILD.md` | GitHub Pages deployment |
| `poem-syntax.ebnf` | Formal EBNF grammar |
| `docs/VIM-SYNTAX.md` | Vim integration docs |
