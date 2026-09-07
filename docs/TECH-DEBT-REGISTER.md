# Tech-debt register — frozen archive format

Tech debt in the Poetic framework is filed as GitHub issues labelled
`pw::type:tech-debt` — see `TECH-DEBT.md` for the current policy. This
document describes `tech-debt/`, the **frozen historical archive** of the
per-item register that predates that policy: the format its files were
written in, so a reader (or `scripts/get-tech-debt-record.pl`, still used to
resolve an ID or ID segment against it) can make sense of them, and the
scope-code registry that named this repository's `PPpoet` prefix.

`tech-debt/` is an **append-only set, frozen in place**: files are never
added, edited, deleted, or renamed — CI enforces the deletion/rename guard.
A repository's own `scope:` declaration (`TECH-DEBT.md`'s frontmatter) and
the ID grammar below remain live only insofar as `scripts/get-tech-debt-record.pl`
and sibling scopes' equivalents still resolve archived IDs by them.

## Layout

```
TECH-DEBT.md                    ← current policy: debt is filed as labelled issues
tech-debt/
  TD-PPpoet-26070801.md         ← one frozen file per ID ever allocated
  TD-PPpoet-26072424.md
```

## Item file format

```markdown
---
id: TD-PPpoet-26072424        # equals the filename stem
legacy-id: TD26072424         # only on items migrated from the earlier single-file format
title: One-line summary of the debt
status: resolved               # open | in-progress | resolved | not-debt
filed: 2026-07-24               # date matching the ID's YYMMDD
review: project-review-2026-07-23 R-22 F-ARCH-01   # optional provenance
resolved: 2026-07-30
ref: 231                        # PR number/commit that resolved it; for
                                 # not-debt, where the content moved instead
---

Free-prose description: what the debt was, why it mattered, where, and how
it was resolved.
```

Every record in the archive is `status: resolved` or `status: not-debt` —
the archive was frozen only once no `open` or `in-progress` record
remained at `origin/main`. A resolved item's file is its permanent record:
the body stays, and `git log --follow` on it is the item's audit trail.
Items migrated from the earlier single-file register after they were
already resolved have empty bodies (that register's convention deleted
prose on resolution).

## IDs

```
TD-<ORG><repo>-<YYMMDD><NN>         e.g. TD-PPpoet-26072424
regex:  TD-[A-Z0-9]{2}[a-z0-9]{4}-[0-9]{6}[0-9a-z][0-9]
```

- `<ORG>` is exactly two characters of `[A-Z0-9]`; `<repo>` exactly four of
  `[a-z0-9]` — fixed widths, so the ID parses positionally. Together they
  form the repository's **scope**, declared once as `scope:` in
  `TECH-DEBT.md`'s frontmatter.
- `<NN>` was the per-day sequence: `01`–`99`, then `a0`–`a9` … `z9`, never
  `00`. ASCII digits sort before lowercase letters, so alphanumeric order
  equalled allocation order.

## Scope-code registry

Org codes, and repo codes for Poetic-Poems repositories, are recorded here
for archives across the fleet. Other orgs record their own repo codes in
their governance home (Artist-OS: `RepositoryGovernanceStandard.md` in
artistos-governance).

| Org | Code |
|-----|------|
| Artist-OS | `AO` |
| Poetic-Poems | `PP` |
| Pullwright | `PW` |
| warwick-allen | `W1` |
| warwickallen | `W2` |

| Poetic-Poems repo | Code |
|-------------------|------|
| agent-ops | `agop` |
| agent-ops-state | `agos` |
| poetic | `poet` |
| poetic-fiddle | `pfid` |
| .github | `ghub` |

| warwick-allen repo | Code |
|--------------------|------|
| fragments-and-unity | `frag` |

## Tooling manifest for consumers

`scripts/td-tooling-manifest` lists, one repo-relative path per line, the
canonical scripts that read this archive format (`scripts/get-tech-debt-record.pl`,
`scripts/next-tech-debt-id.pl`, `scripts/reserve-tech-debt-id.pl`,
`scripts/td-check.pl`, `scripts/check-tech-debt-open-rewrites.pl`). These
scripts are no longer part of `scripts/sync-framework.sh`'s synced set —
new consumer repos file debt as labelled issues from the start and never
need them — but they stay in this repository, and a sibling repository that
still holds a byte-identical copy from before this freeze can keep fetching
this manifest for its own drift check:

```bash
manifest=$(curl -fsSL \
  https://raw.githubusercontent.com/Poetic-Poems/poetic/main/scripts/td-tooling-manifest)
while IFS= read -r f; do
  [ -n "$f" ] || continue
  diff <(curl -fsSL "https://raw.githubusercontent.com/Poetic-Poems/poetic/main/$f") "$f" \
    || echo "::error::$f has drifted from poetic main"
done <<< "$manifest"
```

## Consistency gate

`.github/workflows/tech-debt-register.yml` still runs `perl scripts/td-check.pl`
(also `npm run check:td-register`) on every pull request in this
repository, guarding the frozen archive's invariants: no file in
`tech-debt/` may be deleted or renamed, and no old-format `### TD` item
section may reappear in `TECH-DEBT.md`. Its open-item-body-append-only
guard (`scripts/check-tech-debt-open-rewrites.pl`) has nothing left to
check now that every record is `resolved` or `not-debt`, and stays a
harmless no-op. This workflow is no longer part of
`scripts/sync-framework.sh`'s synced set — it protects this repository's
own frozen archive and is not something a new consumer repo needs.
