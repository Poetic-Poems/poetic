# Poem to YAML Converter

This script converts `.poem` files to YAML format based on the formal syntax specification in `poem-syntax.ebnf`.

## Usage

### Convert all .poem files in src/poems/poem/ directory

```bash
npm run build:yaml
```

This will convert all `.poem` files in the `src/poems/poem/` directory to corresponding `.yaml` files in `src/poems/yaml/`.

### Convert a single file

```bash
node src/tools/poem-to-yaml.js input.poem output.yaml
```

Or let it auto-generate the output filename:

```bash
node src/tools/poem-to-yaml.js input.poem
```

## Features

The converter handles all features defined in the `.poem` syntax specification:

### Header
- Title (mandatory)
- Author (optional, defaults to the value of the ${author} variable if omitted in YAML)
- Date in YYYY-MM-DD format (mandatory)

### Versions
- Multiple versions separated by `----` dividers
- Optional version labels with {% raw %}`{{ ... }}`{% endraw %}
- Segments with optional labels `{ ... }`
- Preserves all indentation and newlines in poem content

### Audio Section
- Generic `<Service>` (bare, presence only) or `<Service>: <value>` lines, one
  per song — the service name becomes a lower-cased key in the YAML `audio`
  map (e.g. `Audiomack` → `audiomack: true`, `Suno: s/xyz` → `suno: "s/xyz"`)
- `Audiomack` and `Suno` ship as builtin services; other services (`YouTube`,
  `Spotify`, ...) are recognised once a matching handler is added under
  `song_handlers:` in `.poetic-config.yaml` — see
  [Custom song handlers](BUILD.md#custom-song-handlers) in `docs/BUILD.md`

### Postscript Notes
- Multiple postscript notes separated by `----` dividers
- Optional labels for each note
- Multiple paragraphs per note (collapsed newlines, preserved paragraph breaks)
- Literal blocks with `<<<` ... `>>>` (including `$ref` references)

### Analysis
- Optional synopsis section with `{Synopsis}`
- Optional full analysis section with `{Full}`
- Markdown-style headings: `#` → `<h3>`, `##` → `<h4>`, `###` → `<h5>`
- Collapsed newlines within paragraphs, preserved paragraph breaks

### Metadata
A bottom `====`-delimited Metadata section, after Analysis, produces the
`labels` and `directives` YAML fields:
- A `#label` line adds `label` to `labels` (de-duplicated, first-seen order)
- A `%directive.name key:value ...` line adds `{ name, attributes? }` to
  `directives` (source order, duplicates allowed; `attributes` is omitted
  when the directive has no ` key:value` tokens). A directive line may also
  appear in the Preamble, before the header — directives found there are
  added to `directives` ahead of any found in the Metadata section
- A `# comment` line (`#` followed by whitespace) is ignored
- See `docs/YAML-SCHEMA.md` for the exact shapes and `poem-syntax.ebnf` for
  the authoritative line-matching patterns

### Inline Markup
Converts text markup to HTML entities:

| Source | Output |
|--------|--------|
| `_text_` | `<em>text</em>` |
| `*text*` | `<strong>text</strong>` |
| `~~text~~` | `<s>text</s>` |
| `[text\|url]` | `<a href="https://url">text</a>` |
| `` `text` `` | `&#8216;text&#8217;` (smart single quotes) |
| `"text"` | `&#8220;text&#8221;` (smart double quotes) |
| `--` | `&#8211;` (en dash) |
| `---` | `&#8212;` (em dash) |
| `&` | `&#38;` |
| `'` | `&#39;` |

Escaped characters with `\` are preserved as literals, including `\%` → `%`
(so a title may start with a literal `%` without being read as a Preamble
directive) — except `\%{…}`, which is left untouched, since `\%{name}`
remains the render-time context-variable literal escape.

### Comment Blocks
Comment blocks delimited by `<<#` ... `#>>` are automatically removed during parsing.

### Variables
The converter resolves author variables while producing YAML:
- Single-line variables: `={token}= value`
- Multi-line variables: `={token}<<= ... =>>`
- Substitution: `${token}`, with a `${token:-default}` fallback and a `\${...}`
  escape. Nested references are resolved at use (dynamic binding) and are
  substituted inside literal blocks (a block suppresses Markdown, not
  substitution).

Build-time context references (`%{slug}`, `%{title}`, `%{author}`, `%{date}`)
use a `%` sigil and are left untouched here; they are resolved later, at the
render stage. See `docs/POEM-SYNTAX.md` and `src/poems/poem/_example.poem` for
complete variable documentation.

## Incremental rebuild

When running `npm run build:yaml` or `node src/tools/poem-to-yaml.js --all`, the converter
skips `.poem` files that have not changed (incremental rebuild). A poem is considered
out of date if any of its dependencies (the `.poem` file or the shared `.shared.poem`
file in the same directory) have been modified more recently than its `.yaml` output.

To force a rebuild of all poems regardless of modification time, pass the `--force` flag:

```bash
npm run build:yaml -- --force
# or
node src/tools/poem-to-yaml.js --all --force
```

You can also set the `POETIC_FORCE_REBUILD` environment variable instead:

```bash
POETIC_FORCE_REBUILD=1 npm run build:yaml
```

Incremental rebuilds significantly speed up the build process for large poem collections,
especially during development when only a few poems have changed between builds.

## Implementation Notes

- The parser removes comment blocks before processing
- All section delimiters (`====`) are expected in their specified positions
- Blank lines before/after structural elements are normalized
- The converter uses the `js-yaml` library for YAML generation
- Line numbers and positions are tracked for better error reporting

## Related Files

- `poem-syntax.ebnf` - Formal EBNF grammar specification
- `docs/POEM-SYNTAX.md` - Human-readable syntax documentation
- `src/poems/poem/_example.poem` - Complete example demonstrating all features
- `src/poems/yaml/_example.yaml` - Expected YAML output for the example

