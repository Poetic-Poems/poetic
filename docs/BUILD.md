# Building for GitHub Pages

This repository can be published to GitHub Pages using the included workflow.

## Build Process

Since GitHub Pages serves static files only, we use a build script to generate the concatenated "all poems" view.

### Quick Start

1. **Build the all-poems.html file:**

   ```bash
   npm run build
   ```

2. **Build and start local server:**

   ```bash
   npm run build:all
   ```

2.5 **Generate raw text files from `.poem` sources:**

   ```bash
   npm run poem-to-raw
   ```

3. **View locally:**
   - Main page: http://localhost:8080
   - All poems: http://localhost:8080/all-poems.html

### What the Build Scripts Do

#### Main Build Script (`src/tools/build-all-poems.js`)

The main build script:

1. Scans the `public/` directory for all HTML files
2. Extracts metadata (title, date, audio links) from each poem
3. Sorts poems chronologically by date using the date utility functions
4. Generates a comprehensive `all-poems.html` file with:
   - Table of contents with sorting functionality
   - All poems concatenated in chronological order
   - Custom CSS from the template
   - Interactive sorting by title, date, or audio availability

#### Date Utility Functions (`src/tools/date-utils.js`)

The build system includes utility functions for handling date formats:

- **`formatDateForDisplay(dateStr)`** - Converts ISO date format (`yyyy-mm-dd`) to display format (`DayOfWeek, DD Month YYYY`)
- **`parseDateForSorting(dateStr)`** - Parses date strings for chronological sorting, handling both ISO and display formats

These utilities ensure consistent date handling across the build process.

#### Blogger Template Script (`src/tools/build-blogger.js`)

The Blogger template script:

1. Reads and concatenates CSS from `public/poetic.css` and `public/custom.css`
2. Locates the Blogger template file `public/fragments-and-unity.template.html`
3. Finds CSS delimiters `/* ~~ CUSTOM CSS START ~~ */` and `/* ~~ CUSTOM CSS END ~~ */`
4. Replaces the content between these delimiters with the combined styles
5. Provides error handling for missing files or malformed delimiters
6. Updates the template file in place for uploading to Blogger

#### Raw extraction script (`src/tools/poem-to-raw.js`)

The `poem-to-raw` step extracts the plain-text body of each `.poem` source file to the `raw/` directory at the repository root, and writes a browsable `public/raw/index.html` linking to those files on GitHub. It parses each poem through the same canonical engine as the YAML/HTML pipeline (`src/tools/poem-to-yaml.js`), so variables — including multi-line definitions, `${name}` references, `${name:-default}` fallbacks, `\${...}` escaping, `.shared.poem` variables, and `%{...}` context variables — are handled identically across outputs. The engine's inline HTML markup is then flattened to plain text, common HTML entities are normalised to their Unicode equivalents, section labels and opaque embedded blocks are dropped, and partial files (names beginning with `_` or `.`) are skipped. Run it standalone with `npm run poem-to-raw` or let the main `build` sequence invoke it automatically.

### Workflow for Updates

When you add new poems or update existing ones:

1. Add your new poem HTML file to the `public/` directory
2. Run `npm run build` to regenerate `all-poems.html`
3. Commit and push to GitHub
4. GitHub Pages will automatically update

### Workflow for Blogger Template Updates

When you need to update the Blogger template with new CSS:

1. Edit `public/poetic.css` (framework styles, synced) or `public/custom.css` (your styles, never synced)
2. Run `npm run build:blogger` to inject the combined CSS into the template
3. Copy the updated `public/fragments-and-unity.template.html` content
4. Paste it into the Blogger template editor
5. Save the template in Blogger

The script will automatically handle the CSS injection and provide feedback on success or any errors encountered.

### File Structure

```
public/
├── index.html                           # Main landing page
├── all-poems.html                       # Generated concatenated view
├── poetic.css                           # Framework CSS (synced from poetic)
├── poetic.js                            # Framework JS — shared Audiomack loader (synced)
├── poetic-footer.html                   # Default footer content (synced; see footer_source)
├── custom.css                           # User CSS (never overwritten by sync)
├── fragments-and-unity.template.html    # Blogger template with injected CSS
├── poem1.html                           # Redirect stub → poem1/ (meta-refresh)
├── poem2.html
├── poem1/
│   └── index.html                       # Standalone styled page (clean URL /poem1/)
├── poem2/
│   └── index.html
└── ...

src/poems/
├── poem/
│   ├── _example.poem                    # Example poem source
│   ├── _shared.poem                     # Shared poem content included by others
│   ├── poem1.poem                       # Individual poem source files
│   ├── poem2.poem
│   └── ...
└── yaml/
    ├── _example.yaml                    # Example poem YAML (generated)
    ├── _shared.yaml                     # Shared YAML content
    ├── poem1.yaml                       # Individual poem YAML (generated)
    ├── poem2.yaml
    └── ...

src/tools/
├── build-all-poems.js                   # Main build script
├── build-poems.js                       # Individual poem builder
├── date-utils.js                        # Date format utilities
├── footer.js                            # Shared footer renderer (render + idempotent insert)
├── poem-render.js                       # Shared renderer (fragment + full page)
├── poem-to-yaml.js                      # Converter script
├── poetic-config.js                     # Shared .poetic-config.yaml reader
├── serve-static.js                      # Development server
└── ...
```

