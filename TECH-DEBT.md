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
