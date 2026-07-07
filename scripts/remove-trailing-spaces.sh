#!/usr/bin/env bash

# Script to remove trailing whitespace from all git-tracked files.
# Usage: ./remove-trailing-spaces.sh [--check]
#   --check   Report offending files without modifying them; exit 1 if any found.
#
# Markdown files (*.md) are canonicalized rather than stripped outright: a
# single trailing space is removed, but two or more are collapsed to exactly
# two, since Markdown treats a line ending in two spaces as a hard line break.

set -euo pipefail

check_only=false
if [[ "${1:-}" == "--check" ]]; then
    check_only=true
fi

# Colour codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

if [[ "$check_only" == true ]]; then
    echo "Checking tracked files for trailing whitespace..."
else
    echo "Removing trailing whitespace from tracked files..."
fi
echo

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Canonicalize trailing whitespace on stdin -> stdout.
#   mode=strip     strip all trailing whitespace (default)
#   mode=markdown  preserve an exact two-space hard line break; strip anything else
canonicalize() {
    local mode="$1"
    if [[ "$mode" == "markdown" ]]; then
        awk '
            /^[ \t]*$/ { print ""; next }
            {
                line = $0
                if (match(line, /[ \t]+$/)) {
                    content = substr(line, 1, RSTART - 1)
                    trail = substr(line, RSTART)
                    if (trail ~ /\t/ || length(trail) == 1) {
                        print content
                    } else {
                        print content "  "
                    }
                } else {
                    print line
                }
            }
        '
    else
        sed 's/[[:space:]]*$//'
    fi
}

# Get all tracked files
files_modified=0
files_processed=0

while IFS= read -r file; do
    # Skip if file doesn't exist (could be deleted but still tracked)
    if [[ ! -f "$file" ]]; then
        continue
    fi

    files_processed=$((files_processed + 1))
    # Skip .poem files to preserve intentional trailing double-spaces used for line breaks
    if [[ "$file" == *.poem ]]; then
        continue
    fi
    # Skip binary files - text transforms would corrupt them
    if ! grep -Iq '' "$file" 2>/dev/null; then
        continue
    fi

    mode="strip"
    if [[ "$file" == *.md ]]; then
        mode="markdown"
    fi

    tmp_file=$(mktemp)
    canonicalize "$mode" < "$file" > "$tmp_file"

    if ! cmp -s "$file" "$tmp_file"; then
        files_modified=$((files_modified + 1))
        if [[ "$check_only" == true ]]; then
            echo -e "${RED}✗${NC} Trailing whitespace: $file"
        else
            mv "$tmp_file" "$file"
            echo -e "${GREEN}✓${NC} Modified: $file"
        fi
    fi
    rm -f "$tmp_file"
done < <(git ls-files)

echo
echo "----------------------------------------"
echo "Processed: $files_processed files"
if [[ "$check_only" == true ]]; then
    echo "Offending: $files_modified files"
else
    echo "Modified:  $files_modified files"
fi
echo "----------------------------------------"

if [[ $files_modified -gt 0 ]]; then
    if [[ "$check_only" == true ]]; then
        echo -e "${RED}Trailing whitespace found. Run 'bash scripts/remove-trailing-spaces.sh' to fix.${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Note: Changes have been made. Review with 'git diff' before committing.${NC}"
else
    echo -e "${GREEN}All files are clean - no trailing whitespace found.${NC}"
fi
