#!/usr/bin/env bash
# scripts/check-required-checks-drift.sh — compares the `default` branch
# ruleset's live `required_status_checks` against the in-repo record of
# intent, `.github/required-checks.txt` (issue #276).
#
# Usage: scripts/check-required-checks-drift.sh
#
# The ruleset's own `/history` endpoint returns 403 to this pipeline's
# token, so there is no audit trail to diff against past revisions —
# comparing against the checked-in manifest is the only mechanical check
# available. `register` was correctly dropped from the ruleset by the owner
# (#256, #260, following PR #220's retirement of the workflow that produced
# it); the incident that prompted this script was not drift, but nothing in
# the repo recorded that the drop was intentional, so a real drift would
# have been found only by luck.
#
# Resolves the ruleset by name+target (`default`/`branch`) rather than
# hard-coding its id, since the id is an implementation detail the ruleset
# could be recreated under. Uses `gh api` when a token is present, falling
# back to an unauthenticated `curl` on 403/404: this repository is public,
# so `GET /repos/<owner>/<repo>/rulesets` returns 200 with no credential at
# all, and the fallback means this script — and the daily workflow that
# calls it — never needs a secret. Unauthenticated calls are rate-limited
# per IP on shared runners, but this runs at most a couple of times a day,
# comfortably inside that; do not add retry loops.
#
# A required-status-checks context is normalised to the manifest's own
# `context` / `context @<integration_id>` form before comparing — a pinned
# and an unpinned context with the same name are treated as different
# entries, since the pin is the security-relevant part.
#
# Output: on a mismatch, two labelled groups — checks required live but
# missing from the manifest, and checks in the manifest but not required
# live. Exit 0 when they agree, 1 when they differ, 2 on any fetch or parse
# failure (so a network blip is never reported as drift).

set -euo pipefail

REPO="Poetic-Poems/poetic"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/../.github/required-checks.txt"

# Prints the JSON body of a GET to the given API path on stdout. Tries
# `gh api` first when a token is available; falls back to an unauthenticated
# `curl` when `gh` has no token, or when the authenticated call itself comes
# back 403/404 (a fine-grained token without ruleset read, for instance).
# Any other failure is fatal.
api_get() {
    local path="$1"
    local body status

    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        if body=$(gh api "$path" 2>/tmp/check-required-checks-drift.gh-err); then
            printf '%s' "$body"
            return 0
        fi
        if ! grep -qE 'HTTP (403|404)' /tmp/check-required-checks-drift.gh-err; then
            echo "error: gh api $path failed:" >&2
            cat /tmp/check-required-checks-drift.gh-err >&2
            return 2
        fi
    fi

    local response
    if ! response=$(curl -sS -w '\n%{http_code}' "https://api.github.com/$path"); then
        echo "error: GET https://api.github.com/$path failed (network error)" >&2
        return 2
    fi
    status="${response##*$'\n'}"
    body="${response%$'\n'*}"
    if [ "$status" != "200" ]; then
        echo "error: GET https://api.github.com/$path returned $status" >&2
        echo "$body" >&2
        return 2
    fi
    printf '%s' "$body"
}

if [ ! -f "$MANIFEST" ]; then
    echo "error: manifest not found at $MANIFEST" >&2
    exit 2
fi

rulesets_json=$(api_get "repos/$REPO/rulesets") || exit 2
ruleset_id=$(printf '%s' "$rulesets_json" \
    | jq -r '[.[] | select(.name == "default" and .target == "branch")] | .[0].id // empty') \
    || { echo "error: failed to parse rulesets list" >&2; exit 2; }
if [ -z "$ruleset_id" ]; then
    echo "error: no ruleset named 'default' targeting 'branch' found in repos/$REPO/rulesets" >&2
    exit 2
fi

ruleset_json=$(api_get "repos/$REPO/rulesets/$ruleset_id") || exit 2
live_checks=$(printf '%s' "$ruleset_json" | jq -r '
    [.rules[]
        | select(.type == "required_status_checks")
        | .parameters.required_status_checks[]
        | if has("integration_id") and (.integration_id != null)
          then "\(.context) @\(.integration_id)"
          else .context
          end
    ] | sort[]
') || { echo "error: failed to parse ruleset $ruleset_id" >&2; exit 2; }

manifest_checks=$(sed -E 's/#.*$//' "$MANIFEST" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | grep -v '^$' | sort) \
    || { echo "error: failed to parse manifest $MANIFEST" >&2; exit 2; }

live_only=$(comm -23 <(printf '%s\n' "$live_checks") <(printf '%s\n' "$manifest_checks"))
manifest_only=$(comm -13 <(printf '%s\n' "$live_checks") <(printf '%s\n' "$manifest_checks"))

if [ -z "$live_only" ] && [ -z "$manifest_only" ]; then
    echo "OK: required_status_checks matches $MANIFEST"
    exit 0
fi

echo "Required status checks have drifted from $MANIFEST:"
echo
echo "Required live but not in the manifest:"
if [ -n "$live_only" ]; then
    printf '  %s\n' "$live_only"
else
    echo "  (none)"
fi
echo
echo "In the manifest but not required live:"
if [ -n "$manifest_only" ]; then
    printf '  %s\n' "$manifest_only"
else
    echo "  (none)"
fi
exit 1
