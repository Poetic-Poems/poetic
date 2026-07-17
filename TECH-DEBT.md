# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated. Once an issue has been resolved, remove
its `## <id> <title>` section below — but never remove its row from the
Ledger table at the bottom of this file; see "Ledger" below.

Format:
```
## <id> <short title>

A description of what, why it matters, where, and a suggested fix.

```
Where `<id>` is a literal "TD" then the date followed by a zero-padded
sequential number (starting at 1 for the the first entry of a day). I.e.:
**TD*YYMMDDNN***. `NN` is one more than the highest `NN` already used for
that date **in the Ledger table**, not just what's currently visible above
it — a resolved entry's body is removed, but its Ledger row stays forever,
so the Ledger (not memory or scrollback) is the source of truth for the next
free ID. Compute it with `scripts/next-tech-debt-id.pl` rather than counting
by hand.

## Claiming an item

Before starting work on an open item, confirm nobody else already has:
check its Ledger row is `open` (not `in-progress`), and skim open pull
requests for its ID. Then:

1. Flip its Ledger row's Status to `in-progress`.
2. Push a branch and open a **draft** pull request right away — before the
   fix is finished — so `gh pr list` shows it's claimed. The first commit
   can be the Ledger status flip itself.
3. Do the work, pushing further commits to the same branch/PR.
4. Once verified, flip the Ledger row to `resolved` (fill in `Resolved` and
   `Ref`), remove the entry's `## <id>` section, and mark the PR ready for
   review.

If a claim is abandoned (the draft PR is closed without merging), flip the
row back to `open`.

## Review provenance

Where an item was filed from a project review's recommendation, record the
mapping here, and add the row when the item is filed — not when it is
resolved. A review's recommendations and this register are two channels onto
the same work, and the autonomous pipeline's Co-Ordinator uses exactly this
cross-reference to tell that they are: it skips a recommendation whose `R-NN`
is named in this file, on the grounds that this curated, status-tracked
channel owns it. Without the mapping it has only one other way to know a
recommendation is done — a merged PR referencing it — so work that landed as a
direct commit reads as outstanding forever, and the recommendation is selected
and re-investigated every cycle.

Only record a mapping once the Ledger item is known to cover the
recommendation's whole *Intended end state*. A recommendation that is broader
than the item mirroring it keeps the remainder in the review channel, where it
is still visible; claiming it here would silently retire work nobody has done.

| Review | Recommendation | Ledger ID |
|--------|----------------|-----------|
| [project-review-2026-07-11](reviews/project-review-2026-07-11/) | R-01 — Add a licence | TD26071101 |
| [project-review-2026-07-11](reviews/project-review-2026-07-11/) | R-06 — Complete package.json metadata | TD26071106 |

## TD26071701 blogger-auth cannot overwrite a read-only credentials file

`blogger-auth.js` saves the minted token with
`fs.writeFileSync(CREDENTIALS_FILE, …, { mode: 0o600 })`. A `mode` option only
applies when the file is *created*; against an existing file it is ignored and
the open is checked against the on-disk permissions. So if
`.blogger-credentials.json` is read-only (`0400`), the re-mint fails with
`EACCES: permission denied` and the whole flow is lost after the user has
already completed the browser consent step.

This matters because a `0400` credentials file is a reasonable thing for a
security-minded user to do deliberately — the file holds a refresh token with
full blog write access — and re-minting is not rare: a Google OAuth consent
screen left in Testing status expires refresh tokens every 7 days. The failure
is also badly timed, arriving after consent rather than before, and the message
points at permissions without saying that deleting the file is the fix.

Suggested fix: in the save path, write to a temp file in the same directory
with mode `0600` and `fs.renameSync` it over the target, so the existing file's
mode cannot block the write and the replacement is atomic (no truncated
credentials file if the process dies mid-write). Failing that, `chmod` the
target to `0600` before writing when it already exists. Either way, the mode of
the resulting file should still end up `0600`.

Reported 2026-07-17 against v6.0.1, hit on a real re-mint in the
fragments-and-unity consumer.

## Ledger

Every tech-debt ID ever allocated — open, in-progress, resolved, or not-debt —
is listed here forever, in ID order. This is what makes numbering unambiguous:
the next free ID for a given date is one more than the highest `NN` seen
below for that date, regardless of whether the corresponding entry still has
a body above.

A row can also close as `not-debt`: the item was filed here but turned out, on
reflection, not to be a deferred cost at all (e.g. deliberately reserved
syntax awaiting a future feature). Its `## <id>` section is removed like a
resolved one, but nothing was fixed, so the `Resolved` column stays blank; the
`Ref` column instead points to wherever the content moved.

| ID | Title | Status | Resolved | Ref |
|----|-------|--------|----------|-----|
| TD26070801 | `npm test` is not run in CI | resolved | 2026-07-09 | 1ebf92a |
| TD26070802 | `poem.vim` title/end-marker highlighting quirks | resolved | 2026-07-09 | 6e5683a |
| TD26070803 | `sync-framework.sh` `is_skipped` breaks on bash < 4.4 | resolved | 2026-07-09 | 4f0ecd6 |
| TD26071001 | Accept a full mega.nz/file/... share URL for the Mega handler | resolved | 2026-07-10 | 466f98b |
| TD26071002 | Per-handler override of the embed iframe allow / allowfullscreen | resolved | 2026-07-11 | 30643d5 |
| TD26071003 | vim-syntax golden no longer pins the analysis-section markdown | resolved | 2026-07-11 | 55863e5 |
| TD26071101 | No licence | resolved | 2026-07-11 | c5d7825 |
| TD26071102 | Site name "Fragments & Unity" hard-coded in generators | resolved | 2026-07-11 | f155057 |
| TD26071103 | Poem conversion failures do not fail the build | resolved | 2026-07-11 | 48eb62c |
| TD26071104 | blogger-auth and sync-blogger disagree on the credentials-file format | resolved | 2026-07-11 | f8f9500 |
| TD26071105 | Embedded client JS is untested and unlintable | resolved | 2026-07-11 | e105d2a |
| TD26071106 | package.json lacks name, version, license, engines | resolved | 2026-07-11 | c5d7825 |
| TD26071107 | sync-framework.sh never deletes upstream-removed files; dead tools ship | resolved | 2026-07-11 | 94e650f |
| TD26071108 | No linter; commit-format check is opt-in only | resolved | 2026-07-11 | cf0bf26 |
| TD26071109 | js-yaml stuck on v4; v5 changes timestamp-quoting for edge-case date strings | resolved | 2026-07-11 | 7c4c29a |
| TD26071110 | build-check-fallback.yml's path list is a hand-maintained mirror | resolved | 2026-07-11 | #10 |
| TD26071111 | Incremental-rebuild dependency tracking is approximate | resolved | 2026-07-12 | #14 |
| TD26071201 | `\?` escape prefix is reserved but not yet implemented | not-debt | | docs/POEM-SYNTAX.md |
| TD26071202 | Preamble grammar omits comment blocks despite the prose | resolved | 2026-07-12 | #24 |
| TD26071301 | Browser renderer is not yet packaged for consumption | resolved | 2026-07-13 | #33 |
| TD26071302 | Aggregate (index + all-poems) renderers are not browser-safe | resolved | 2026-07-13 | #34 |
| TD26071501 | yaml-to-poem entity decoding is order-fragile, not structurally single-pass | resolved | 2026-07-15 | #47 |
| TD26071502 | convertMarkup's escape-restoration loop is quadratic in the number of escapes | resolved | 2026-07-15 | #49 |
| TD26071701 | blogger-auth cannot overwrite a read-only credentials file | open | | |
