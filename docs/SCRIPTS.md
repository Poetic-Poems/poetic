# Shell scripts reference

This document covers the shell scripts in `scripts/`.  All scripts are
framework-owned and synced from upstream poetic — do not hand-edit them if
you want changes to survive the next sync.  For local overrides, add the path
to `skip_paths` in `.poetic-config.yaml`.

---

## `scripts/edit-poem`

Open a `.poem` file in vi by name, and automatically rebuild if the file is
saved with changes.

### Usage

```bash
scripts/edit-poem [PATTERN]
```

`PATTERN` is matched case-insensitively against `.poem` file paths under
`src/poems/`.  Shell-style anchors are supported within the pattern:

| Pattern form | Matches |
|---|---|
| `PATTERN` | any path containing PATTERN as a substring |
| `^PATTERN` | paths starting with PATTERN |
| `PATTERN$` | paths ending with PATTERN (before `.poem`) |
| `^PATTERN$` | exact basename match |

### Examples

```bash
scripts/edit-poem shepherd      # open the poem whose path contains "shepherd"
scripts/edit-poem ^my-poem$     # open my-poem.poem exactly
scripts/edit-poem ^at           # open any poem whose filename starts with "at"
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Poem opened (build triggered automatically if the file was modified) |
| `-1` | No poems matched PATTERN |
| `N > 1` | N poems matched (ambiguous); titles listed to stderr; no file opened |

### Notes

- Rebuilding is triggered by comparing the md5 checksum of the file before and
  after editing.  If you exit vi without saving, no rebuild occurs.
- The editor is always `vi`.  To use a different editor, call it directly and
  run `npm run build` manually.

---

## `scripts/setup-linux.sh`

Wrapper that activates nvm before running a command.

### The problem it solves

On Windows Subsystem for Linux (WSL), the system `PATH` typically includes the
Windows `node` and `npm` binaries before any Linux-installed ones.  Invoking
`npm run build` directly can therefore call the Windows versions, which fail
silently on Linux-style paths.  This wrapper loads nvm so the correct Linux
Node.js is active, then exec's the rest of the command line.

On macOS or native Linux without nvm, the script is a transparent pass-through
— nvm is only loaded if `~/.nvm/nvm.sh` exists.

### Usage

```bash
./scripts/setup-linux.sh npm run build
./scripts/setup-linux.sh npm run build:all
./scripts/setup-linux.sh <any command>
```

### Notes

- The script uses `exec`, so it replaces the current shell process — there is
  no overhead from an extra shell layer.
- The nvm version selected is the default (`nvm use node`), i.e. the most
  recently installed version.  To pin a version, set a `.nvmrc` file in the
  repo root.

---

## `scripts/sync-framework.sh`

Pull framework files from the upstream `warwickallen/poetic` repository into
this repo.

The poetic framework owns the build tools, templates, editor integrations, and
documentation.  Running this script fetches the requested ref, checks out each
framework-owned path at that ref, and updates `.poetic-version`.

### Usage

```bash
scripts/sync-framework.sh                  # sync using ref in .poetic-version
scripts/sync-framework.sh --ref v1.2.0     # sync from a specific tag
scripts/sync-framework.sh --ref main       # sync from latest main
scripts/sync-framework.sh --commit         # also commit the staged sync
```

### Arguments

| Flag | Description |
|---|---|
| `--ref <ref>` | Git ref (tag or branch) to sync from.  Overrides `.poetic-version`. |
| `--commit` | Commit the staged sync automatically, using the script's suggested message. |

### Workflow

1. Adds (or updates) a `poetic` git remote pointing at the upstream repo.
2. Fetches all tags and branches from `poetic` (unauthenticated, so CI auth
   headers do not interfere with the public repo fetch).
3. Resolves the requested ref — first as a remote branch, then as a tag.
4. Syncs `scripts/sync-framework.sh` itself first. If it changed upstream (e.g.
   a new framework path was added to it), re-runs the updated copy before
   syncing anything else, so the rest of this run already has the current
   path list.
5. Checks out each remaining framework-owned path at the resolved commit,
   unless the working tree already matches that commit for the path (a
   content comparison, not just "same ref as last time") — reported as
   `unchanged <path>` rather than `synced <path>`. This avoids bumping a
   file's modification time when nothing in it actually changed, which
   would otherwise cause the build scripts' incremental-rebuild checks (see
   `docs/BUILD.md`) to treat every output as stale after every sync.
6. Skips any paths listed in `skip_paths` in `.poetic-config.yaml`.
7. Updates and stages `.poetic-version` with the synced channel, ref, and full
   commit hash.
8. Builds a summary of upstream commit messages between the previously synced
   commit (read from `.poetic-version` before it was overwritten) and this
   one, restricted to framework-owned paths. If that previous commit isn't in
   the local object database (first-ever sync, or upstream history was
   rewritten), the summary falls back to a note saying so instead of failing.
9. If `--commit` was passed and there are staged changes, commits them —
   using the summary as the commit body, when there is one.

### After syncing

Without `--commit`:

```bash
git diff --staged                        # review what changed
git commit -m "chore: sync framework from poetic <ref>"
```

With `--commit`, this happens automatically once the sync completes, and the
commit body records which upstream commits were pulled in. Either way, the
summary is printed to the terminal so you can see it before deciding.

### Skipping paths

To keep a local override of a framework file, add it to `.poetic-config.yaml`:

```yaml
skip_paths:
  - public/poetic.css
  - public/poetic-logo.svg
