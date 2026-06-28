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

These utilities ensure consistent date handling across the build process and support migration from the old date format.

#### Blogger Template Script (`src/tools/build-blogger.js`)

The Blogger template script:

1. Reads and concatenates CSS from `public/poetic.css` and `public/custom.css`
2. Locates the Blogger template file `public/fragments-and-unity.template.html`
3. Finds CSS delimiters `/* ~~ CUSTOM CSS START ~~ */` and `/* ~~ CUSTOM CSS END ~~ */`
4. Replaces the content between these delimiters with the combined styles
5. Provides error handling for missing files or malformed delimiters
6. Updates the template file in place for uploading to Blogger

#### Raw extraction script (`src/tools/poem-to-raw.js`)

The `poem-to-raw` script extracts the plain text body from `.poem` source files and writes them to the `raw/` directory at the repository root. It mirrors the legacy `scripts/poem-to-raw.sh` behaviour (skips partial files, removes comments and front-matter delimiters, and normalises common HTML entities). Run it standalone with `npm run poem-to-raw` or let the main `build` sequence invoke it automatically.

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

### Date Format Migration

The build system has been updated to use ISO date format (`yyyy-mm-dd`) in YAML files instead of the previous display format (`DayOfWeek, DD Month YYYY`). This change provides:

- **Better sorting**: ISO format sorts correctly as strings
- **Easier editing**: Standardised format is easier to work with
- **Backward compatibility**: The date utility functions handle both formats during migration

**Migration completed**: All poem YAML files have been updated to use the new ISO date format.

### File Structure

```
public/
├── index.html                           # Main landing page
├── all-poems.html                       # Generated concatenated view
├── poetic.css                           # Framework CSS (synced from poetic)
├── custom.css                           # User CSS (never overwritten by sync)
├── fragments-and-unity.template.html    # Blogger template with injected CSS
├── poem1.html                           # Individual poems
├── poem2.html
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
├── poem-to-yaml.js                      # Converter script
├── serve-static.js                      # Development server
└── ...
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
| `skip_paths` | _(none)_ | Comma-separated list of framework paths to skip during sync |
| `auto_sync` | _(off)_ | Set to `true` to enable the hourly scheduled sync workflow |
| `sync_schedule` | `weekly` | How often the scheduled sync runs: `hourly`, `daily`, or `weekly` |

Example:

```
favicon=my-icon.png
subtitle=Warwick Allen's Poems
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
