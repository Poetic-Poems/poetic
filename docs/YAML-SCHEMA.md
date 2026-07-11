# YAML Schema for Poems

This document describes the YAML schema for poem files.

## Required Fields

- `title`: String - The title of the poem
- `author`: String - The author's name
- `date`: String - The date in format "yyyy-mm-dd" (e.g., "2015-05-04")
- `versions`: Array - List of poem versions, each containing segments

**Note on Author Field:**
When using `.poem` source files, if the author line is omitted, the converter automatically defaults to `${author}`. If the `${author}` variable is defined (e.g., in `.shared.poem`), it will be expanded; otherwise, it remains as the literal text `${author}`. This ensures all YAML files have an author field.

## Content Fields

### Versions Format
```yaml
versions:
  - label: "Original poem (2015)"  # Optional: omit for unlabelled versions
    segments:
      - label: "[Verse 1]"  # Optional: omit for unlabelled segments
        lines: |
          Poem text with HTML markup where needed
          Line breaks preserved
      - lines: |
          Unlabelled segment text
      - label: "[Chorus]"
        lines: |
          More text
  - segments:  # Version without label
      - lines: |
          Another version's content
```

**Notes:**
- The version `label` field is optional. When omitted, the version will be rendered without a label.
- The segment `label` field is optional. When omitted, the segment will be rendered without a label.
- Each version contains its own `segments` list.

## Optional Fields

### Audio
```yaml
audio:
  audiomack: true
  suno: s/...
  mega:
    value: AbC1dEfG#h1Jk...
    media: video
    ratio: "21 / 9"
```

**Notes:**
- `audio` is a map of `<service>: <value>`, one entry per song line in the
  `.poem` source's Audio section. Each key is a **song-handler name** — a
  builtin (`audiomack`, `suno`, `mega`) or a service configured under
  `song_handlers:` in `.poetic-config.yaml` (e.g. `youtube`)
- The value is one of three forms:
  - `true` for a bare service line (presence only, e.g. `Audiomack`)
  - a **string** for a service line with a value (e.g. `suno: s/...` from
    `Suno: s/...`) — typically a relative path or ID that the handler's URL
    template expands into a full URL
  - a **map** `{ value, media?, ratio?, height? }` when the source line carried
    a trailing player-size parameter list (e.g. `Mega: <id>#<key> (video)`).
    `value` holds the id/path (or `true` for a bare line with params); `media`
    is `audio` or `video`; `ratio`/`height` are the raw author-supplied size
    overrides (normalised and validated at render time)
- Rendering (link vs. embedded player, URL construction, labels, player size)
  is driven entirely by the matching song handler, not by this schema — see
  [Custom song handlers](BUILD.md#custom-song-handlers) in `docs/BUILD.md`

### Postscript Notes
```yaml
postscript:
  - label: "Disclaimer"
    params:
      preview: "false"
    content: |
      <p>HTML content.</p>
```

The optional `params` field is a map of string keys and string values, representing the parameter list from the `.poem` source. For postscript notes, the common parameters are:

- `preview` (default `"true"`): whether to enable preview truncation for long notes
- `preview-lines` (default `"5"`): the number of lines to show in the preview before truncation

Example with all parameters:
```yaml
postscript:
  - label: "Origin"
    params:
      preview: "true"
      preview-lines: "8"
    content: |
      <p>Long note content...</p>
```

### Analysis (3 scenarios)

#### No Analysis
Omit the `analysis` field entirely.

#### Single Analysis
```yaml
analysis:
  full: |
    <h2>Analysis Title</h2>

    Analysis content with HTML markup. Use blank lines to separate paragraphs instead of <p> tags.

    The system will automatically convert blank lines to <p> tags in the final HTML.
```

#### Dual Analysis (Synopsis and Full)
```yaml
analysis:
  synopsis: |
    <h2>Synopsis Title</h2>

    Synopsis content. Use blank lines for paragraph breaks.

    No need for <p> tags in the YAML source.
  full: |
    <h2>Full Analysis Title</h2>

    Full analysis content with proper paragraph separation.

    HTML tags like <h3>, <h4> are preserved as-is.

    Only plain text paragraphs need blank line separation.
```

### Labels
```yaml
labels:
  - reflection
  - nature
```

`labels` is an array of strings, one per unique label in the poem's Metadata
section, de-duplicated and in first-seen order. Omitted entirely when the
Metadata section has no labels.

### Directives
```yaml
directives:
  - name: example.directive
    attributes:
      key: value
  - name: another.directive
```

`directives` is an array of objects, one per directive line in the poem's
Metadata section or Preamble, in source order — Preamble directives precede
Metadata directives (duplicates allowed - directives are not de-duplicated).
Each object has:

- `name`: String - the directive name
- `attributes`: Map of string keys to string values, parsed from the
  directive line's ` key:value` tokens. Omitted entirely from an entry
  whose directive has no attributes (there is no empty-map form).

Omitted entirely when the Metadata section has no directives.

## File Naming

Each poem's URL slug is its **source filename stem** — the basename of the `.poem` file
(and its generated `.yaml` counterpart), without the extension. The stem is normalised
using the same `slugify` rules applied throughout the build:

1. Convert to lowercase and trim whitespace
2. Remove all characters except letters, numbers, spaces, and hyphens
3. Replace one or more consecutive spaces with a single hyphen

To keep this normalisation a no-op, name source files in already-lowercase, hyphenated
form, e.g. `my-poem.poem` → `my-poem.yaml`.

The stem determines the poem's output paths:
- `public/my-poem/` — the standalone styled page
- `public/my-poem.html` — the redirect stub

The `title` field is display text only — it has no bearing on the slug or output paths.
Because filenames are unique on disk, two poems may share the same `title` without their
URLs colliding: each keeps its own filename stem and therefore its own page. The build
fails with an error if two source files normalise to the same slug.


