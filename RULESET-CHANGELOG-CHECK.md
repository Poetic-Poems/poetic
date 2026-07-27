# Branch Protection Ruleset Update: Add changelog-check

## Summary
The `changelog-check` status check has been added to the branch protection ruleset as a required status check for the default branch (`main`).

## Ruleset ID
18226786

## Change Made
Added `changelog-check` to the `required_status_checks` list in the ruleset, making it a merge gate alongside:
- build
- commit-format
- Analyze (javascript-typescript)
- Analyze (actions)

## Why
The `changelog-check` job in `.github/workflows/release.yml` enforces that version bumps in `package.json` are paired with corresponding `CHANGELOG.md` entries. This change makes that check a merge requirement, preventing accidental releases without proper changelog documentation.

## Verification
Verify the change with:
```bash
gh api repos/Poetic-Poems/poetic/rulesets/18226786 \
  --jq '.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks'
```