```

Each path is compared exactly against the framework path list.

### Notes on CI authentication

GitHub Actions injects a repo-scoped `GITHUB_TOKEN` as an HTTP extra-header
that matches all `github.com` requests by prefix.  The script clears this
header for the one fetch command that targets the public poetic repo, so the
request goes out unauthenticated.  This is a no-op locally where the key is
not set.

---

## `scripts/remove-trailing-spaces.sh`

Remove trailing whitespace from all git-tracked files in the repository, or
(with `--check`) verify there is none without modifying anything.

### Usage

```bash
bash scripts/remove-trailing-spaces.sh          # fix in place
bash scripts/remove-trailing-spaces.sh --check  # report only; exit 1 if any found
npm run check                                   # same as --check
```

### Behaviour

- Iterates over all files tracked by git (`git ls-files`).
- Skips files that do not exist on disk (e.g. deleted but still tracked).
- **Skips `.poem` files** — trailing double-spaces in `.poem` files are
  meaningful (they signal a forced line break in the `.poem` syntax).
- **Canonicalizes `.md` files instead of stripping them** — Markdown treats a
  line ending in exactly two spaces as a hard line break, so a single trailing
  space is removed, two are left alone, and three or more are collapsed down
  to exactly two. Whitespace-only lines are always fully emptied.
- **Skips binary files** (detected via `grep -I`), so images and other
  non-text assets are never rewritten.
- Without `--check`, modifies files in place and prints a summary of what
  changed.
- With `--check`, prints each offending file and exits with status 1 if any
  are found — nothing is written to disk. This is the mode run in CI
  (`npm run check`, wired into `.github/workflows/build-poems.yml`).

### Output

```
Removing trailing spaces from tracked files...

✓ Modified: src/tools/build-poems.js
✓ Modified: docs/BUILD.md

----------------------------------------
Processed: 42 files
Modified:  2 files
----------------------------------------
Note: Changes have been made. Review with 'git diff' before committing.
```

### Notes

- Run `npm run check` (or the script with `--check`) before committing to
  catch trailing whitespace without risking an unreviewed rewrite.
- Run the script without `--check` to fix any violations it finds.
- Changes are written to the working tree only — you still need to `git add`
  and `git commit` them.

---

## `scripts/check-build-artifacts.sh`

Verifies that `npm run build` produced the expected generated files under
`public/`: `index.html`, `all-poems.html`, and `poetic.css`.

### Usage

```bash
npm run build
npm run check:build    # or: bash scripts/check-build-artifacts.sh
```

### Behaviour

- Checks for the presence of each required file; does not build anything
  itself, so it must run after `npm run build`.
- Prints ✓/✗ per file and exits with status 1 if any are missing.
- This is the check run in CI (`npm run check:build`, wired into
  `.github/workflows/build-poems.yml`) as a build smoke test — it catches a
  silently broken build pipeline (e.g. a template change that throws before
  writing output) before it reaches Pages.
