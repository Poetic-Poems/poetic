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

## TD26071501 yaml-to-poem entity decoding is order-fragile, not structurally single-pass

`convertEntitiesToMarkup` in `src/tools/yaml-to-poem.js` decodes HTML entities
as a sequence of independent `String.prototype.replace` passes whose
correctness depends on their relative order: `&#38;` must run strictly last so
the `&` it emits can't recombine into an entity a later pass re-decodes (the
`js/double-escaping` fix in #38). That is correct today but fragile — adding a
new entity replace, or any other decode that emits a `&`, can silently
reintroduce double-decoding. Suggested fix: replace the ordered passes with a
single non-overlapping pass — one regex alternation over all handled entities
resolved via a replacement function or lookup map — so the output is immune to
ordering by construction. A code comment at the `&#38;` replace references this
entry. Filed 2026-07-15.

## TD26071502 convertMarkup's escape-restoration loop is quadratic in the number of escapes

`convertMarkup` in `src/tools/poem-parser.js` collects escaped characters into
a `Map` keyed by a unique placeholder, then restores them with
`text = text.replace(placeholder, char)` inside a `for...of` loop over the
map — one non-global `String.prototype.replace` call per escape, each of
which rescans the (still placeholder-laden) string from the start to find
its target substring. With `N` escapes in a text of length proportional to
`N`, that's `O(N)` rescans of an `O(N)`-length string: `O(N^2)` overall.
Empirically, a run of 50,000 escaped backslashes (100,000 raw backslash
characters) takes ~900ms; scaling to 200,000 escapes would take on the order
of tens of seconds. Not a CodeQL-flagged regex issue (no backtracking regex is involved) so it
wasn't part of `js/polynomial-redos` code-scanning alerts 11/12/13 (directive
lines, label lines, and the `\?` reserved-escape scan), but it's the same
class of problem — quadratic cost driven by adversarial input size — noticed
while adding a regression test for alert 13 that had to be restructured to
call `checkReservedEscape()` directly instead of the full `convertMarkup()`
pipeline to avoid tripping over this. Suggested
fix: build the restored string in one pass (e.g. split on the placeholder
pattern with a single regex and rejoin, or track escape positions and splice
once) instead of one `replace` per escape.

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
| TD26071501 | yaml-to-poem entity decoding is order-fragile, not structurally single-pass | in-progress | | |
| TD26071502 | convertMarkup's escape-restoration loop is quadratic in the number of escapes | open | | |
