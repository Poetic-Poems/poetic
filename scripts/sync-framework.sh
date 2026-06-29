#!/bin/bash
#
# sync-framework.sh — pull framework files from warwickallen/poetic into this repo.
#
# The poetic framework owns the build tools, templates, editor integrations, and
# documentation.  This script fetches the requested ref from the upstream repo,
# checks out each framework-owned path at that ref, and updates .poetic-version.
#
# Paths listed in skip_paths inside .poetic-config are left untouched, allowing
# users to maintain local overrides of specific framework files.
#
# Usage:
#   scripts/sync-framework.sh                  # sync using ref in .poetic-version
#   scripts/sync-framework.sh --ref v1.2.0     # sync from a specific tag
#   scripts/sync-framework.sh --ref main       # sync from latest main
#
# After running, review staged changes with `git diff --staged`, then commit.
# If sync-framework.sh itself was updated during the sync, re-run the script to
# pick up the new version before committing.

set -euo pipefail

POETIC_URL="https://github.com/warwickallen/poetic.git"
POETIC_REMOTE="poetic"
VERSION_FILE=".poetic-version"

DEFAULT_REF=$(grep '^ref=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || echo main)
POETIC_REF="$DEFAULT_REF"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) POETIC_REF="$2"; shift 2;;
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
git -c "http.https://github.com/.extraheader=" fetch "$POETIC_REMOTE" --tags --quiet

# Resolve ref: try remote branch first, then tag
if POETIC_COMMIT=$(git rev-parse "refs/remotes/$POETIC_REMOTE/$POETIC_REF" 2>/dev/null); then
  :
elif POETIC_COMMIT=$(git rev-parse "refs/tags/$POETIC_REF" 2>/dev/null); then
  :
else
  echo "Error: ref '$POETIC_REF' not found in $POETIC_URL" >&2
  exit 1
fi

FRAMEWORK_PATHS=(
  src/tools
  src/templates
  editors
  docs
  examples
  test
  poem-syntax.ebnf
  package.json
  src/poems/poem/_example.poem
  src/poems/yaml/_example.yaml
  src/poems/yaml/_shared.yaml
  public/poetic.css
  public/poetic.js
  public/poetic-logo.svg
  .github/workflows/build-poems.yml
  .github/workflows/sync-framework.yml
  .github/workflows/sync-blogger.yml
  scripts/sync-framework.sh
  scripts/edit-poem
  scripts/poem-to-raw.sh
  scripts/remove-trailing-spaces.sh
  scripts/setup-linux.sh
)

# Paths the user has opted to manage locally (comma-separated in .poetic-config)
SKIP_PATHS=()
if [ -f .poetic-config ]; then
  skip_raw=$(grep '^skip_paths=' .poetic-config 2>/dev/null | cut -d= -f2 || true)
  if [ -n "$skip_raw" ]; then
    IFS=',' read -ra SKIP_PATHS <<< "$skip_raw"
  fi
fi

echo "Syncing from poetic @ $POETIC_REF (${POETIC_COMMIT:0:8})..."
for path in "${FRAMEWORK_PATHS[@]}"; do
  skip=false
  for skip_path in "${SKIP_PATHS[@]}"; do
    if [ "$path" = "$skip_path" ]; then
      skip=true
      break
    fi
  done
  if $skip; then
    echo "  skipped $path (local override)"
    continue
  fi
  if git checkout "$POETIC_COMMIT" -- "$path" 2>/dev/null; then
    echo "  synced  $path"
  else
    echo "  skipped $path (not in poetic)"
  fi
done

current_channel=$(grep '^channel=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || echo releases)
printf 'channel=%s\nref=%s\ncommit=%s\n' "$current_channel" "$POETIC_REF" "$POETIC_COMMIT" > "$VERSION_FILE"

echo ""
if git diff --staged --quiet; then
  echo "Done. Already up to date — no changes to commit."
else
  echo "Done. Review staged changes with: git diff --staged"
  echo "Commit with: git commit -m 'chore: sync framework from poetic $POETIC_REF'"
  echo ""
  echo "If scripts/sync-framework.sh itself was updated, re-run to pick up the new version."
fi
