---
name: framework-change
description: >-
  Shorthand for requesting a change to the poetic framework (provider) that must
  land in one or more consumer repos (e.g. fragments-and-unity) via
  scripts/sync-framework.sh. Use when the user invokes /framework-change, or says
  a change is "a poetic/framework change", "belongs upstream", or should be
  "pushed down to" a consumer repo.
---

# Framework change (provider → consumer)

Parse `/framework-change <description>`. `<description>` is the change to make,
in the poetic framework's own terms (not the consumer's).

## Repo roles

- **Provider**: the `poetic` repo (path varies by workspace; look for a repo
  named `poetic` or containing `src/tools/`, `src/templates/`, `scripts/`,
  `editors/` at its root — these are the framework-owned directories).
- **Consumer(s)**: any other repo open in the workspace with a
  `.poetic-version` file and `scripts/sync-framework.sh`. There may be more
  than one consumer in the workspace — apply the sync to all of them, not just
  the first one found.

Do not confuse the two: implement the change itself only in the provider repo.
Never hand-edit framework-owned paths inside a consumer repo — the consumer's
own CLAUDE.md says as much, and syncing would overwrite hand edits anyway.

## Workflow

1. **Implement** the change in the provider (`poetic`) repo, following that
   repo's own conventions (read its CLAUDE.md if present).
2. **Test/build** inside the provider repo if it has a build/test step for the
   changed area.
3. **Changelog and version.** Consider whether the change warrants an entry in
   the provider's `CHANGELOG.md` (behaviour visible to poem authors or site
   publishers — not routine docs/patch fixes, per the file's own header) under
   `[Unreleased]`, and whether it's appropriate to bump the semver tag (per
   `semver.org`: major/minor/patch based on the change's impact). Do not bump
   or tag without confirming with the user first — versioning is a
   provider-wide, externally-visible decision.
4. **Commit** the change in the provider repo (do not push yet).
5. **Confirm before pushing.** Pushing to `poetic`'s remote is a shared,
   externally-visible action — surface the commit and ask before running
   `git push`, per standard push-confirmation practice. This applies even if
   step 7 (sync) was pre-approved, since push and sync are separable actions.
6. **Push** the provider commit to its remote once confirmed. Consumers sync
   from the GitHub remote (`warwickallen/poetic.git`), not from a local
   checkout, so the push must land before syncing will see the change.
7. **Sync down** into each consumer repo:
   ```bash
   ./scripts/sync-framework.sh --ref main
   ```
   (or `./scripts/setup-linux.sh ./scripts/sync-framework.sh --ref main` on
   WSL/Linux if the consumer's CLAUDE.md calls for the wrapper). The script
   stages the changes and, before exiting, prints a suggested commit subject
   (`chore: sync framework from poetic <ref>`) and, if there were upstream
   commits since the last sync, a body summarizing them — this is the message
   to use in step 9, not one composed from scratch. (The script also accepts
   `--commit` to commit with that same message itself, but run it without
   that flag here so step 8's verification happens on the staged diff first.)
8. **Verify** the sync in each consumer: run its build (e.g. `npm run build`)
   and check `git diff --staged` looks like the expected framework change plus
   an updated `.poetic-version`, nothing else.
9. **Commit the consumer changes automatically** — no need to stop for
   confirmation first, since the sync is a mechanical, reviewable diff and
   the user has already approved this workflow via `/framework-change`. Reuse
   the exact subject/body the sync script printed in step 7 rather than
   writing a new message.
10. **Never push consumer changes.** Leave each consumer commit local and
    report it to the user — pushing to a consumer's remote is a separate,
    shared action the user must trigger themselves, regardless of how step 7
    (sync) or step 9 (commit) were approved.

## Notes

- If a consumer's `.poetic-config` lists the changed path under `skip_paths`,
  the sync will leave it untouched — flag this to the user rather than editing
  around it.
- If multiple consumers are open in the workspace, do steps 7–10 for each one
  and summarize per-repo results together at the end, not interleaved.
