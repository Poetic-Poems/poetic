# Tech-debt register — per-item format and scope-code registry

The tech-debt register is per-item: one file per item under `tech-debt/`,
with the root `TECH-DEBT.md` holding only policy — the format pointer, the
"Claiming an item" workflow, and the repository's declared scope. The
tooling (listed in `scripts/td-tooling-manifest`, see "Tooling manifest for
consumers" below) recognises a register by the `tech-debt/` directory — or,
for a register that has not yet filed its first item (git cannot commit an
empty directory), by the `scope:` declaration in `TECH-DEBT.md`'s
frontmatter, so allocation is scoped from the very first item.

The per-item format exists because a single shared register file makes
concurrent work on *adjacent* items collide: resolving an item edited both a
Ledger row and a Current Items section, so two PRs resolving neighbouring
items conflicted even though the items were unrelated. With one file per
item, PRs on different items touch different files and cannot textually
conflict; the only same-file race left is two agents on the *same* item,
which the `td/<id>` claim-branch lock already prevents.

## Layout

```
TECH-DEBT.md                    ← policy only; frontmatter declares the scope
tech-debt/
  TD-PPpoet-26070801.md         ← one file per ID ever allocated, forever
  TD-PPpoet-26072424.md
```

`tech-debt/` is an **append-only set**: files are added when items are filed
and edited when their status changes, but never deleted or renamed once on
`main` — that is the permanent-Ledger guarantee (IDs are never reused), and
CI enforces it. Files not yet on `main` may still be renamed, e.g. to
resolve an ID-allocation collision inside a PR.

## Item file

```markdown
---
id: TD-PPpoet-26072424        # equals the filename stem
legacy-id: TD26072424         # only on items migrated from the old format
title: One-line summary of the debt
status: open                  # open | in-progress | resolved | not-debt
filed: 2026-07-24             # date matching the ID's YYMMDD
review: project-review-2026-07-23 R-22 F-ARCH-01   # optional provenance
resolved:                     # date — filled when status becomes resolved
ref:                          # PR number/commit — filled on resolution; for
                              # not-debt, where the content moved instead
---

Free-prose description: what, why it matters, where, and a suggested fix.
```

The body **stays when the item is resolved** — the file becomes the item's
permanent record (description, provenance, resolution date and reference),
and `git log --follow` on it is the item's audit trail. A resolved item is
history, like a `CHANGELOG.md` entry, not living documentation. Items
migrated from the earlier single-file register after they were already
resolved have empty bodies (that register's convention deleted prose on
resolution).

Lifecycle edits are frontmatter-only: claiming flips `status:` to
`in-progress` (on the `td/<id>` claim branch, per the "Claiming an item"
workflow in `TECH-DEBT.md`); resolving flips it to `resolved` and fills
`resolved:` and `ref:`. Re-opening debt means filing a new item that
references the old one, never flipping a resolved item back.

An open item's **body is append-only**: newly-learned detail — a
`Referenced from:` note, a second occurrence, a `Correction:` line
superseding a stale path — is added by appending text, never by editing
what is already there, so nothing that was ever on `main` silently
changes. Rewriting existing text requires the `status:` field to move in
the same change; the "Consistency gate" below enforces this.

## IDs

```
TD-<ORG><repo>-<YYMMDD><NN>         e.g. TD-PPpoet-26072424
regex:  TD-[A-Z0-9]{2}[a-z0-9]{4}-[0-9]{6}[0-9a-z][0-9]
```

- `<ORG>` is exactly two characters of `[A-Z0-9]`; `<repo>` exactly four of
  `[a-z0-9]` — fixed widths, so the ID parses positionally. Together they
  form the repository's **scope**, declared once as `scope:` in
  `TECH-DEBT.md`'s frontmatter. The scope makes IDs unique across every
  repository with no cross-repo coordination when filing.
- `<NN>` is the per-day sequence: `01`–`99`, then `a0`–`a9` … `z9`, never
  `00`. ASCII digits sort before lowercase letters, so alphanumeric order
  equals allocation order. Past `z9` the allocator refuses: 360 items in one
  day means something else has gone seriously wrong.
- Allocate with `scripts/reserve-tech-debt-id.pl`, which reserves the ID
  atomically: it fetches `origin/main` itself, computes a candidate `NN` from
  the register committed there plus any `td/*` branches already on `origin`,
  and pushes a `td/<id>` branch from `origin/main` to claim it — the same
  race-safe lock "Claiming an item" (`TECH-DEBT.md`) uses to work an existing
  item. A rejected push means another writer got that `NN`; the script
  retries the next one itself until one succeeds, so — unlike scanning
  filenames alone — there is no separate collision to check for by hand.
  `scripts/next-tech-debt-id.pl --ref origin/main` remains available as a
  read-only preview of the next `NN` (e.g. for tooling that only wants to
  display it), but does not reserve anything itself.
- Scope codes are **allocation-time namespaces, not live pointers**: a
  renamed or split repository keeps its code on existing items; a new
  repository registers a new code.

## Scope-code registry

Org codes, and repo codes for Poetic-Poems repositories, are recorded here.
Other orgs record their own repo codes in their governance home (Artist-OS:
`RepositoryGovernanceStandard.md` in artistos-governance).

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

## Derived views

Any aggregated view of the register (a Ledger-style table, a dashboard
tally) is **generated on demand and never committed** — a committed
generated view would reintroduce exactly the merge conflicts the per-item
format removes.

## Tooling manifest for consumers

`scripts/td-tooling-manifest` lists, one repo-relative path per line, the
scripts that implement this register. It is the source of truth for which
files a sibling repository's byte-identical copies must track — read the
file itself for the current list rather than duplicating it here.

A consumer repository's own drift-check workflow (`td-tooling-drift.yml`)
fetches this manifest from poetic `main` and iterates it, instead of
hard-coding the file list in its own workflow YAML:

```bash
manifest=$(curl -fsSL \
  https://raw.githubusercontent.com/Poetic-Poems/poetic/main/scripts/td-tooling-manifest)
while IFS= read -r f; do
  [ -n "$f" ] || continue
  diff <(curl -fsSL "https://raw.githubusercontent.com/Poetic-Poems/poetic/main/$f") "$f" \
    || echo "::error::$f has drifted from poetic main"
done <<< "$manifest"
```

Adding or removing a canonical script updates this manifest in the same
change, so every consumer's drift check picks up the addition or removal
the next time it runs, before any consumer has mirrored the file itself.

## Consistency gate

`perl scripts/td-check.pl` (also `npm run check:td-register`) validates the
register and runs on every pull request via
`.github/workflows/tech-debt-register.yml`, alongside the deletion guard
(no `tech-debt/` file may be deleted or renamed once on `main`), the
open-item-rewrite guard (`scripts/check-tech-debt-open-rewrites.pl` — an
open item's body is append-only: no PR may rewrite its existing text
without moving its `status:` field, though appending new text — a
`Referenced from:` note, a correction line, a newly-learned detail — is
always allowed, since a rewrite of existing text on an item that stays
`open` is either a stale writer overwriting an already-merged record or a
policy breach), and the regression guard (no `### TD` item sections may
reappear in `TECH-DEBT.md` once the per-item register exists).

This gate only checks the register's own internal consistency — it has no
access to live GitHub state, so an item describing an external fact (a
branch ruleset, a repo setting, anything outside this repository's tracked
files) can go stale silently if that fact changes out-of-band, e.g. a
maintainer changing a setting in the GitHub UI without updating the item
that described it. There is no automated check for this drift; catch it
with a periodic manual review instead: for every open or in-progress item
whose subject is a live GitHub setting, re-verify it against the API (for a
branch ruleset, `gh api repos/<org>/<repo>/rulesets/<id> --jq '...'`) and
correct the item's `status:` if reality has moved on. A recurring
project review is a natural point to run this check.
