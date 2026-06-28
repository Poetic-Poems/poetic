#!/bin/bash
# Syncs framework files from warwickallen/poetic into this repo.
#
# Usage:
#   scripts/sync-framework.sh                  # sync using ref in .poetic-version
#   scripts/sync-framework.sh --ref v1.2.0     # sync from a specific tag
#   scripts/sync-framework.sh --ref main       # sync from latest main

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
git fetch "$POETIC_REMOTE" --tags --quiet

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
  src/poems/poem/.shared.poem
  src/poems/yaml/_example.yaml
  src/poems/yaml/_shared.yaml
  public/styles.css
  .github/workflows/build-poems.yml
  .github/workflows/sync-framework.yml
  scripts/sync-framework.sh
  scripts/edit-poem
  scripts/poem-to-raw.sh
  scripts/remove-trailing-spaces.sh
  scripts/setup-linux.sh
)

echo "Syncing from poetic @ $POETIC_REF (${POETIC_COMMIT:0:8})..."
for path in "${FRAMEWORK_PATHS[@]}"; do
  if git checkout "$POETIC_COMMIT" -- "$path" 2>/dev/null; then
    echo "  synced  $path"
  else
    echo "  skipped $path (not in poetic)"
  fi
done

current_channel=$(grep '^channel=' "$VERSION_FILE" 2>/dev/null | cut -d= -f2 || echo releases)
printf 'channel=%s\nref=%s\ncommit=%s\n' "$current_channel" "$POETIC_REF" "$POETIC_COMMIT" > "$VERSION_FILE"

echo ""
echo "Done. Review staged changes with: git diff --staged"
echo "Commit with: git commit -m 'chore: sync framework from poetic $POETIC_REF'"
echo ""
echo "If scripts/sync-framework.sh itself was updated, re-run to pick up the new version."