### Standalone poem pages and redirect stubs

Each poem is built as a **full, styled HTML document** at `public/<slug>/index.html` so that
visiting `/<slug>/` shows a properly styled page linking `poetic.css`, `custom.css`, and
`poetic.js`. The old flat URL `/<slug>.html` remains as a redirect stub that immediately
forwards the browser to `./<slug>/` via `<meta http-equiv="refresh">` plus a
`<link rel="canonical">`. The `<slug>` is the poem's source filename stem (e.g. `my-poem.poem`
→ `/my-poem/`), not derived from the title, so identically-titled poems stay distinct.

### Shared song-embed loader (`public/poetic.js`)

`poetic.js` is a tiny, framework-owned script that lazy-loads embedded song
players. A single delegated `click` listener on `document` handles every
`.song-embed-btn` button on any page (individual poem pages, `all-poems.html`,
and the live dev-server endpoint), for any service — no per-service or
per-poem JavaScript is needed.

The embed button carries the resolved embed URL and title as `data-*`
attributes, built at render time from the poem's song handler:

```html
<button class="song-embed-btn" data-embed-src="https://audiomack.com/embed/..." data-title="My Poem">
  🎵 Load Audiomack Player
</button>
```

No third-party iframe request happens until the visitor clicks the button, at
which point `poetic.js` creates the `<iframe>` inside the adjacent
`.song-embed-player` element. Player dimensions are controlled by CSS, not
JavaScript — see [Player size](#player-size) below.

Every created iframe is granted `allow="autoplay; fullscreen;
picture-in-picture; encrypted-media"` and `allowfullscreen`. This is a single
global default that is harmless for services that do not use those capabilities
and is required for players such as MEGA to offer full-screen and
picture-in-picture. (Autoplay with sound is still blocked cross-origin by the
browser, so playback always starts from the visitor's click.)

Set the Audiomack artist referenced by the builtin `audiomack` handler's URL
template in `.poetic-config.yaml`:

```yaml
audiomack_artist: saltysojourner
```

### Custom song handlers

Song links and embedded players are driven by declarative **song handlers** —
a mapping from a service name (as written in a poem's Audio section, e.g.
`Audiomack` or `YouTube`) to a small definition of URLs and labels. Poetic
ships three builtin handlers, `audiomack`, `suno`, and `mega`, defined in the
framework's `src/song-handlers.yaml`. Adding support for another service needs
only YAML and CSS — no framework code — by adding an entry under
`song_handlers:` in `.poetic-config.yaml`.

A handler definition may set:

- `link_url` (+ `link_label`) — renders a plain anchor
- `embed_url` (+ `button_label`) — renders a lazy-loaded iframe (see
  [Shared song-embed loader](#shared-song-embed-loader-publicpoeticjs) above);
  no third-party request happens until the visitor clicks the button
- player-size keys — `embed_height`, `embed_aspect_ratio`, `default_media`, and
  `media_sizes` (see [Player size](#player-size) below)

At least one of `link_url` / `embed_url` is required; a handler may define
both.

**Worked example** — adding YouTube support:

```yaml
song_handlers:
  youtube:
    embed_url: "https://www.youtube.com/embed/{value}"
    button_label: "▶ Load YouTube"
    link_url: "https://youtu.be/{value}"
    link_label: "watch on YouTube"
```

With this in place, a poem's Audio section can include:

```
YouTube: dQw4w9WgXcQ
```

which renders both a lazy-loaded embedded player and a plain link to the video.

#### URL templates

`link_url` and `embed_url` are templates containing `{token}` placeholders,
resolved at build time:

- `{value}` — the text the poem author wrote after the service name (empty for
  a bare line such as `Audiomack`)
- `{slug}`, `{title}`, `{author}`, `{date}` — the poem's own context
- any scalar key from `.poetic-config.yaml` — e.g. `{audiomack_artist}`, as
  used by the builtin `audiomack` handler

A **fallback chain** `{a|b|c}` resolves to the first token in the list that is
non-empty. For example, the builtin `audiomack` handler uses
`{value|slug}` — the author's value if one was given, otherwise the poem's
slug.

#### Player size

An embed handler declares the player's size. A handler that serves a single kind
of media sets one of:

- `embed_height` — a fixed CSS height (e.g. `"252px"`), the builtin `audiomack`
  handler's size
- `embed_aspect_ratio` — a fixed `width / height` ratio (e.g. `"16 / 9"`); the
  iframe height is then computed from its width

A handler that serves several kinds of media (like `mega`: audio and video) sets:

- `default_media` — the media type used when the author gives no `audio`/`video`
  token
- `media_sizes` — a map of media type → size profile, where each profile is a
  `height` **or** an `aspect_ratio`. If a profile somehow ends up with both
  keys (this can happen when a consumer override deep-merges into a builtin
  profile — see [Overriding builtin handlers](#overriding-builtin-handlers)),
  `aspect_ratio` takes precedence and `height` is ignored:

```yaml
mega:
  embed_url: "https://mega.nz/embed/{value}"
  button_label: "🎵 Load MEGA Player"
  default_media: audio
  media_sizes:
    audio: { aspect_ratio: "1 / 1" }
    video: { aspect_ratio: "16 / 9" }
```

MEGA renders an audio file as a roughly square cover-art viewport, so the builtin
`mega` audio profile uses a `1 / 1` ratio (not a fixed bar height); video uses
`16 / 9`.

Authors override the size per song with a trailing parameter list on the audio
line — `(audio)`, `(video)`, `(ratio=16/9)`, `(height=360)`, or a combination
such as `(video, ratio=21:9)`. See
[Player size and media type](POEM-SYNTAX.md#player-size-and-media-type) in
`docs/POEM-SYNTAX.md`.

At render time the resolved size is emitted as a CSS custom property on the
`.song-embed-player` element: either `--song-embed-height` (fixed height) or
`--song-embed-aspect-ratio` (with an added `song-embed-player--aspect` modifier
class). `poetic.css` consumes those, falling back to `252px` when a handler
declares no size. The resolved media type is also exposed as `data-embed-media`
and a `song-embed--<service>--<media>` class for per-media styling.

#### Overriding builtin handlers

A consumer entry under `song_handlers:` with the same name as a builtin
**deep-merges** into it, key by key: scalar keys are overridden, nested maps
(like `media_sizes`) merge recursively, and a `null` value deletes a key. So a
consumer can retune just one size profile without redeclaring the handler's
`embed_url`:

```yaml
song_handlers:
  mega:
    media_sizes:
      audio: { aspect_ratio: null, height: "300px" }   # switch audio to a fixed height
      video: { aspect_ratio: "4 / 3" }
```

**A size profile is `height` *or* `aspect_ratio`, and if both keys are
present, `aspect_ratio` wins** (see [Player size](#player-size) above). Because
the merge is key-by-key rather than a wholesale replace, adding `height` to a
profile that already has `aspect_ratio` (as the builtin `mega` audio profile
does) does not switch the sizing mode — it leaves `aspect_ratio` in place *and*
adds an unused `height`, so nothing visibly changes. To switch a profile from
one sizing mode to the other, null out the key you're replacing, as in the
`audio` line above. Overriding `video` needs no `null` here only because that
profile has no competing key to begin with.

#### Styling custom handlers

Styling lives in CSS, not in the handler definition. Each song gets these
generated classes, keyed on the lower-cased service name:

- `.song-item` + `.song-item--<service>` — wrapper around one song
- `.song-embed` + `.song-embed--<service>` — the embed container
- `.song-embed-btn` — the lazy-load button (shared across all services)
- `.song-embed-player` — the iframe holder
- `.song-link-anchor` + `.song-link--<service>` — the link

Add per-service rules to `public/custom.css`, for example to set the
YouTube player's height:

```css
.song-embed--youtube .song-embed-player iframe {
  height: 200px;
}
```

Every link-type item is wrapped in a `.song-item-link` div (embed-type items get
`.song-item-embed`). `poetic.css` uses that generic wrapper to add decorative
parentheses around all link handlers — placed on the div, so they sit outside the
`<a>` and are not part of the link:

```css
div.song-item-link::before { content: "("; }
div.song-item-link::after  { content: ")"; }
```

A consumer can drop the parentheses globally by overriding `content` on
`.song-item-link` in `public/custom.css` (an empty `content: "";` removes them),
or target a single service via the `.song-item--<service>` modifier.

### Customisation

The build script uses the same logic as the development server (`src/tools/serve-static.js`) but generates a static file instead of serving dynamically. You can modify the styling or functionality by editing the build script.

### `.poetic-config.yaml`

User-specific build settings live in `.poetic-config.yaml` at the repo root. This file is yours — it is never overwritten by a framework sync — and should be committed to version control so that CI picks it up when building for GitHub Pages.

Supported keys:

| Key | Default | Description |
|-----|---------|-------------|
| `favicon` | `poetic-logo.svg` | Filename (inside `public/`) of the browser-tab icon |
| `subtitle` | `My Poems` | Subtitle shown below the site title on `index.html` |
| `audiomack_artist` | _(none)_ | Audiomack artist slug used for embedded audio players (e.g. `saltysojourner`) |
| `song_handlers` | _(none)_ | Map of custom song-handler definitions (service name → `link_url`/`embed_url`/labels/size), deep-merged with the builtin `audiomack`/`suno`/`mega` handlers; see [Custom song handlers](#custom-song-handlers) |
| `skip_paths` | _(none)_ | List of framework paths to skip during sync |
| `auto_sync` | _(off)_ | Set to `true` to enable the hourly scheduled sync workflow |
| `sync_schedule` | `weekly` | How often the scheduled sync runs: `hourly`, `daily`, or `weekly` |
| `blogger_sync` | `false` | Set to `true` to enable automatic Blogger publishing via GitHub Actions |
| `blogger_blog_id` | _(required when enabled)_ | Numeric Blogger blog ID (visible in the blog URL in Blogger settings) — quote it as a string; it exceeds `Number.MAX_SAFE_INTEGER` and loses precision as a YAML number |
| `blogger_removed` | `draft` | What happens to a post when its source poem is removed: `draft`, `delete`, or `keep` |
| `blogger_content` | `full` | Content posted to Blogger: `full` (complete styled HTML page) or `poem` (poem fragment only) |
| `blogger_label` | `poem` | Blogger label applied to all managed posts |
| `blogger_template` | `public/blogger-template.html` | Path to the Blogger XML theme template file injected by `npm run build:blogger` |
| `show_footer` | `true` | Set to `false` to omit the footer from every built page |
| `footer_source` | `public/poetic-footer.html` | Path to the HTML file whose contents are injected as the page footer |

Example:

```yaml
favicon: my-icon.png
subtitle: Warwick Allen's Poems
audiomack_artist: saltysojourner
skip_paths:
  - public/poetic-logo.svg
auto_sync: true
sync_schedule: hourly
```

#### Favicon

The browser-tab icon defaults to `public/poetic-logo.svg`, which is included with the framework. To use a different icon, place your file in `public/` and set the `favicon` key:

```yaml
favicon: my-icon.png
```

The build will then emit `<link rel="icon" href="my-icon.png" ...>` in both `index.html` and `all-poems.html`. Any file format the browser supports works (`svg`, `png`, `ico`, etc.).

To keep the default logo but prevent it being overwritten on the next framework sync, add it to `skip_paths`:

```yaml
skip_paths:
  - public/poetic-logo.svg
```

#### Subtitle

The subtitle shown below the site title on `index.html` defaults to `My Poems`. Override it with the `subtitle` key:

```yaml
subtitle: Warwick Allen's Poems
```

#### Footer

Every page the build generates — individual poem pages, `index.html`, `all-poems.html`, and `public/raw/index.html` — gets a footer as the last element in `<body>`. By default it reads `public/poetic-footer.html` (included with the framework) and shows "Built with Poetic" linking to the framework repo, alongside the Poetic logo.

Turn it off entirely:

```yaml
show_footer: false
```

Or supply your own footer content by pointing `footer_source` at a file of your own (never overwritten by a framework sync, unlike the default `public/poetic-footer.html`):

```yaml
footer_source: public/my-footer.html
```

The footer source file is raw HTML, injected verbatim inside a `<footer class="poetic-footer">` wrapper. It may reference `%{base}` — the relative path prefix back to the site root (`''` on `index.html`/`all-poems.html`, `../` on one-directory-deep pages like individual poem pages and `raw/index.html`) — useful for linking an image or asset that lives in `public/`:

```html
<img src="%{base}poetic-logo.svg" alt="Poetic logo">
```

Rebuilding is idempotent: each build replaces the previously-inserted footer in place (identified by an HTML comment marker) rather than appending a new one, so `index.html` never accumulates duplicate footers across repeated builds, and toggling `show_footer` off removes an existing footer on the next build.

To keep the default footer file but prevent it being overwritten on the next framework sync, add it to `skip_paths`:

```yaml
skip_paths:
  - public/poetic-footer.html
```

### Publishing to Blogger

Poetic supports optional automatic publishing of poems to a Blogger blog. The feature is off by default and is enabled per-consumer via `.poetic-config.yaml`. See [`docs/BLOGGER.md`](BLOGGER.md) for the full setup guide, including one-time Google OAuth authorisation, GitHub secrets, and theme parity steps.
