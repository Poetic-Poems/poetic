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
                    sync-blogger.yml, sync-framework.yml, tech-debt-register.yml
```

## Build commands

```bash
npm run build          # .poem → YAML → HTML
npm run build:all      # build + start dev server at http://localhost:8080
npm start              # start dev server only
npm test               # run Node.js built-in test suite
npm run test:watch     # run tests in watch mode; also: `node --test test/<file>.test.js` for a subset
npm run check          # verify no trailing whitespace in tracked files (also runs in CI)
npm run check:build    # verify expected build artefacts exist after `npm run build` (also runs in CI)
npm run check:licenses # verify production dependency licences are on the allow-list (also runs in CI)
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

## Shared sections

The sections between `<!-- agent-info:start fragment=… -->` and
`<!-- agent-info:end … -->` markers below — the branch workflow, commit
messages, the maintainer statement, documentation principles and tech debt —
are the text every Poetic-Poems and Pullwright repository shares. They are
stamped from `Pullwright/.agent/fragments/` by `Poetic-Poems/.agent`'s
`scripts/sync.sh`, and a hand edit inside a region is overwritten at the next
sync: change the fragment, then re-stamp. Each start marker records the
source commit and a hash of the content, so the sync's `--check` tells a hand
edit from a stale copy.

<!-- agent-info:start fragment=conventions source=Pullwright/.agent@b517d3d sha256=ef335f09ea9d -->
<!-- Stamped by Poetic-Poems/.agent scripts/sync.sh from Pullwright/.agent:fragments/conventions.md - a hand edit inside this region is overwritten at the next sync; edit the source instead. -->

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

All Poetic-Poems and Pullwright repositories, this one included, operate in a multi-agent
environment: autonomous and interactive agents, and the maintainer, may push branches, merge
pull requests, and move `main` at any time. Before commencing any changes, make your own
dedicated fresh clone of `origin/main` and work in that — never in a checkout shared with
anyone else, such as the user's working copy (which may be edited at any moment) or a clone
another agent is already using:

```bash
git clone --filter=blob:none https://github.com/Poetic-Poems/poetic.git <scratch-dir>/poetic
```

A blobless clone is the default: it keeps the full commit history, so rebasing onto a moved
`main`, `git log`, `git blame` and merge-base all just work, and it fetches file contents only
as they are read. It is the default because you cannot reliably know in advance whether a
task will need history, and the two ways of guessing wrong are not symmetric — a blobless
clone that never needed history has cost a little metadata, whereas a shallow clone
(`--depth 1`) has no merge base and must be deepened (`git fetch --unshallow`) before it can
rebase. Use `--depth 1` only where nothing will rebase or read history, and a full clone
where you want every blob locally. Commit, push the feature branch, and open the pull request
from that clone; delete the clone once the work has landed. And when you open the PR, do not
assume `origin/main` is still in the state it was when you cloned — another change may have
merged meanwhile, which is why the post-PR mergeable check below is mandatory.

Before starting on any implementation, check for in-flight or prior work on the same
problem: open pull requests (`gh pr list --search "<keywords>"`), open issues, and any claim
the autonomous pipeline may hold on the item. These repositories are worked by concurrent
autonomous agents, so the work may already be under way; if it is, reconcile first — adopt
it, supersede it with an explanation, or stand down — before writing code.

Keep feature branches short-lived and narrowly scoped. Prefer breaking a large piece of
work into a series of small pull requests, each a safe, self-contained, independently
reviewable and mergeable unit, over accumulating many changes on one long-running branch.
As soon as a branch reaches such a unit of work — coherent on its own, with CI passing —
open it (or mark an existing draft) as "Ready for review" rather than holding it back to
bundle in more. Smaller PRs review faster, land sooner, and keep branches close to `main`,
which minimises the divergence and conflicts that long-running branches invite. Split off
follow-on work into its own branch and PR.

