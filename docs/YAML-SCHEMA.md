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
    content: |
      <p>HTML content.</p>
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

### Analysis Content Formatting

The analysis system now uses blank lines instead of `<p>` tags for paragraph separation:

**✅ Correct Format:**
```yaml
analysis:
  full: |
    <h3>Section Title</h3>

    This is paragraph one. No <p> tags needed.

    This is paragraph two. Just use blank lines.

    <h3>Another Section</h3>

    More content here.
```

**❌ Old Format (deprecated):**
```yaml
analysis:
  full: |
    <h3>Section Title</h3>
    <p>This is paragraph one with <p> tags.</p>
    <p>This is paragraph two with <p> tags.</p>
```

**Key Points:**
- Use blank lines (double newlines) to separate paragraphs
- HTML tags like `<h3>`, `<h4>`, `<h2>` are preserved as-is
- The build system automatically converts blank lines to `<p>` tags in the final HTML
- This makes YAML files cleaner and easier to edit
- No need to manually add `<p>` and `</p>` tags

## File Naming

YAML files should be named using a URL-friendly version of the title with `.yaml` extension:
- `title: "My Poem"` → `my-poem.yaml`

The build script will automatically generate a slug from the title and create:
- `public/my-poem.html`

**Note:** The slug is automatically calculated from the title using the same logic as the `slugify` function in the Pug template:
1. Convert to lowercase and trim whitespace
2. Remove all characters except letters, numbers, spaces, and hyphens
3. Replace one or more consecutive spaces with a single hyphen


