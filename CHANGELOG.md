# Changelog

All notable changes to the Poetic framework are recorded here.
Patch-level fixes and routine documentation updates are omitted unless they
affect behaviour visible to poem authors or site publishers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] — 2026-07-04

### Fixed

- The postscript "See more" preview toggle no longer appears for notes whose
  content is only a fraction of a line longer than the preview budget. The
  runtime gate (`evaluatePostscriptPreview` in `public/poetic.js`) previously
  measured hidden content with `scrollHeight`, which includes the trailing
  bottom margin of the note's last child; that margin could push the
  measured "hidden" amount past the one-line threshold even though almost no
  real text was clipped. It now measures the true content bottom from the
  last child's bounding rect, excluding that trailing margin.

## [1.1.0] — 2026-07-04

### Changed

- Block parameter **values** now follow POSIX shell-style quoting: a value may concatenate adjacent unquoted, single-quoted, and double-quoted segments; a backslash escapes the next character (with the usual double-quote handling for `"`, `\`, `$`, and `` ` ``); and `${var}` substitution applies per segment — in unquoted runs and double-quoted segments, never in single-quoted ones. An unquoted, unescaped comma, closing parenthesis, or whitespace ends a value. Output for existing poems is unchanged.

## [1.0.0] — 2026-07-04

### Added

- **Block parameters** — any brace-labelled block (version labels `{{...}}`, segment labels `{...}`, postscript labels `{...}`) may carry an optional parameter list after the closing brace(s): `{Label}(key=value, ...)`. Whitespace is flexible; keys are letters/digits/hyphens/underscores; values are quoted or unquoted with shell-style variable substitution. See `docs/POEM-SYNTAX.md` for full syntax.
- **Postscript "See more" preview** — postscript labels accept `preview` (default `true`) and `preview-lines` (default `5`) parameters. When enabled, long postscript notes are truncated to the specified line count with a "See more ⮟" / "See less ⮝" toggle; if hidden content is one line or less, preview is disabled and the note displays in full. Set `preview=false` to disable preview for a note.
- **Blogger publishing** — optional automatic publishing of poems to a Blogger blog on push to `main`, enabled per-repo via `blogger_sync=true` in `.poetic-config`. Includes a new GitHub Actions workflow (`Sync to Blogger`), the `sync:blogger` and `blogger:auth` npm scripts, JS injection into the Blogger theme template (via `npm run build:blogger`), and a setup guide at `docs/BLOGGER.md`.
- **Stale artefact warnings** — `npm run build:yaml` now warns when the YAML directory contains `.yaml` files with no corresponding active `.poem` source; `npm run build:poems` warns when `public/` contains `.html` files with no corresponding YAML source.

### Changed

- **BREAKING** — a well-formed parameter list `(...)` after a block label is now parsed as block parameters instead of ignored; previously, any trailing text after a label was ignored.
- **BREAKING** — postscript notes now truncate long content to 5 rendered lines by default with an expand/collapse toggle; set `preview=false` to disable this and display notes in full.
- `poem-to-raw.js` is now a pure shell wrapper; the outdated pure-JavaScript
  fallback has been removed.

### Fixed

- `build-all-poems.js` no longer leaves a `public/`-prefixed favicon href in
  the generated `index.html`/`all-poems.html` when `.poetic-config` sets
  `favicon=public/<file>`. The prefix is now stripped the same way
  `build-poems.js` already strips it for individual poem pages, so the
  favicon resolves both under `npm start` (which serves `public/` as the web
  root) and on GitHub Pages.

## [0.2.3] — 2026-06-29

### Fixed

- `sync-framework.sh` no longer prints commit instructions when no files were
  changed by a sync.
- `poem-to-raw.sh` now correctly expands variables defined in `.poem` files.

## [0.2.0] — 2026-06-29

### Added

- **Standalone poem pages** — each poem is built as a full styled HTML document
  at `public/<slug>/index.html`.  The old flat URL `/<slug>.html` is kept as a
  redirect stub forwarding to the new URL.
- **Shared Audiomack loader** (`public/poetic.js`) — a single delegated `click`
  listener replaces per-poem inline `loadAudiomackPlayer` functions; audio
  buttons now use `data-*` attributes instead of `onclick`.

## [0.1.0] — 2026-06-28

### Added

- Initial public release of the Poetic framework.
- **`.poem` syntax — trailing text rule**: trailing text on any line-anchored
  token (dividers `----`, end markers `====`, segment labels `{...}`, block
  comment markers `<<#` / `#>>`, literal block markers `<<<` / `>>>`, version
  labels) is explicitly ignored, enabling inline comments
  (e.g. `----  # end of first version`).
- **Build pipeline**: `.poem` → YAML → HTML via Pug template (`npm run build`).
- **`scripts/sync-framework.sh`** — pulls framework-owned files from the
  upstream `warwickallen/poetic` repo and records the synced ref in
  `.poetic-version`.
- **`.poetic-config`** — user-owned settings file supporting `favicon`,
  `subtitle`, `skip_paths`, `auto_sync`, and `sync_schedule`.
- **Scheduled auto-sync** via GitHub Actions (opt-in via `auto_sync=true` in
  `.poetic-config`).
- YAML `date` field uses ISO format (`yyyy-mm-dd`) for reliable string sorting.
- Analysis content uses blank-line paragraph separation; the build converts
  blank lines to `<p>` tags automatically, so `<p>` tags are not needed in the
  YAML source.
