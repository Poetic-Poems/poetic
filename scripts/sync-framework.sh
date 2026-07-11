#!/bin/bash
#
# sync-framework.sh — pull framework files from warwickallen/poetic into this repo.
#
# The poetic framework owns the build tools, templates, editor integrations, and
# documentation.  This script fetches the requested ref from the upstream repo,
# checks out each framework-owned path at that ref, and updates .poetic-version.
#
# Paths listed in skip_paths inside .poetic-config.yaml are left untouched,
# allowing users to maintain local overrides of specific framework files.
#
# This script syncs itself first. If scripts/sync-framework.sh changed upstream
# (e.g. a new path was added to FRAMEWORK_PATHS below), it re-execs the updated
# copy before syncing anything else, so the run picks up the current list
# instead of a stale one.
#
# Usage:
#   scripts/sync-framework.sh                  # sync using ref in .poetic-version
#   scripts/sync-framework.sh --ref v1.2.0     # sync from a specific tag
#   scripts/sync-framework.sh --ref main       # sync from latest main
#   scripts/sync-framework.sh --commit         # also commit the staged sync
#
# After running, review staged changes with `git diff --staged`, then commit
# (or pass --commit to have the script commit them with its suggested message).

set -euo pipefail

POETIC_URL="https://github.com/warwickallen/poetic.git"
POETIC_REMOTE="poetic"
VERSION_FILE=".poetic-version"
SELF_PATH="scripts/sync-framework.sh"

DEFAULT_REF=$(grep '^ref=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || echo main)
POETIC_REF="$DEFAULT_REF"
AUTO_COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) POETIC_REF="$2"; shift 2;;
    --commit) AUTO_COMMIT=true; shift;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

if git remote get-url "$POETIC_REMOTE" &>/dev/null; then
  git remote set-url "$POETIC_REMOTE" "$POETIC_URL"
else
  git remote add "$POETIC_REMOTE" "$POETIC_URL"
fi

echo "Fetching from poetic..."
# In CI, actions/checkout injects the repo-scoped GITHUB_TOKEN as an HTTP
# extraheader on the base key `http.https://github.com/.extraheader`. That key
# also matches requests to OTHER github.com repos (like poetic, via prefix match)
# and gets rejected with a 401. Emptying that exact key for this one command
# resets the accumulated header list, so the fetch goes out unauthenticated
# (fine for a public repo). Works for single or multiple values, and is a no-op
# locally where the key isn't set.
git -c "http.https://github.com/.extraheader=" fetch "$POETIC_REMOTE" --tags --force --quiet

# Resolve ref: try remote branch first, then tag
if POETIC_COMMIT=$(git rev-parse "refs/remotes/$POETIC_REMOTE/$POETIC_REF" 2>/dev/null); then
  :
elif POETIC_COMMIT=$(git rev-parse "refs/tags/$POETIC_REF" 2>/dev/null); then
  :
else
  echo "Error: ref '$POETIC_REF' not found in $POETIC_URL" >&2
  exit 1
fi

