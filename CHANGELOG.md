# Changelog

All notable changes to the Poetic framework are recorded here.
Patch-level fixes and routine documentation updates are omitted unless they
affect behaviour visible to poem authors or site publishers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Metadata section** — `.poem` files may end with a new `====`-delimited
  Metadata section holding directives and labels, one per line. See
  `docs/POEM-SYNTAX.md` for full syntax.
- **Labels** — a poem's labels are displayed with the poem on the generated
  site (both the poem's own page and its index card).
- Poem labels are attached as Blogger post labels on sync, reconciled in full
  against each post's existing labels; a label containing a comma is not sent
  to Blogger, since Blogger uses commas to separate labels.
- **Directives** are parsed and preserved in the poem's data for future use;
  no directive behaviour is defined yet.

## [2.2.3] — 2026-07-05

### Fixed

- CI/deployment workflows now use actions and a Node.js version that target
  the current Node 24 Actions runtime, instead of the deprecated Node 20 one
  (`actions/checkout`, `actions/setup-node`, `actions/configure-pages`,
  `actions/upload-pages-artifact`, `actions/deploy-pages` bumped to their
  latest majors; build/sync Node.js version bumped from the EOL 18 to 22).
  Consumer repos deploying to GitHub Pages were seeing deprecation warnings
  and at least one outright deploy failure caused by the forced runtime
  switch.

## [2.2.2] — 2026-07-05

### Fixed

- All-poems text filter: matching lyrics no longer fuses adjacent lines into
  one word at a `<br>` boundary (e.g. "cavernous" followed by "Now" on the
  next line reading as "cavernousNow" — a false-positive match for "snow").
  Line breaks are now normalised to spaces before the poem body is searched.

## [2.2.1] — 2026-07-05

### Fixed

- Home page title filter: the search input is now wired even when the filter
  bar is already present in the page, so filtering works on freshly built
  (default-template) `index.html` pages and not only on self-healed ones.

## [2.2.0] — 2026-07-05

### Added

- The home page (`index.html`) now has a live title filter above the poem grid —
  typing narrows the visible poem cards to matching titles.
- The all-poems page (`all-poems.html`) now has a filter bar with a text search,
  a two-LED scope control (search titles, lyrics, or both — both by default),
  and an earliest/latest date-range filter. The filters combine, and hidden
  poems are also hidden from the table of contents.

### Fixed

- The `index.html` self-heal now replaces the whole managed render block in one
  idempotent step, so repeated builds no longer accumulate duplicate copies of
  the poem-grid helper functions.

## [2.1.0] — 2026-07-05

### Added

- The home page (`index.html`) now shows each poem's date under its title,
  formatted in the visitor's browser locale (long month name, no weekday) —
  e.g. "4 May 2015" or "May 4, 2015" depending on locale.

## [2.0.1] — 2026-07-05

### Fixed

- `sync-blogger.js` no longer runs its removal pass when `--only <slug>` is set.
  A filtered run only populates the "current" set with the targeted poem, so the
  removal pass previously treated every other managed post as removed and
  drafted (or deleted) them. Removals are now computed on full syncs only.

## [2.0.0] — 2026-07-05

### Changed

- The URL slug is now taken from the source filename stem (the `.poem` basename) instead of
  the `title`. Two poems sharing a title no longer overwrite each other — each gets its own
  `public/<stem>/` page, `public/<stem>.html` redirect, index/all-poems links, and
  `raw/<stem>` file. The build now fails if two sources resolve to the same slug. Collections
  whose filenames already match `slugify(title)` see no URL change; where a filename differs
  from `slugify(title)`, that poem's URL and `raw/` filename change to match the filename.
- Blogger posts are now published at 00:00 GMT of the poem's date (was 12:00) and are
  identified by slug, so same-titled poems become separate posts. New Blogger posts receive
  a date-stamped permalink (the day is prepended to the title at creation, then removed) —
  e.g. `/1998/01/18-my-shepherd.html`; existing posts keep their permalinks.

## [1.1.2] — 2026-07-04

### Fixed

- The `.hidden` utility now forces `display: none !important`, so elements
  hidden via JavaScript actually disappear even when another rule sets their
  `display`. The postscript "See more"/"See less" toggle set its own
  `display: inline-block` in a later, equal-specificity rule, which overrode
  `.hidden` on source order; the toggle therefore stayed visible even when the
  runtime gate suppressed it, so it appeared on notes with nothing meaningful
  to reveal. This completes the [1.1.1] fix, whose suppression decision was
  correct but had no visual effect.

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
