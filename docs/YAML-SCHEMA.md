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
  audiomack:
    - url: https://audiomack.com/embed/...
      active: true
  suno: s/...
```

**Notes:**
- For `audiomack`: use array format with `url` and `active` fields
- For `suno`: use relative path format (e.g., `s/...` or `song/...`). The full URL will be automatically constructed by the template

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