# Paths the user has opted to manage locally (a YAML list under skip_paths
# in .poetic-config.yaml, e.g.:
#   skip_paths:
#     - public/poetic.css
SKIP_PATHS=()
if [ -f .poetic-config.yaml ]; then
  while IFS= read -r skip_path; do
    SKIP_PATHS+=("$skip_path")
  done < <(awk '
    /^skip_paths:/ { in_list=1; next }
    in_list && /^[[:space:]]*-[[:space:]]/ {
      sub(/^[[:space:]]*-[[:space:]]*/, "");
      gsub(/^["'"'"']|["'"'"']$/, "");
      print;
      next
    }
    in_list && /^[^[:space:]]/ { in_list=0 }
  ' .poetic-config.yaml)
fi

is_skipped() {
  local candidate="$1"
  if [ "${#SKIP_PATHS[@]}" -eq 0 ]; then
    return 1
  fi
  for skip_path in "${SKIP_PATHS[@]}"; do
    [ "$candidate" = "$skip_path" ] && return 0
  done
  return 1
}

# Sync this script first. If it changed upstream (e.g. FRAMEWORK_PATHS below
# grew a new entry), re-exec the updated copy so the rest of the sync runs
# with the current list rather than a stale one. POETIC_RESYNCED guards
# against re-execing more than once per run.
if [ -z "${POETIC_RESYNCED:-}" ] && ! is_skipped "$SELF_PATH"; then
  SELF_TMP=$(mktemp)
  cp "$SELF_PATH" "$SELF_TMP"
  git checkout "$POETIC_COMMIT" -- "$SELF_PATH" 2>/dev/null || true
  SELF_CHANGED=false
  cmp -s "$SELF_TMP" "$SELF_PATH" || SELF_CHANGED=true
  rm -f "$SELF_TMP"
  if $SELF_CHANGED; then
    echo "sync-framework.sh changed upstream — re-running the updated version..."
    export POETIC_RESYNCED=1
    if $AUTO_COMMIT; then
      exec bash "$SELF_PATH" --ref "$POETIC_REF" --commit
    else
      exec bash "$SELF_PATH" --ref "$POETIC_REF"
    fi
  fi
fi

FRAMEWORK_PATHS=(
  .claude/skills
  .editorconfig
  .github/workflows/build-poems.yml
  .github/workflows/sync-blogger.yml
  .github/workflows/sync-framework.yml
  LICENCE
  docs
  editors
  eslint.config.js
  examples
  package.json
  package-lock.json
  poem-syntax.ebnf
  public/all-poems.js
  public/index.js
  public/poetic-footer.html
  public/poetic-logo.svg
  public/poetic.css
  public/poetic.js
  scripts/check-build-artifacts.sh
  scripts/edit-poem
  scripts/get-tech-debt-record.pl
  scripts/remove-trailing-spaces.sh
  scripts/setup-linux.sh
  scripts/sync-framework.sh
  src/poems/poem/_example.poem
  src/poems/poem/_minimal.poem
  src/poems/poem/_params-example.poem
  src/poems/yaml/_example.yaml
  src/poems/yaml/_minimal.yaml
  src/poems/yaml/_params-example.yaml
  src/poems/yaml/_shared.yaml
  src/song-handlers.yaml
  src/templates
  src/tools
  test
)

echo "Syncing from poetic @ $POETIC_REF (${POETIC_COMMIT:0:8})..."
for path in "${FRAMEWORK_PATHS[@]}"; do
  if is_skipped "$path"; then
    echo "  skipped $path (local override)"
    continue
  fi
  if [ "$path" = "$SELF_PATH" ]; then
    echo "  synced  $path (self, synced first)"
    continue
  fi
  if git checkout "$POETIC_COMMIT" -- "$path" 2>/dev/null; then
    echo "  synced  $path"
  else
    echo "  skipped $path (not in poetic)"
  fi
done

current_channel=$(grep '^channel=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || echo releases)
OLD_COMMIT=$(grep '^commit=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || true)
printf 'channel=%s\nref=%s\ncommit=%s\n' "$current_channel" "$POETIC_REF" "$POETIC_COMMIT" > "$VERSION_FILE"
git add "$VERSION_FILE"

# Propagate upstream deletions. `git checkout <commit> -- <path>` overlays files
# but never removes ones deleted upstream, so a framework file the poetic repo
# has since deleted would otherwise live on in the consumer forever. When the
# previously synced commit (OLD_COMMIT) is available locally, stage removals for
# framework paths deleted between it and the target commit. This is deliberately
# conservative — it runs unattended in consumer CI: a path is removed only when
# it is (i) under FRAMEWORK_PATHS (the diff pathspec is restricted to that list),
# (ii) deleted upstream between the two synced commits (--diff-filter=D), and
# (iii) not in skip_paths. A file merely absent at the target commit is left
# alone, so consumer files living under shared framework directories are safe.
if [ -z "$OLD_COMMIT" ]; then
  echo "  (no previously synced commit recorded; skipping deletion of upstream-removed files)"
elif [ "$OLD_COMMIT" = "$POETIC_COMMIT" ]; then
  : # same commit — nothing was deleted between it and itself
elif ! git cat-file -e "${OLD_COMMIT}^{commit}" 2>/dev/null; then
  echo "  (previous commit ${OLD_COMMIT:0:8} not found upstream; skipping deletion of upstream-removed files)"
else
  while IFS= read -r deleted_path; do
    [ -n "$deleted_path" ] || continue
    if is_skipped "$deleted_path"; then
      echo "  skipped $deleted_path (local override; deleted upstream)"
      continue
    fi
    # Only remove paths the consumer actually tracks, so the echo is honest and
    # a path the consumer never synced is a silent no-op.
    if git ls-files --error-unmatch -- "$deleted_path" >/dev/null 2>&1; then
      git rm --quiet --ignore-unmatch -- "$deleted_path"
      echo "  deleted $deleted_path (removed upstream)"
    fi
  done < <(git diff --name-only --diff-filter=D "$OLD_COMMIT" "$POETIC_COMMIT" -- "${FRAMEWORK_PATHS[@]}" 2>/dev/null || true)
fi

# Build a commit body from the upstream commit messages between the previously
# synced commit and this one, restricted to framework-owned paths. Falls back
# to a note (rather than failing) if the previous commit isn't in the local
# object database — e.g. first-ever sync, or upstream history was rewritten.
COMMIT_BODY=""
if [ -n "$OLD_COMMIT" ] && [ "$OLD_COMMIT" != "$POETIC_COMMIT" ]; then
  if git cat-file -e "${OLD_COMMIT}^{commit}" 2>/dev/null; then
    RANGE_LOG=$(git log --oneline --no-decorate "${OLD_COMMIT}..${POETIC_COMMIT}" -- "${FRAMEWORK_PATHS[@]}" 2>/dev/null || true)
    if [ -n "$RANGE_LOG" ]; then
      RANGE_LOG_COUNT=$(printf '%s\n' "$RANGE_LOG" | wc -l)
      if [ "$RANGE_LOG_COUNT" -gt 25 ]; then
        COMMIT_BODY="$(printf '%s\n' "$RANGE_LOG" | head -25)
... ($((RANGE_LOG_COUNT - 25)) more commits)"
      else
        COMMIT_BODY="$RANGE_LOG"
      fi
    fi
  else
    COMMIT_BODY="(previous commit ${OLD_COMMIT:0:8} not found upstream; unable to summarize changes)"
  fi
fi

echo ""
COMMIT_SUBJECT="chore: sync framework from poetic $POETIC_REF"
if git diff --staged --quiet; then
  echo "Done. Already up to date — no changes to commit."
  exit 0
fi

if [ -n "$COMMIT_BODY" ]; then
  echo "Upstream changes in this sync:"
  echo "$COMMIT_BODY"
  echo ""
fi

if $AUTO_COMMIT; then
  if [ -n "$COMMIT_BODY" ]; then
    git commit -m "$COMMIT_SUBJECT" -m "$COMMIT_BODY"
  else
    git commit -m "$COMMIT_SUBJECT"
  fi
  echo "Done. Committed: $COMMIT_SUBJECT"
else
  echo "Done. Review staged changes with: git diff --staged"
  echo "Commit with: git commit -m '$COMMIT_SUBJECT'"
fi
