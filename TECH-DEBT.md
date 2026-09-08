---
scope: PPpoet
---

# Tech debt

Tech debt in the Poetic framework is filed as GitHub issues labelled
`pw::type:tech-debt`, resolved by closing the issue with a real closing
keyword (e.g. `Fixes #<n>`) in the pull request that fixes it, alongside a
`td-record` block in that pull request's body — the squash-merge commit
then carries the record into `main`'s own immutable history.

`tech-debt/` is a **frozen historical archive**: every record this
repository ever allocated under its `PPpoet` scope while debt was tracked
as a per-item register, before that policy changed. Its files are never
edited, deleted, or renamed — `git log --follow tech-debt/<id>.md` remains
each one's audit trail, and `scripts/get-tech-debt-record.pl` still
resolves an ID (or ID segment) against it. The frozen format, ID grammar
and scope-code registry are documented in
[docs/TECH-DEBT-REGISTER.md](docs/TECH-DEBT-REGISTER.md).
