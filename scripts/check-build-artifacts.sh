#!/usr/bin/env bash

# Verifies that `npm run build` produced the expected generated artefacts.
# Usage: ./scripts/check-build-artifacts.sh
# Run this after `npm run build`; it does not build anything itself.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Colour

required_files=(
    "public/index.html"
    "public/all-poems.html"
    "public/poetic.css"
    "public/date-utils.js"
)

missing=0
for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file not found"
        missing=$((missing + 1))
    fi
done

echo
if [[ $missing -gt 0 ]]; then
    echo -e "${RED}Missing $missing build artefact(s). Run 'npm run build' first.${NC}"
    exit 1
fi
echo -e "${GREEN}All build artefacts present.${NC}"
