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

## TD26071110 build-check-fallback.yml's path list is a hand-maintained mirror

`.github/workflows/build-check-fallback.yml`'s `paths-ignore:` list must
stay the exact complement of `build-poems.yml`'s `paths:` list, or some path
could satisfy neither workflow's trigger and the required `build` status
check would hang as "Expected" again — the same bug the fallback workflow
exists to fix. Nothing enforces the mirror; whoever edits one list has to
remember to update the other by hand. Fix: collapse both workflows into one,
with a single always-run `build` job that uses a changed-files check to
conditionally skip its real steps (no second list to drift), or add a CI/
lint step that fails when the two lists diverge. Referenced from a comment
in `build-check-fallback.yml` — remove that reference too when this is
resolved.

## TD26071111 Incremental-rebuild dependency tracking is approximate

The mtime-based rebuild skip (`src/tools/needs-rebuild.js`, wired into
`poem-to-yaml.js`, `build-poems.js`, `build-all-poems.js`, and
`poem-to-raw.js`) makes two simplifying assumptions instead of full
dependency-graph tracking. (1) A poem's `$ref` targets are assumed to be
underscore-prefixed YAML partials in the same directory
(`build-poems.js`'s `partialYamlPaths`) — a `$ref` to a non-underscore-prefixed
file is invisible to the staleness check, so editing such a file alone won't
invalidate poems that reference it. (2) A directory passed as an input (e.g.
`poemsDir` in `build-all-poems.js`, to catch poems being added/removed) relies
on the OS bumping the directory's own mtime when a direct child changes,
which isn't guaranteed on every filesystem or by every sync/copy tool. Both
are accepted trade-offs, not bugs — the correct general fix is real
dependency-graph tracking (parsing every poem's actual `$ref` targets, and/or
recording a manifest of known source files instead of relying on directory
mtimes), which is more complex than this codebase's scale currently
justifies. Revisit only if either gap causes an actual stale-build incident.
Referenced from a comment in `build-poems.js` (next to `partialYamlPaths`) —
remove that reference too when this is resolved.
