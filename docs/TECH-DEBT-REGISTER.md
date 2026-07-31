# Tech-debt register — per-item format and scope-code registry

The tech-debt tooling (`scripts/get-tech-debt-record.pl`,
`scripts/next-tech-debt-id.pl`, `scripts/td-check.pl`) supports two register
formats and detects which one a repository uses by the presence of a
`tech-debt/` directory:

- **Per-item format** (this document): one file per item under `tech-debt/`,
  with the root `TECH-DEBT.md` holding only policy — the format pointer, the
  "Claiming an item" workflow, and the repository's declared scope.
- **Legacy format**: a single `TECH-DEBT.md` holding `### <id> <title>`
  sections under `## Current Items` plus an append-only `## Ledger` table.
  Repositories still on this format migrate to the per-item format; the
  tooling's legacy support exists for that transition.

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
legacy-id: TD26072424         # only on items migrated from the legacy format
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
migrated from the legacy format after they were already resolved have empty
bodies (the legacy convention deleted prose on resolution).

Lifecycle edits are frontmatter-only: claiming flips `status:` to
`in-progress` (on the `td/<id>` claim branch, per the "Claiming an item"
workflow in `TECH-DEBT.md`); resolving flips it to `resolved` and fills
`resolved:` and `ref:`. Re-opening debt means filing a new item that
references the old one, never flipping a resolved item back.

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
- Allocate with `scripts/next-tech-debt-id.pl --ref origin/main` (after a
  `git fetch origin`). It cannot see IDs allocated on unmerged branches, so
  also skim open pull requests and `td/*` branches when filing. If two PRs
  do allocate the same ID, they collide on the filename and git surfaces it;
  the later PR renames to the next `NN`.
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

## Derived views

Any aggregated view of the register (a Ledger-style table, a dashboard
tally) is **generated on demand and never committed** — a committed
generated view would reintroduce exactly the merge conflicts the per-item
format removes.

## Consistency gate

`perl scripts/td-check.pl` (also `npm run check:td-register`) validates the
register in either format and runs on every pull request via
`.github/workflows/tech-debt-register.yml`, alongside the deletion guard
(no `tech-debt/` file may be deleted or renamed once on `main`) and the
regression guard (no `### TD` item sections may reappear in `TECH-DEBT.md`
once the per-item register exists).
