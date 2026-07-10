# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated. Once an issue has been resolved, remove
its entry.

Format:
```
## <id> <short title>

A description of what, why it matters, where, and a suggested fix.

```
Where `<id>` is a literal "TD" then the date followed by a zero-padded
sequential number (starting at 1 for the the first entry of a day). I.e.:
**TD*YYMMDDNN***

## TD26071001 Accept a full mega.nz/file/... share URL for the Mega handler

The builtin `mega` song handler currently accepts only the identifier form of a
MEGA link — the `<id>#<key>` fragment after `mega.nz/file/` — which the author
must extract by hand. Accepting a pasted full share URL
(`https://mega.nz/file/<id>#<key>`) and auto-rewriting `file` → `embed` would be
friendlier. This needs a per-handler value-rewrite capability in
`src/tools/song-handlers.js` (the embed URL template can only substitute a
value, not transform it). Deferred; the identifier form is the v1 contract.

## TD26071002 Per-handler override of the embed iframe allow / allowfullscreen

`public/poetic.js` sets a single global `allow="autoplay; fullscreen;
picture-in-picture; encrypted-media"` + `allowfullscreen` on every lazy-loaded
embed iframe. A service needing a narrower or wider permission set has no way to
override it. A future enhancement could let a handler declare its own `allow` /
`allowfullscreen` (surfaced via `data-*` on the button and read by the loader).
Deferred; the global default is sufficient for the current builtins.

## TD26071003 vim-syntax golden no longer pins the analysis-section markdown

`test/fixtures/dump-syntax.vim` folds every builtin `markdown*` highlight group
into `poemAnalysis` so the golden (`test/golden/_example.vim-syntax.txt`) is
independent of the installed Vim's bundled `markdown.vim`, whose group names and
run boundaries drift across Vim versions (this is what left the golden test red
in CI — the golden was generated on Vim 8.2 but CI runs Vim 9.1). The trade-off
is that the golden no longer regression-tests that poem.vim actually delegates
analysis prose to markdown highlighting — a broken `contains=@markdown` wiring
would still fold to `poemAnalysis` and pass. A future enhancement could add a
separate, version-tolerant smoke check (e.g. assert the raw, unfolded dump
contains at least one `markdown*` group somewhere in the analysis section)
without pinning exact groups or boundaries. Referenced from the fold comment in
`test/fixtures/dump-syntax.vim`.