A pull request's readiness state is the signal the maintainer reads. Open it as a draft
(`gh pr create --draft`) while its content is still changing, its tests are unproven, or a
correction is still on its way, and mark it Ready only when it may merge exactly as it
stands: a Ready, green, unconflicted pull request may be put into the merge queue at any
moment, and once queued its head branch refuses further pushes (the queue lock, not a
permissions problem — stack any further change on a fresh branch instead). A "do not merge"
note in the description is not a substitute for Draft.

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

## Commit messages

All commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
(`<type>[(scope)][!]: <description>`, e.g. `fix(build): resolve output path`). Allowed
types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`,
`test`. A `commit-msg` hook (`.githooks/commit-msg`) enforces this once a contributor runs
`git config core.hooksPath .githooks`. Because `main` only accepts squash merges (see
"Branch workflow" above), the pull request title is what actually becomes the commit on
`main` — CI (`.github/workflows/commit-format.yml`) checks both the PR title and every
commit on the branch.

<!-- agent-info:end fragment=conventions -->

## Branch protection in this repository

The ruleset's required-status-checks rule leaves `strict_required_status_checks_policy`
off: a PR's checks do not have to be re-run against the latest `main` immediately before
merging, only to have passed at some point on the branch. This is a deliberate choice, not
an oversight — the mandatory post-PR mergeable check described below (`gh pr view --json
mergeable,mergeStateStatus`, rebasing on conflict) already catches a base that has drifted
too far to merge cleanly, and turning strict mode on would force every open PR's checks to
re-run on every unrelated merge to `main`, which is wasteful churn in a multi-agent
environment where several PRs are routinely in flight at once. Revisit this if a stale-base
merge ever actually causes an integration bug that a textual merge would not have caught.

<!-- agent-info:start fragment=maintainer source=Pullwright/.agent@b517d3d sha256=55824e959da4 -->
<!-- Stamped by Poetic-Poems/.agent scripts/sync.sh from Pullwright/.agent:fragments/maintainer.md - a hand edit inside this region is overwritten at the next sync; edit the source instead. -->

This project presently has a single maintainer. The one approving review that the `main`
ruleset requires (it is a required review, not a code-owner review — `CODEOWNERS` lists
`@warwickallen` and `@Warwick-Allen` only so that a reviewer is requested automatically) is
given either by that maintainer's own second GitHub account or by the Pullwright Approver
App acting on the maintainer's behalf — one person, two handles, one email throughout the
git history — so it is self-review by design, not independent peer review; a reader (human
or agent) should not infer otherwise from the branch-protection description above. There
is also no succession plan: if the maintainer becomes unavailable, no one else currently
holds equivalent access or repo context. The multi-agent conventions in this file manage
concurrent agents working on the repo at once; they do not substitute for independent
review or bus-factor redundancy.

<!-- agent-info:end fragment=maintainer -->

## Release process

`package.json`'s `version` field is the single source of truth. To release, open a pull
request that bumps it (titled `chore: release vX.Y.Z`) and squash-merge it into `main`;
`.github/workflows/release.yml` tags that commit and publishes the GitHub release
automatically, so the tag can't drift out of sync with `package.json`. Consumer repos can
pin to a tag via `.poetic-version`.

The same workflow's `changelog-check` job runs on every pull request and fails one that
changes `package.json`'s `version` without `CHANGELOG.md` carrying a matching
`## [<version>]` heading, so a release cannot land with the previous release's entries
still sitting under `[Unreleased]`. A release pull request therefore first runs
`scripts/assemble-changelog.sh` to fold every merged pull request's own `## Changelog`
section into `[Unreleased]`, then renames `[Unreleased]` to a `## [X.Y.Z]` heading in the
same pull request that bumps the version — `changelog-check` itself is unchanged.

## Exemplar config

`examples/poetic-config.example.yaml` documents every `.poetic-config.yaml`
option as a commented-out section, so a consumer can uncomment just the
feature they want instead of hunting through docs. It is synced to consumers
(the `examples/` path is framework-owned). Whenever a config key is added,
renamed, or removed in `src/tools/poetic-config.js` or elsewhere, update this
file in the same change — keep it aligned with the code and with
`docs/BUILD.md` / `docs/BLOGGER.md`.

