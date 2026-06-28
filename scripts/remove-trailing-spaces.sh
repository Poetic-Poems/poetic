#!/usr/bin/env bash

# Script to remove trailing spaces from all git-tracked files
# Usage: ./remove-trailing-spaces.sh

set -euo pipefail

# Colour codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

echo "Removing trailing spaces from tracked files..."
echo

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

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
    
    # Create a temporary file
    tmp_file=$(mktemp)
    
    # Remove trailing spaces and save to temp file
    sed 's/[[:space:]]*$//' "$file" > "$tmp_file"
    
    # Check if file was modified
    if ! cmp -s "$file" "$tmp_file"; then
        mv "$tmp_file" "$file"
        echo -e "${GREEN}✓${NC} Modified: $file"
        files_modified=$((files_modified + 1))
    else
        rm "$tmp_file"
    fi
done < <(git ls-files)

echo
echo "----------------------------------------"
echo "Processed: $files_processed files"
echo "Modified:  $files_modified files"
echo "----------------------------------------"

if [[ $files_modified -gt 0 ]]; then
    echo -e "${YELLOW}Note: Changes have been made. Review with 'git diff' before committing.${NC}"
else
    echo -e "${GREEN}All files are clean - no trailing spaces found.${NC}"
fi
