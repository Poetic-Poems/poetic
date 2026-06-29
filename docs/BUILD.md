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

The `poem-to-raw` step extracts the plain text body from `.poem` source files and writes them to the `raw/` directory at the repository root (skips partial files, removes comments and front-matter delimiters, and normalises common HTML entities). The authoritative implementation is `scripts/poem-to-raw.sh`; `src/tools/poem-to-raw.js` is a thin wrapper that invokes it so the build pipeline can call `npm run poem-to-raw` without shelling out to bash directly. Run it standalone with `npm run poem-to-raw` or let the main `build` sequence invoke it automatically.

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
├── poem-render.js                       # Shared renderer (fragment + full page)
├── poem-to-yaml.js                      # Converter script
├── poetic-config.js                     # Shared .poetic-config reader
├── serve-static.js                      # Development server
└── ...
```

### Standalone poem pages and redirect stubs

Each poem is built as a **full, styled HTML document** at `public/<slug>/index.html` so that
visiting `/<slug>/` shows a properly styled page linking `poetic.css`, `custom.css`, and
`poetic.js`. The old flat URL `/<slug>.html` remains as a redirect stub that immediately
forwards the browser to `./<slug>/` via `<meta http-equiv="refresh">` plus a
`<link rel="canonical">`.

### Shared Audiomack loader (`public/poetic.js`)

`poetic.js` is a tiny, framework-owned script that replaces the per-poem inline
`loadAudiomackPlayer` functions that previously appeared once inside every poem fragment.
A single delegated `click` listener on `document` handles all `.load-audiomack-btn` buttons
on any page (individual poem pages, `all-poems.html`, and the live dev-server endpoint).

The audio button now uses `data-*` attributes instead of an inline `onclick`:

```html
<button class="load-audiomack-btn"
        data-slug="my-poem"
        data-title="My Poem"
        data-artist="saltysojourner">🎵 Load Audio Player</button>
```

Set the Audiomack artist in `.poetic-config`:

```
audiomack_artist=saltysojourner
```

### Customisation

The build script uses the same logic as the development server (`src/tools/serve-static.js`) but generates a static file instead of serving dynamically. You can modify the styling or functionality by editing the build script.

### `.poetic-config`

User-specific build settings live in `.poetic-config` at the repo root. This file is yours — it is never overwritten by a framework sync — and should be committed to version control so that CI picks it up when building for GitHub Pages.

Supported keys:

| Key | Default | Description |
|-----|---------|-------------|
| `favicon` | `poetic-logo.svg` | Filename (inside `public/`) of the browser-tab icon |
| `subtitle` | `My Poems` | Subtitle shown below the site title on `index.html` |
| `audiomack_artist` | _(none)_ | Audiomack artist slug used for embedded audio players (e.g. `saltysojourner`) |
| `skip_paths` | _(none)_ | Comma-separated list of framework paths to skip during sync |
| `auto_sync` | _(off)_ | Set to `true` to enable the hourly scheduled sync workflow |
| `sync_schedule` | `weekly` | How often the scheduled sync runs: `hourly`, `daily`, or `weekly` |
| `blogger_sync` | `false` | Set to `true` to enable automatic Blogger publishing via GitHub Actions |
| `blogger_blog_id` | _(required when enabled)_ | Numeric Blogger blog ID (visible in the blog URL in Blogger settings) |
| `blogger_removed` | `draft` | What happens to a post when its source poem is removed: `draft`, `delete`, or `keep` |
| `blogger_content` | `full` | Content posted to Blogger: `full` (complete styled HTML page) or `poem` (poem fragment only) |
| `blogger_label` | `poem` | Blogger label applied to all managed posts |
| `blogger_template` | `public/blogger-template.html` | Path to the Blogger XML theme template file injected by `npm run build:blogger` |

Example:

```
favicon=my-icon.png
subtitle=Warwick Allen's Poems
audiomack_artist=saltysojourner
skip_paths=public/poetic-logo.svg
auto_sync=true
sync_schedule=hourly
```

#### Favicon

The browser-tab icon defaults to `public/poetic-logo.svg`, which is included with the framework. To use a different icon, place your file in `public/` and set the `favicon` key:

```
favicon=my-icon.png
```

The build will then emit `<link rel="icon" href="my-icon.png" ...>` in both `index.html` and `all-poems.html`. Any file format the browser supports works (`svg`, `png`, `ico`, etc.).

To keep the default logo but prevent it being overwritten on the next framework sync, add it to `skip_paths`:

```
skip_paths=public/poetic-logo.svg
```

#### Subtitle

The subtitle shown below the site title on `index.html` defaults to `My Poems`. Override it with the `subtitle` key:

```
subtitle=Warwick Allen's Poems
```

### Publishing to Blogger

Poetic supports optional automatic publishing of poems to a Blogger blog. The feature is off by default and is enabled per-consumer via `.poetic-config`. See [`docs/BLOGGER.md`](BLOGGER.md) for the full setup guide, including one-time Google OAuth authorisation, GitHub secrets, and theme parity steps.