<!-- agent-info:start fragment=documentation-principles source=Pullwright/.agent@641d8b5 sha256=f1a51ab1ae6e -->
<!-- Stamped by Poetic-Poems/.agent scripts/sync.sh from Pullwright/.agent:fragments/documentation-principles.md - a hand edit inside this region is overwritten at the next sync; edit the source instead. -->

## Documentation principles

- **The changelog entry lives in the pull request, not in a file the change
  edits.** A notable change (one visible to poem authors or site publishers) records itself under a
  `## Changelog` heading in the pull request's description: one or more of
  the six Keep a Changelog category sub-headings — `### Added`,
  `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`,
  `### Security` — each followed by bullet points written for that audience.
  A change that is not notable — a patch-level fix, a routine documentation
  update — says so with the single line `None.` under the same heading, so
  the omission is visibly deliberate rather than forgotten. A pull request
  whose title's type is `feat`, `fix` or `perf`, or which carries the `!`
  breaking-change marker, must carry the section, even if only to say
  `None.`; other types may omit it. The squash merge carries the
  description onto `main` as the commit message, and `CHANGELOG.md` (Keep a
  Changelog format) is assembled from those commit messages by the release
  pull request — or, in a repository that does not cut releases, by the
  scheduled roll — which is the only pull request that edits the file. Two
  pull requests therefore never conflict over the changelog.
- **All other docs are as-built.** Write them to describe the current state
  only — no "previously", "used to be", "now uses", "migration completed", or
  "old format (deprecated)" phrasing. Git log already records history; docs
  that repeat it become misleading as the codebase evolves.
- If you encounter historical language in an existing doc, remove it and
  move the substance into your pull request's `## Changelog` section if it
  is significant.

<!-- agent-info:end fragment=documentation-principles -->

<!-- agent-info:start fragment=tech-debt-issues source=Pullwright/.agent@b517d3d sha256=aa282c7c4cd3 -->
<!-- Stamped by Poetic-Poems/.agent scripts/sync.sh from Pullwright/.agent:fragments/tech-debt-issues.md - a hand edit inside this region is overwritten at the next sync; edit the source instead. -->

## Tech debt

When you defer work, take a shortcut, or notice a known gap, record it —
do not leave it only in a commit message or in chat. Tech debt is filed as
a GitHub issue labelled `pw::type:tech-debt`, not as a file in this
repository: dedup-search first (`gh issue list --label pw::type:tech-debt
--search "<working title>"`), and cite an existing hit instead of filing a
second one. File the issue with the shortcut and its provenance in the
body (e.g. "Noticed while working #631"), then add a `Defers: #<n>` line
to the pull request that noticed it — never a closing keyword, since
deferring is not resolving.

Resolve a tech-debt issue by closing it with a real closing keyword (e.g.
`Fixes #<n>`) in the pull request that fixes it, plus a fenced `td-record`
block in that pull request's body (`issue`, `title`, `filed`, `summary`,
`resolution`) — the squash-merge commit then carries the permanent record
into `main`'s own immutable history, since a GitHub issue is mutable and
editable but `main`'s history is not.

`tech-debt/` is a **frozen historical archive** of the per-item register
this repository used before this policy: every record ever allocated
under scope `PPpoet`, kept in place forever — never edited, deleted, or
renamed. `TECH-DEBT.md` is a short policy pointer; `docs/TECH-DEBT-REGISTER.md`
documents the frozen archive's format, ID grammar and the scope-code
registry for repositories that still hold one. Do not add new files to
`tech-debt/`, and do not resurrect the `td/<id>` claim-branch workflow —
both belong to the frozen format, not the current policy.

<!-- agent-info:end fragment=tech-debt-issues -->

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
| `docs/TECH-DEBT-REGISTER.md` | Per-item tech-debt register format + scope-code registry |
