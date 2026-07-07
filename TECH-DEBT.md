# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format: a dated `## <short title>` describing what, why it matters, where, and a
suggested fix.

## 2026-07-07 — `serve-static.js`'s live `/all-poems` route has no footer

`src/tools/serve-static.js` reimplements `all-poems.html` generation in its own
`concatenateAllHtmlFiles()` for the dev-server `/all-poems` endpoint, instead of
reusing `src/tools/build-all-poems.js`. That pre-existing duplicate already
diverges from the real build (no favicon/subtitle sync), and now also omits the
footer added by `src/tools/footer.js`. Low priority: the actual built
`all-poems.html` (served as a static file, and what GitHub Pages publishes)
does get the footer; only the special live in-memory route does not. Fix by
having the dev server reuse `build-all-poems.js`'s `concatenateAllHtmlFiles`
directly instead of its own copy.

## 2026-07-07 — `sync-framework.sh` fails silently on any tag conflict

`scripts/sync-framework.sh` runs `git fetch "$POETIC_REMOTE" --tags --quiet`
under `set -euo pipefail`. If a consumer's locally-cached copy of any poetic
tag (e.g. `v3.1.0`) points at a different commit than the same tag now does
upstream, git rejects the tag update ("would clobber existing tag") and the
fetch exits non-zero. `--quiet` suppresses the rejection message entirely, and
`set -e` then aborts the script right after it prints "Fetching from
poetic..." — with no error shown at all. The branch/ref the caller actually
asked to sync (e.g. `--ref feat/footer`) is silently never resolved or checked
out, and `git status` in the consumer repo shows nothing changed, giving no
clue what went wrong. Hit in practice (2026-07-07) via `fragments-and-unity`,
whose cached tags predated an upstream tag cleanup. Fix by either dropping
`--quiet` from that fetch (so rejections are visible) or adding `--force` to
the tags fetch (consumers never own these tags, so upstream should always
win), and by not building on top of `--quiet` combined with `set -e` for any
step whose failure should be diagnosable.
