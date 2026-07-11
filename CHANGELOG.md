# Changelog

All notable changes to the Poetic framework are recorded here.
Patch-level fixes and routine documentation updates are omitted unless they
affect behaviour visible to poem authors or site publishers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`sync-blogger.js` now finds `.yml` poems and excludes `YAML-SCHEMA*`.**
  The "list poem YAML files" filter (accept `.yaml`/`.yml`, exclude
  `YAML-SCHEMA*` and `_`-prefixed files) was duplicated across
  `build-poems.js`, `build-all-poems.js` (twice), and `sync-blogger.js`, and
  had diverged in `sync-blogger.js`: it only matched `.yaml` and did not
  exclude `YAML-SCHEMA*`. All four call sites now share one
  `listPoemYamlFiles()` helper in `poem-render.js`. This changes
  `sync-blogger.js` behaviour: a poem source saved as `.yml` now syncs to
  Blogger like any `.yaml` poem, and a `YAML-SCHEMA.yaml`/`YAML-SCHEMA.yml`
  file (if present in `src/poems/yaml/`) is no longer sent to Blogger as a
  post.
- **`sync-blogger.js` now anchors on the repo root, not the invoking shell's
  working directory.** `YAML_DIR` and the `.poetic-config.yaml` lookup were
  built from `process.cwd()`, so running the script from any directory other
  than the repo root resolved the wrong paths — every other build tool
  anchors on `REPO_ROOT` (`src/tools/repo-root.js`) for this reason.
  `sync-blogger.js` now does the same.
- **`sync-framework.sh` now syncs `package-lock.json`.** The framework-owned
  paths list copied `package.json` but not the lockfile, so a dependency bump
  upstream (e.g. `js-beautify` 1.x → 2.x) reached consumers as a
  `package.json` change with a stale `package-lock.json`, and their CI failed
  at `npm ci` with "can only install packages when your package.json and
  package-lock.json … are in sync". Both files now sync together.

- **`sync-blogger.js` now reads credentials saved by `blogger-auth.js`.**
  `blogger-auth.js` saves `.blogger-credentials.json` with top-level keys
  (`client_id`, `client_secret`, `refresh_token`); `sync-blogger.js` only read
  the nested Google client-secrets `installed` shape, so a file saved by the
  auth helper was silently ignored and sync reported "missing environment
  variable(s)" with the file sitting right there. `resolveConfig` now accepts
  either shape (top-level keys win if both are present) and returns the
  resolved credentials directly instead of writing them to module-level
  variables; the missing-credentials message now also mentions the
  credentials file. `blogger-auth.js` now writes the credentials file with
  mode `0600`, since it holds a refresh token with full blog write access.
- **Build failures no longer degrade silently.** Several failure paths used
  to log a message and let the pipeline exit 0, publishing a degraded site:
  a `.poem` that failed conversion during `poem-to-yaml.js --all` simply
  disappeared from the build; a poem that failed to render into
  `all-poems.html` had `Error rendering poem: <message>` embedded in the
  published page instead of failing the build; a failed `index.html`
  regeneration logged "Skipped index.html update due to errors" and still
  exited 0; and a `$ref` cycle in a poem's YAML crashed `resolveRefs` with an
  unhelpful stack-overflow `RangeError`. All four now fail the build:
  conversion and render errors are counted and reported, then the process
  exits non-zero; `$ref` cycles are detected and raise a clear error naming
  the referencing file and the cycle instead of recursing forever. Site
  publishers now see CI fail instead of a partially-broken site deploying.
- **`all-poems.html`'s table-of-contents column headers are keyboard- and
  screen-reader-accessible.** Each sortable header's click handler was a bare
  `onclick="sortTable(...)"` on the `<th>` itself, with no `tabindex`, key
  handling, or `aria-sort` — keyboard and screen-reader users could not sort
  the poem table. Each `<th class="sortable">` now wraps a real `<button>`
  (native Tab focus and Enter/Space activation, wired via `addEventListener`
  in `public/all-poems.js` instead of inline `onclick`), and the active
  column's `<th>` now carries `aria-sort="ascending"`/`"descending"`
  (`"none"` otherwise), updated on every sort. Mouse behaviour, the visual
  sort indicators (↕/↑/↓), and header styling are unchanged.

