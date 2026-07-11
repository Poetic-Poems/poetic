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

## TD26071108 No linter; commit-format check is opt-in only

No ESLint/formatter config exists (vestigial `eslint-disable` comments in
`serve-static.js` reference a tool that isn't installed), and Conventional
Commits are enforced only by the opt-in local hook with no CI backstop. Fix:
add a minimal-ratchet linter + `.editorconfig` + a CI commit-format check.
(project-review-2026-07-11: F-CODE-05, F-TOOL-01, R-10.)

## TD26071109 js-yaml stuck on v4; v5 changes timestamp-quoting for edge-case date strings

Attempted bumping `js-yaml` from `^4.1.0` to `^5.2.1` (2026-07-11). `npm test`
failed one golden test: `test/golden.test.js` — `_minimal.poem matches the
golden fixture`. Root cause: `yaml.dump()` in v4 quotes any scalar string that
matches the YAML core-schema timestamp pattern (to preserve it as a string on
round-trip), but v5's timestamp-detection regex no longer treats a
zero-padded year of `0000` (e.g. `"0000-01-01"`) as a timestamp, so it dumps
unquoted (`date: 0000-01-01`) instead of quoted (`date: '0000-01-01'`) as
`test/golden/_minimal.yaml` expects. Confirmed with a standalone repro
(`yaml.dump({date: '0000-01-01'})` vs `yaml.dump({date: '2023-01-01'})`) that
real four-digit years like `2023` are unaffected — only the `_minimal.poem`
fixture's placeholder year `0000` triggers the drift, so real poem dates are
not at risk, but the golden fixture is. Only `yaml.load`/`yaml.dump` are used
in this codebase (`src/tools/{yaml-to-poem,poem-render,poetic-config,
build-all-poems,poem-to-yaml,song-handlers}.js`), so no other v5 API-removal
issue was found. Bump was reverted (`package.json`/`package-lock.json`
restored to `^4.1.0`, `node_modules` reinstalled) per task criteria requiring
`npm test` to pass. Fix: either regenerate `test/golden/_minimal.yaml` to
match v5's quoting once the bump is re-attempted (only if the project also
decides v5's narrower timestamp regex is acceptable — it changes how any
non-standard placeholder date string is serialized), or file upstream against
`js-yaml` v5's timestamp regex to confirm intent, then re-attempt the bump.
