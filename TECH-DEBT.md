# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format:
```
## <id> <short title>

A description of what, why it matters, where, and a suggested fix.

```
Where `<id>` is a literal "TD" then the date followed by a zero-padded
sequential number (starting at 1 for the the first entry of a day). I.e.:
**TD*YYMMDDNN***

## TD26070801 `npm test` is not run in CI

`.github/workflows/build-poems.yml` runs `npm run check`, `npm run build`,
and `npm run check:build`, but never `npm test`. All tests under `test/`
(including `test/vim-syntax.test.js`) only run locally/on request — a
regression can land on `main` without any test failing in CI. Fix: add an
`npm test` step to `build-poems.yml`; if `test/vim-syntax.test.js` should
actually run there rather than skip, also install `vim` on the runner (e.g.
`apt-get install -y vim`) rather than relying on it being preinstalled on the
`ubuntu-latest` image.

## TD26070802 `poem.vim` title/end-marker highlighting quirks

Discovered while building `test/vim-syntax.test.js`'s golden fixture from
`src/poems/poem/_example.poem`:

- `poemTitle` is defined as `\%1l.*$` (`editors/vim/syntax/poem.vim:134`) —
  "whatever is on line 1" — so a poem with a preamble comment block or
  variable definitions (both supported `.poem` features) gets its title
  highlighting on the wrong line.
- The final `====` line in the analysis section is highlighted as one
  `poemEndMarkerMark` span including its trailing `# comment`, while every
  other `====  # comment` line splits into separate `poemEndMarkerMark` /
  `poemEndMarkerLineTrailing` spans.

Both are editor-cosmetic only (no effect on build output). Not fixed here —
out of scope for the test task that surfaced them.

## TD26070803 `sync-framework.sh` `is_skipped` breaks on bash < 4.4

`scripts/sync-framework.sh`'s `is_skipped` iterates `"${SKIP_PATHS[@]}"`
(`scripts/sync-framework.sh:95`) under `set -u`. When no `skip_paths` are
configured the array is empty, and bash before 4.4 treats `"${empty[@]}"` as
an unbound variable and aborts — so a consumer on an older bash (e.g. the
system bash on macOS, which ships 3.2) would fail every sync that has no
`.poetic-config.yaml`. Fine on bash 4.4+ (this repo's CI and dev machines run
5.x, and `test/sync-framework.test.js` exercises the empty-array path there).
Fix: guard the loop with `[ ${#SKIP_PATHS[@]} -eq 0 ] && return 1` before the
`for`, or initialise/expand defensively.