### Added

- **Configurable site title.** A new top-level `title` key in
  `.poetic-config.yaml` sets the `<title>` and `<h1>` shown on `index.html`
  and `all-poems.html` (default: `My Poems`). Previously the framework's own
  site name was hard-coded into the generators. See
  [Title](docs/BUILD.md#title) in `docs/BUILD.md`. Resolves TD26071102.
- **MIT licence.** A `LICENCE` file now covers the repo, `package.json`'s
  `license` field matches it, and the file syncs to consumers. Resolves
  TD26071101.
- **Complete `package.json` metadata.** Added `name`, `version`, `license`,
  `engines` (`node >= 18`), and `private`. The `version` field is now the
  single source of truth for releases: bumping it in a commit to `main`
  causes `.github/workflows/release.yml` to tag that commit and publish the
  GitHub release automatically, so the tag can't drift out of sync with
  `package.json`. See the "Release process" section in `CLAUDE.md`. Resolves
  TD26071106.
- **Per-handler embed permission override.** A custom song handler can set
  `embed_allow` and/or `embed_allowfullscreen` to override the `allow` /
  `allowfullscreen` attributes `poetic.js` puts on that handler's lazy-loaded
  iframe. Left unset, the handler's embeds keep using the framework's global
  default (`autoplay; fullscreen; picture-in-picture; encrypted-media` +
  `allowfullscreen`). See [Embed permissions](docs/BUILD.md#embed-permissions)
  in `docs/BUILD.md`. Resolves TD26071002.
- **ESLint (flat config) as the project's first devDependency, plus
  `.editorconfig`.** `eslint.config.js` lints the CommonJS Node sources
  (`src/tools/`, `test/`, `scripts/`) and the browser scripts (`public/*.js`)
  separately, each with the right globals, starting from `@eslint/js`'s
  recommended rules relaxed to match existing style rather than restyling
  the codebase: console is allowed (these are CLI tools and browser
  scripts); `eqeqeq` is scoped to `"smart"` so the established `x != null`
  idiom still passes; `no-constant-condition` ignores loops, for the
  `while (true) { ... break; }` idiom used in `poem-to-yaml.js`; and
  `no-unused-vars` ignores `_`-prefixed names, matching the existing
  "deliberately discarded" convention (e.g. `catch (_)`). `npm run lint`
  runs it; CI runs it in `build-poems.yml` alongside the trailing-whitespace
  check. Fixed the real findings it surfaced — dead code, unused
  variables/labels, and useless regex escapes in `poem-to-yaml.js`,
  `sync-blogger.js`, `song-handlers.js`, `all-poems.js`, and two test files —
  and removed the vestigial `eslint-disable-next-line no-console` comments in
  `serve-static.js`, which referenced a rule that wasn't installed and is now
  allowed outright. `.editorconfig` documents the same 2-space/LF/final-
  newline/trim-trailing-whitespace convention `npm run check` already
  enforces, opting `.poem` and `.md` files out of trailing-whitespace
  trimming since both have meaningful trailing whitespace (a forced line
  break, and a Markdown hard break, respectively). Both files are added to
  `FRAMEWORK_PATHS` in `sync-framework.sh` and sync to consumers — they
  already receive `src/tools/` and `test/`, so linting there is coherent,
  and the devDependency reaches them automatically via the already-synced
  `package.json`.
- **CI backstop for Conventional Commits.** A new
  `.github/workflows/commit-format.yml` runs on every pull request —
  unfiltered by path, since commit hygiene isn't specific to any one part of
  the tree — and validates every commit's subject line, so the check now
  applies even when a contributor's clone never enabled the opt-in local
  hook (`git config core.hooksPath .githooks`). The Conventional Commits
  pattern is extracted from `.githooks/commit-msg` into
  `.githooks/check-commit-format.sh`, shared by both the hook and the new CI
  job so there is one source of truth for the regex. Not synced to
  consumers: Conventional Commits is this repo's own convention (see
  the "Commit messages" section of `README.md`), not one imposed on poem-
  collection repos. Resolves TD26071108.
- **`main` is now a protected, squash-merge-only branch.** The GitHub repo
  settings disallow direct commits/pushes to `main` and only allow squash
  merging, so every change — including releases — goes through a pull
  request. A squash merge folds the branch onto a single commit whose
  subject defaults to the PR title, not any individual branch commit, so
  `.github/workflows/commit-format.yml` now also validates the PR title
  against Conventional Commits (it previously only checked each branch
  commit). `CLAUDE.md` and `README.md` document the new branch workflow and
  the pull-request-based release process.
- **CodeQL security scanning.** A new `.github/workflows/codeql.yml` runs
  GitHub's CodeQL analysis on every pull request and push to `main`, plus a
  weekly schedule, covering `javascript-typescript` (the build tools in
  `src/tools/`) and `actions` (this repo's own workflow YAML). Results upload
  to the repo's Security tab.

### Changed

- **`js-yaml` upgraded to v5.** The build tools use only `yaml.load` /
  `yaml.dump`, both of which are unchanged in v5, and generated poem YAML for
  real four-digit poem dates is byte-for-byte identical to v4. v5 narrows its
  timestamp-detection regex, so a non-standard placeholder date whose year is
  `0000` (e.g. `0000-01-01`) is now dumped unquoted (`date: 0000-01-01`) rather
  than quoted (`date: '0000-01-01'`); it still round-trips back to the identical
  string, and no real poem date is affected. Resolves TD26071109.
- **`scripts/sync-framework.sh` now propagates upstream deletions.** Previously
  the script only overlaid framework files (`git checkout <commit> -- <path>`),
  so a file the framework *removed* upstream lived on in every consumer repo
  forever. After the checkout pass it now stages a removal for each
  framework-owned path deleted between the previously synced commit and the
  target commit (`git diff --diff-filter=D`), announced with a `deleted …`
  line alongside the existing `synced`/`skipped` output. Deletion is
  conservative — a path is removed only when it is under the framework path
  list, was deleted upstream between the two synced commits, and is not in
  `skip_paths`; a path merely absent at the target commit (e.g. a consumer's
  own file under a shared framework directory) is never touched. On a first
  sync, or when the previously synced commit is unavailable locally (rewritten
  history), deletion is skipped and the run says so. Resolves TD26071107.

- **`all-poems.html`/`index.html` client-side JS moved to `public/` assets.**
  The sort/filter script for `all-poems.html` and the poem-grid renderer for
  `index.html` used to be generated as large inline `<script>` blobs by
  `build-all-poems.js`. They now live in `public/all-poems.js` and
  `public/index.js`, loaded via `<script src>` like `poetic.js`. `index.html`
  carries its poem list as a `<script type="application/json" id="poem-data">`
  data island that `index.js` reads at runtime, instead of an interpolated
  `const allPoems = [...]` literal; a previously-built `index.html` still
  carrying the old inline format is migrated to the new one automatically on
  its next build. `date-utils.js` is now dependency-free enough to load
  directly as a browser `<script>` as well as a Node module — it's copied
  verbatim to `public/date-utils.js` at build time (single source of truth,
  no hand-maintained second copy), and `all-poems.js` calls its
  `parseDateForSorting()` for the sortable date column instead of carrying a
  duplicate implementation. `build-poems.js` and `build-all-poems.js` also
  gained direct tests. Resolves TD26071105.
- **`js-beautify` upgraded to 2.x.** Verified byte-for-byte identical HTML
  output against 1.15.4 for this framework's beautify options before landing
  the bump; publishers should not see any formatting change in generated
  poem pages.
- **Dev server binds to localhost by default.** `serve-static.js`
  (`npm start` / `npm run build:all`) now listens on `127.0.0.1` instead of
  all interfaces, so the local preview is no longer reachable from other
  machines on your network. `http://localhost:8080` continues to work exactly
  as before. Pass `--host 0.0.0.0` (or set `HOST=0.0.0.0`) to expose it on
  your LAN for the occasional cross-device test.

### Removed

- **Two dead one-off migration tools.** `src/tools/convert-html-to-yaml.js`
  and `src/tools/update-analysis-format.js` were single-use scripts anchored on
  a `poems/` directory layout the framework no longer uses (poems live under
  `src/poems/poem/`); the latter's own comment noted it "was used to migrate
  existing YAML files". They are deleted, and — now that `sync-framework.sh`
  propagates upstream deletions — consumers stop carrying them on their next
  sync.

### Security

- **Tightened dev-server path containment.** The traversal guards in
  `serve-static.js` now compare the resolved path against the served root plus
  a path separator, so a sibling directory whose name merely extends the root
  (e.g. `publicX` beside `public`) can no longer satisfy the check. The
  join/containment logic is factored into `src/tools/path-guard.js` and unit
  tested.
- **Blogger auth flow now uses OAuth `state` and PKCE.** `blogger-auth.js`
  sends a random `state` value plus an S256 PKCE challenge on the consent URL
  and rejects the loopback callback if the returned `state` does not match,
  following RFC 8252 for native-app OAuth.

## [5.1.0] — 2026-07-10

### Added

- **Song-handler value overrides and pasted-URL inference.** A poem's audio
  line can now override just part of a builtin handler's URL — e.g.
  `Audiomack: my-shepherd` overrides only the song slug (useful when a poem's
  URL slug and its Audiomack slug have diverged, such as after disambiguating
  two same-titled poems by filename), and `Audiomack: other_account/song/my-shepherd`
  overrides the artist too. All three builtins (`audiomack`, `suno`, `mega`)
  also accept a full or partial pasted URL from the service itself and infer
  the rest; `suno` additionally infers the `s/` vs `song/` link form from a
  bare ID's shape. This is driven by a new declarative `value_patterns` field
  a custom handler can also use — see [Value
  patterns](docs/BUILD.md#value-patterns) in `docs/BUILD.md`. Resolves
  TD26071001.

### Changed

- **Breaking: `.poetic-config.yaml` is now hierarchical.** Related keys are
  grouped under a parent key instead of sharing a flat `foo_bar` prefix, and
  the Audiomack artist slug moved from a standalone key to a field on its own
  handler (any handler can now take config the same way). `favicon`,
  `subtitle`, and `skip_paths` are unchanged, at the top level. Update your
  `.poetic-config.yaml` by hand — there is no auto-migration. See
  `examples/poetic-config.example.yaml` for a fully-commented reference of
  every key in the new shape.

  | Old (flat) key | New (nested) key |
  |---|---|
  | `auto_sync` | `auto_sync.enabled` |
  | `sync_schedule` | `auto_sync.schedule` |
  | `show_footer` | `footer.enabled` |
  | `footer_source` | `footer.source` |
  | `blogger_sync` | `blogger.sync` |
  | `blogger_blog_id` | `blogger.blog_id` |
  | `blogger_removed` | `blogger.removed` |
  | `blogger_content` | `blogger.content` |
  | `blogger_label` | `blogger.label` |
  | `blogger_template` | `blogger.template` |
  | `audiomack_artist` | `song_handlers.audiomack.artist` |

  The `{audiomack_artist}` token in a custom `song_handlers` URL template is
  now `{artist}` — any scalar field set on a handler (built-in or overridden)
  is available as a token under its own name, not just top-level config keys.

### Added

- **MEGA.nz builtin song handler (`Mega:`).** A public MEGA file link (its
  `<id>#<key>` identifier) becomes an inline, lazy-loaded player that plays
  **both audio and video** files, with full-screen and picture-in-picture, on
  GitHub Pages and Blogger.
- **Configurable player size — per handler and per song.** Handlers declare a
  size with `embed_height` / `embed_aspect_ratio`, or, for multi-media handlers,
  `default_media` + a `media_sizes` map of per-type profiles. Authors override
  it per song with a trailing param list on the audio line —
  `(audio|video)`, `(ratio=16/9)` (also `16:9`), `(height=360)`, or a
  combination such as `(video, ratio=21:9)`. This replaces the previously
  hard-coded Audiomack player height.
- **Deep-merge overrides for song handlers.** A consumer `song_handlers` entry
  now merges into a builtin key-by-key (nested maps like `media_sizes` merge
  recursively; a `null` value deletes a key), so a consumer can retune one size
  profile without redeclaring the handler's `embed_url`.
- **Embed iframes grant full-screen / picture-in-picture.** Lazy-loaded player
  iframes are created with `allow="autoplay; fullscreen; picture-in-picture;
  encrypted-media"` and `allowfullscreen`.

### Fixed

- **`scripts/sync-framework.sh` now handles an empty `skip_paths` list safely.**
  When `.poetic-config.yaml` omits `skip_paths`, the script returns cleanly on
  older Bash versions instead of failing while iterating the empty `SKIP_PATHS`
  array under `set -u`.

- **Vim syntax highlighting of the poem title and the final analysis marker.**
  The title (`poemTitle`) was hard-coded to highlight line 1, so a poem with a
  preamble comment block or variable definitions before the header had its
  title highlighting land on the wrong line (and stole that line from the
  comment/variable-definition highlighting). It now matches the actual title —
  the first line of the header after the optional preamble — located by the
  grammar rather than a fixed line number. Separately, the `====` marker that
  closes the analysis section now splits into the marker and its trailing
  `# comment` (`poemEndMarkerMark` + `poemEndMarkerLineTrailing`), matching how
  every other `====  # comment` line is highlighted. Both are editor-cosmetic
  (no effect on build output).

## [4.3.1] — 2026-07-08

### Fixed

- **Spurious awk warning during `scripts/sync-framework.sh`.** The
  `skip_paths` parser in `.poetic-config.yaml` used a bracket regex
  (`[\"'"'"']`) with an unnecessary backslash before the double quote, which
  awk doesn't recognize as a valid escape inside a character class. Every
  sync run printed `awk: cmd. line:5: warning: regexp escape sequence '\"'
  is not a known regexp operator` to stderr even though quote-stripping still
  worked correctly. The backslash is removed; behaviour is unchanged, only
  the warning is gone.

## [4.3.0] — 2026-07-08

### Added

- **Commit body summary for `scripts/sync-framework.sh --commit`.** The
  auto-generated commit now includes a body listing the upstream commit
  messages (restricted to framework-owned paths) between the previously
  synced commit and this one, so the commit records *what* changed, not just
  that a sync happened. Falls back to a note if the previous commit can't be
  found upstream (first-ever sync, or rewritten history). The same summary is
  printed to the terminal even without `--commit`, so it's visible before you
  decide whether to commit.

## [4.2.0] — 2026-07-08

### Added

- **`--commit` flag for `scripts/sync-framework.sh`.** Automatically commits
  the staged sync using the script's suggested message
  (`chore: sync framework from poetic <ref>`), instead of leaving it staged
  for manual review.

### Changed

- **`scripts/sync-framework.sh` now syncs itself first.** If the script
  changed upstream (e.g. a new framework path was added to it), it re-runs
  the updated copy before syncing anything else, so newly added paths are
  picked up in the same run instead of needing a second manual re-run.
- **`.poetic-version` is staged automatically** by `scripts/sync-framework.sh`
  alongside the other synced files, rather than being left unstaged.

## [4.1.1] — 2026-07-08

### Added

- **Generic `.song-item-embed` / `.song-item-link` type classes** on each song
  item, alongside the existing `.song-item--<service>` modifier. They let
  `custom.css` target every embed- or link-type handler at once rather than
  service by service.

### Fixed

- **The parentheses around link-type songs (e.g. Suno) are no longer part of
  the link.** They were emitted by `::before`/`::after` on the `<a>` element, so
  they picked up link styling and hit area. They now sit on the enclosing
  `.song-item-link` div, outside the anchor. Override `content` on
  `.song-item-link` (or a `.song-item--<service>` modifier) in `custom.css` to
  change or remove them.

## [4.1.0] — 2026-07-08

### Added

- **Configurable song handlers.** Song links and embedded players are now
  defined by YAML handlers instead of being hardcoded per service. Audiomack
  and Suno ship as builtins (`src/song-handlers.yaml`); consumers add their
  own services (YouTube, Spotify, …) under `song_handlers:` in
  `.poetic-config.yaml` — no framework code needed. Adding a service needs
  only YAML (a `link_url` and/or `embed_url` template, with `{token}`
  substitution) plus CSS. See [`docs/BUILD.md`](docs/BUILD.md#custom-song-handlers).

### Changed

- **Audiomack player CSS classes renamed** to generic `.song-embed-*` /
  `.song-item--<service>` / `.song-link--<service>` (was
  `.load-audiomack-btn` / `.audiomack-container` / `.audiomack-player`).
  Style custom handlers in `custom.css` via the per-service modifier classes.
- **The `.poem` audio section grammar is now a generic `<Service>[: value]`
  line** — a service name (bare for presence, or followed by `: value` to
  supply a track ID or URL) — instead of hardcoded `Audiomack` / `Suno:`
  keywords. Existing poems using `Audiomack` and `Suno: ...` are unaffected,
  since those are now just the builtin services.

### Fixed

- **The dev server's live `/all-poems` route now includes the footer.**
  `src/tools/serve-static.js` reused its own duplicate of
  `all-poems.html` generation, which diverged from the real build (no
  favicon/subtitle sync) and omitted the footer from `src/tools/footer.js`.
  It now reuses `src/tools/build-all-poems.js`'s `concatenateAllHtmlFiles`
  directly, so the live route matches the built `all-poems.html`.
- **`scripts/sync-framework.sh` now syncs `scripts/check-build-artifacts.sh`.**
  It was missing from `FRAMEWORK_PATHS`, so consumers running `npm run
  check:build` (including CI, via `.github/workflows/build-poems.yml`) got
  "No such file or directory" instead of the build-artifact smoke test.
- **`scripts/sync-framework.sh` no longer aborts silently on a tag conflict.**
  The upstream tags fetch now passes `--force`, so a consumer's stale cached
  copy of a poetic tag no longer causes `git fetch` to reject the update and
  abort the whole script (under `set -e`) with no error message.

## [4.0.0] — 2026-07-08

### Changed

- **`.poetic-config` is now `.poetic-config.yaml` (breaking).** The config
  file moved from `key=value` lines to YAML. `skip_paths` is now a YAML list
  instead of a comma-separated string, and `auto_sync`, `blogger_sync`, and
  `show_footer` are now real YAML booleans instead of the strings `"true"` /
  `"false"`. `blogger_blog_id` must be quoted as a string — it exceeds
  `Number.MAX_SAFE_INTEGER` and loses precision as a YAML number. All other
  keys are unchanged. Consumers must rename and convert their config file;
  `readPoeticConfig` logs a warning (and treats config as empty) if it finds
  a leftover `.poetic-config` but no `.poetic-config.yaml`. See
  [`docs/BUILD.md`](docs/BUILD.md#poetic-configyaml).

## [3.2.0] — 2026-07-08

### Added

- **Site footer.** Every built page — individual poem pages, `index.html`,
  `all-poems.html`, and `public/raw/index.html` — now gets a footer reading
  "Built with Poetic" (linking the framework repo) alongside the Poetic logo,
  sourced from the new framework-owned `public/poetic-footer.html`. Two new
  `.poetic-config` keys control it: `show_footer` (set to `false` to omit the
  footer; default `true`) and `footer_source` (path to a custom footer HTML
  file; default `public/poetic-footer.html`). Rebuilding is idempotent — the
  footer is replaced in place rather than duplicated on each build. See
  [`docs/BUILD.md`](docs/BUILD.md#footer).

## [3.1.0] — 2026-07-07

### Added

- **Alternatives in plain text.** The reserved `poetic-alternatives` span class
  marks options in an alternatives group: two or more spans carrying it that are
  directly adjacent (no separating characters) are treated as alternatives. The
  HTML keeps every option (wire up your own toggle); the `raw/` plain-text output
  keeps the last option and drops the rest. Three or more options are supported.

### Fixed

- **Multi-class spans.** `/.a.b{x}` now emits `<span class="a b">` (multiple
  classes, as documented) instead of `<span class="a.b">` (a single dotted
  class). Hyphenated single classes such as `/.text-highlight{x}` are unchanged.
- Hardened the raw converter against edge cases: an out-of-range numeric
  character reference (e.g. `&#99999999;`) is left literal instead of aborting
  the build; `%{title}`/`%{author}` are decoded before use as context values;
  the index page's no-remote fallback links to the repo-root `raw/` directory.

## [3.0.1] — 2026-07-07

### Changed

- **Raw plain-text output (`raw/<stem>`) is now produced by the canonical
  engine.** `npm run poem-to-raw` parses each poem through the same pipeline as
  the YAML/HTML build (`src/tools/poem-to-yaml.js`) instead of a separate Perl
  reimplementation, so the full variable spec — multi-line definitions,
  nested/late-bound `${name}` references, `${name:-default}` fallbacks,
  `\${...}` escaping, `.shared.poem` variables, and `%{...}` context variables —
  is applied to the raw output, matching the HTML. Section labels and opaque
  embedded blocks (raw HTML, Markdown tables) are omitted from the plain text,
  and the browsable `public/raw/index.html` escapes poem titles. The previous
  shell/Perl implementation (`scripts/poem-to-raw.sh`) is removed.

## [3.0.0] — 2026-07-06

### Changed

- **Nested variables now use dynamic (late) binding.** A `${...}` reference
  inside another variable's value is resolved each time the outer variable is
  *used*, against the referenced variable's current value — so redefining an
  inner variable (for example, per poem) changes later expansions of a shared
  variable that references it. **Breaking**: the previous eager/self-reference
  behaviour is gone; a reference cycle (e.g. `={a}=${a}`) is now left as the
  literal `${a}` with a warning instead of being resolved.
- **Literal blocks suppress Markdown, not substitution.** Author `${...}`
  variables are now substituted inside raw `<<<...>>>` blocks. **Breaking**: to
  emit a literal `${...}` inside a block, escape it as `\${...}`.

### Added

- **Default values** in a reference: `${name:-default}` uses `default` when
  `name` is undefined.
- **Escaping**: `\${...}` (and `\%{...}`) emit a literal `${...}` / `%{...}`.
- **Build-time context variables** with a `%` sigil — `%{slug}`, `%{title}`,
  `%{author}`, `%{date}` — resolved at the render stage, so they work anywhere
  including inside literal blocks (e.g. an interactive `<script>` needing the
  poem's slug). **Breaking**: the previously hardcoded `${slug}` substitution in
  postscript content is replaced by `%{slug}`; migrate `${slug}` → `%{slug}`.
- The eager/early-binding variable form (a leading `!`, e.g. `={!name}=` or
  `${!name}`) is **reserved** and raises an error until it is implemented.

## [2.4.0] — 2026-07-06

### Added

- **Labels search scope** on the all-poems page — the text filter can now match
  poem labels, toggled alongside Titles and Lyrics (on by default).
- **Clickable labels** — a label shown anywhere on the site links through to the
  all-poems page pre-filtered to that label.
- **URL-driven filters** — the all-poems filter reads its state (query text,
  active scopes, date range) from URL parameters on load and keeps the address
  bar in sync as it changes, so a filtered view is shareable and bookmarkable.

### Changed

- On the Blogger site, the in-content poem-labels list is now hidden, since
  Blogger shows each post's labels through its own theme scaffolding.

## [2.3.0] — 2026-07-06

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
