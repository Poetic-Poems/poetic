Poetic v6.0.1

Release date: 2026-07-13

Summary

Patch release containing small feature additions, a workflow fix, and documentation updates.

Added

- Browser-safe aggregate renderers: `renderAllPoems` / `renderIndex` (commit 81f8ce7)
- Expose browser renderer via `package.json` exports (commit c541ae2)
- `scripts/new-poem` scaffolding command (commit 3ad2c5d)
- `LICENCE-POEMS.md` added (commit 115b153)

Fixed

- `sync-framework.sh` now uses an optional `SYNC_PAT` for workflow-file pushes to avoid failing PRs (commit 0ca7c9f)

Commits included

115b153 docs: add LICENCE-POEMS.md (#35) (Warwick Allen)
81f8ce7 feat(renderer): add browser-safe aggregate renderers (#34) (Warwick Allen)
c541ae2 feat(package): expose browser renderer via exports map (TD26071301) (#33) (Warwick Allen)
67e9487 docs: keep feature branches short and PRs ready when self-contained (#32) (Warwick Allen)
b204140 feat(renderer): add browser-safe renderPoem/renderPoemPage (M0) (#31) (Warwick Allen)
0ca7c9f fix(sync-framework): use SYNC_PAT for workflow-file pushes (#30) (Warwick Allen)
3ad2c5d feat(scripts): add new-poem to scaffold a poem in one command (#29) (Warwick Allen)
