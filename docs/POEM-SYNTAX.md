# Poem File Format Syntax Specification

This document provides a human-readable guide to the formal EBNF grammar defined in `poem-syntax.ebnf`.

**Implementation Note**: Variable substitution and all other features defined in this specification have been implemented in `src/tools/poem-to-yaml.js`.

## File Extension

`.poem`

## Overview

A poem file consists of the following sections in strict order:

0. **Preamble** (optional) - Variable definitions and blank lines before the header
1. **Header** (mandatory)
2. **Versions** (mandatory, at least one)
3. **Audio** (optional)
4. **Postscript** (optional)
5. **Analysis** (optional)

**Note:** Dividers (`----` and `====`) are only required if there is subsequent non-empty content. If the parser reaches the end of the file, all remaining sections are assumed to be empty.

## 0. Preamble Section

The preamble is an optional section at the very beginning of the file that may contain:

- Variable definitions (both single-line and multi-line)
- Blank lines
- Comment blocks

This allows you to define variables that can be used in the header (title/author) and throughout the rest of the poem.

### Shared Variables (.shared.poem)

The `poem-to-yaml.js` converter automatically prepends the contents of `.shared.poem` (if it exists in the same directory) to each `.poem` file before processing. This allows you to define common variables that are available to all poems without repeating them in each file.

`.shared.poem` is **user-owned** — it is not overwritten by `sync-framework.sh`. Customise it freely (e.g. set `={author}=Your Name`).

**Example `.shared.poem`:**
```
={disclaimer}<<=
<<<
  - $ref: "_shared.yaml#/disclaimer"
>>>
=>>
```

All `.poem` files in the same directory can then use `${disclaimer}` without defining it themselves.

### Example

```
={poem_title}=The Journey Home
={author_name}=A Poet

${poem_title}
${author_name}
2025-01-15

{Verse 1}
These are the poem lines...
```

## 1. Header Section

The header appears at the beginning of the file and consists of:

```
<Title>
[<Author>]
<Date>
```

### Fields

- **Title** (mandatory): The title of the poem (any text, may include variable references)
- **Author** (optional): The author's name. If omitted, defaults to `${author}` which will be expanded if the variable is defined, or left as the literal text `${author}` if not (may include variable references)
- **Date** (mandatory): Must be in format `YYYY-MM-DD` (e.g., `1970-01-01`) after variable substitution

### Example

```
Example Poem
A Poet
1970-01-01
```

### Example with Variables

```
={poem_title}=My Journey
={year}=2025

${poem_title}
A Poet
${year}-01-15
```

## 2. Versions Section

Contains one or more versions of the poem, separated by `----` dividers.

### Structure

{% raw %}
```
[{{ <Version Label> }}]

[{<Segment Label>}]
<Poem lines>

[{<Segment Label>}]
<Poem lines>

----

[{{ <Version Label> }}]
...
```
{% endraw %}

### Rules

- Each version must contain at least one segment
- Version labels are optional (wrapped in {% raw %}`{{ }}`{% endraw %})
- Segment labels are optional (wrapped in `{ }`)
- Leading and trailing whitespace in labels is trimmed
- Poem lines preserve all newlines and indentation (including leading spaces/tabs)
- Versions are separated by `----` (exactly 4 hyphens) only if there is a subsequent version
- The section ends with `====` (exactly 4 equals signs) only if there are subsequent non-empty sections
- Any text after labels, dividers, or markers on the same line is ignored (allows inline comments)
- Optional parameter lists may appear after a label (see [Block Parameters](#3b-block-parameters))

### Example

{% raw %}
```
{{ Version 1 }}  # Original version

{Stanza 1}  # Opening stanza
These are the lines
   With some indentation
Of stanza 1

These are the lines
Of stanza 2

----  # Version separator

{{ Version 2 (song arrangement) }}  # Modified for performance

{Verse 1}  # First verse
First verse lines

====  # End of versions section
```
{% endraw %}

Note: The text after `#` in the example above is ignored by the parser, allowing for inline comments.

## 3. Audio Section

Section for audio links. The section and its markers are optional if empty.

### Structure

```
[Audiomack]
[Suno: <url-path>]

====
```

### Rules

- **Audiomack**: The word "Audiomack" on its own line indicates presence of an Audiomack link
- **Suno**: Format is `Suno: ` followed by a URL path (e.g., `s/SongLink12345678` or `song/uuid`)
- Both lines are optional; if neither is present, the section will be empty
- The `====` end marker is only required if there are subsequent non-empty sections
- Any text after the end marker on the same line is ignored

### Example

```
Audiomack
Suno: s/SongLink12345678

====
```

## 3b. Block Parameters

Block-labelled lines — version labels ({% raw %}`{{ ... }}`{% endraw %}), segment labels (`{ ... }`), and postscript labels (`{ ... }`) — may be followed by an optional parameter list in parentheses:

```
{Label Name}(key=value, another-key="quoted value")
{Postscript}(preview=false)
{{ Version 1 }}(color=blue, icon=star)
```

### Syntax

- Parameters appear immediately after the closing brace(s), with optional whitespace between them: `}(...)`, `}}(...)`
- Whitespace is allowed around `(`, `)`, `=`, `,`, and around keys and values — these are all stripped
- Keys consist of a letter followed by any number of letters, digits, hyphens, or underscores (e.g., `preview`, `preview-lines`, `my_key`)
- Values may be quoted (`'...'` or `"..."`) or unquoted
  - Quoted values run to the matching closing quote and may contain the other quote character, commas, and closing parentheses verbatim; the delimiting quote character cannot appear inside
  - Unquoted values run to the next `,` or `)` and are trimmed of leading/trailing whitespace
- Variable substitution follows shell-style quoting rules:
  - In unquoted values and double-quoted values, `${variable_name}` is expanded
  - In single-quoted values, `${variable_name}` remains literal
- If the trailing `(...)` is not a valid parameter list, it is ignored (allowing `(parenthetical remarks)` after a label to pass through)

### Example

```
={want preview}=false

{Postscript 1}(preview=${want preview}, preview-lines=10)
This is a long postscript note...

{Postscript 2}(preview=false)
This note will never be truncated.

{{ Version 1 (original) }}
```

With the variable `={want preview}=false`, the first postscript expands to `preview=false, preview-lines=10`.

## Postscript Preview

Postscript labels accept two optional parameters: `preview` (default `true`) and `preview-lines` (default `5`).

- When `preview` is enabled, a long postscript note is truncated to the specified number of rendered lines with a "See more ⮟" / "See less ⮝" toggle to expand and collapse it
- If the content hidden by truncation would be one line or less, the preview is disabled and the note displays in full with no toggle control
- Set `preview=false` to disable the preview for that note and always display it in full

### Example

```
{Origin}(preview-lines=3)
This long postscript note will be shown in a preview that expands to 3 lines.
...

{Technical Notes}(preview=false)
This note is always shown in full, never truncated.
```

## 4. Postscript Section

Section for postscript notes. The section and its markers are optional if empty.

### Structure

```
[{<Postscript Label>}]
<Content paragraph>

<Content paragraph>

----

[{<Postscript Label>}]
<Content paragraph>

[Literal blocks]

====
```

### Rules

- Multiple postscript notes separated by `----` (exactly 4 hyphens) only if there is a subsequent note
- Each note can have an optional label (wrapped in `{ }`) and an optional parameter list (see [Block Parameters](#3b-block-parameters))
- Note prose is rendered as **GitHub-Flavoured Markdown** (see [Markdown Sections](#markdown-sections-analysis-postscript-and-markdown-blocks)), so lists, tables, headings, fenced code and blockquotes are all available
- Literal blocks (raw `<<<`/`>>>` and `$ref` blocks) can appear between or after notes and are passed through unchanged
- The `====` end marker is only required if there are subsequent non-empty sections
- Any text after labels, dividers, markers, or literal block delimiters on the same line is ignored

### Literal and Markdown Blocks

A block is delimited by a start marker (`<<<`, optionally followed by a tag word)
and an end marker (`>>>`), each anchored to the start of a line:

```
<<<
<arbitrary content>
>>>
```

The tag selects how the block is processed:

- **`<<<`** (no tag, or any unrecognised tag such as `<<<yaml`): a **literal
  block**. Content is passed through exactly as written — no markup conversion and
  no variable substitution. Use this for raw HTML, interactive widgets, or a
  `$ref` payload.
- **`<<<markdown`** (or **`<<<md`**): a **Markdown block**. Content has variables
  substituted and is then rendered as GitHub-Flavoured Markdown. This is how you
  opt into Markdown outside the analysis/postscript sections — for example, to drop
  a table or list into the middle of a poem segment (see
  [Markdown Sections](#markdown-sections-analysis-postscript-and-markdown-blocks)).

Rules:

- Markers must be at the start of a line
- Any text after a marker on the same line is ignored
- Literal-block content is never processed; Markdown-block content is rendered as GFM

### Example

```
{Postscript 1}(preview-lines=8)
Something to note.

----

This is another note
without a label.

This note has two paragraphs.

----

<<<
  - $ref: "_shared.yaml#/disclaimer"
>>>

====
```

## 5. Analysis Section

Section for poem analysis. The section may be empty. Can have two forms:

### Form 1: Single Analysis

```
{Full}

<Analysis content>

====
```

### Form 2: Synopsis and Full Analysis

```
{Synopsis}

<Synopsis content>

{Full}

<Full analysis content>

====
```

### Rules

- If `{Synopsis}` is present, `{Full}` **must** also be present
- `{Full}` can appear on its own without `{Synopsis}`
- Content is rendered as **GitHub-Flavoured Markdown** (see [Markdown Sections](#markdown-sections-analysis-postscript-and-markdown-blocks))
- The `====` end marker is optional - only required if followed by ignored content (comments)
- Any text after analysis labels or the end marker on the same line is ignored

### Heading Levels

Markdown headings are offset by +2 so they nest under the page's `<h2>` analysis
title (and never emit an `<h1>`):

- `# Text` → `<h3>`
- `## Text` → `<h4>`
- `### Text` → `<h5>`
- `#### Text` → `<h6>` (deeper headings are clamped at `<h6>`)

### Example

```
{Synopsis}

This is where the synopsis goes.

Another paragraph.

# Section Heading

Some more text here.

{Full}

This is the full analysis.

## Sub-Section Heading

More detailed content.

====
```

## 6. Comment Blocks

Comment blocks allow you to include notes that won't appear in the output:

```
<<#
This is a comment
It can span multiple lines
#>>
```

### Rules

- Start marker: `<<#` (must be at start of line)
- End marker: `#>>` (must be at start of line)
- Any text after the markers on the same line is ignored
- Comment blocks can appear anywhere in the file
- Content is completely removed during parsing

### Example

```
{Verse 1}
These are poem lines

<<# This is a note to myself
Don't forget to revise this verse
#>>

{Verse 2}
More poem lines
```

## 7. Variables

Variables allow you to define reusable text snippets that can be substituted throughout your poem file.

### Variable Definition Syntax

#### Single-Line Variables

Single-line variable definitions follow this format:

```
={variable_name}= value text here
```

The variable name must:
- Start with a letter or digit
- Not contain `{`, `}`, `$`, `<`, `>` characters
- Not end with a space

Everything after the second `=` becomes the variable's value (whitespace is preserved).

**Example:**

```
={My token!}= (some text)
Here is${My token!}.
```

**Output:**

```
Here is (some text).
```

#### Multi-Line Variables

Multi-line variable definitions follow this format:

```
={variable_name}<<= Anything after the second "=" is ignored
variable content
can span multiple lines
=>> Anything after the second ">" is also ignored
```

The content between the opening `}<<=` and closing `=>>` markers becomes the variable's value. The final newline before the closing marker is not included. Any text after the `=` on the opening line or after the second `>` on the closing line is ignored, allowing for inline comments.

**Example:**

```
={My token!}<<= Comment here is ignored
 (some text)
 with multiple lines
=>> Comment here is also ignored
Here is${My token!}.
```

**Output:**

```
Here is (some text)
 with multiple lines.
```

### Variable Substitution

To use a variable's value, reference it with the substitution syntax:

```
${variable_name}
```

### Variable Rules

1. **Definition Location**: Variables can be defined anywhere in the file, including in the preamble before the header, except inside literal blocks or multi-line variable blocks.

2. **Scope**: Variables are file-scoped.

3. **Forward References**: If a variable is used before it is defined, no substitution occurs. The text `${undefined}` will remain as literal text in the output. Parsers should emit a warning when this occurs, but should not raise an exception.

4. **Redefinition**: Variables may be redefined. The old value will be clobbered.

5. **Output**: Variable definition lines do not appear in the output. They do not count as content lines in their containing section.

6. **Nesting**: Variables may be nested. A variable definition may include a `${...}` reference. The inner variable reference will be substituted when the outer variable is defined (not when the outer variable is used). Nesting may be of any depth.
   - Example: If `={a}=foo`, and later `={b}=${a}bar`, and later `={c}=${b}baz`, then `${c}` expands to `foobarbaz`.
   - Self-reference: If `={a}=foo`, and later `={a}=${a}bar`, then `${a}` expands to `foobar`.

7. **Processing Order**: Variables are processed for markup after substitution.

8. **Literal Blocks**: Variables cannot be used inside literal blocks.

9. **Structural Blocks in Multi-Line Variables**: Multi-line variables may contain structural elements such as literal blocks (`<<<...>>>`), comment blocks (`<<#...#>>`), and other markers. When a standalone variable reference (e.g., `${variable}` on its own line) is expanded, these structural elements are properly recognised and parsed.

10. **Whitespace Retention**:
   - For single-line variables, everything after the second `=` is included in the variable's value.
   - For multi-line variables, everything after the newline character of the start tag line up to just before the final newline character before the close tag line is included.

11. **Usage in Labels**: Variables may be used inside labels (both {% raw %}`{{...}}`{% endraw %} and `{...}` labels).

### Complete Example

{% raw %}
```
={author}=A Poet
={poem_title}=My Journey

${poem_title}
${author}
2025-01-15

={verse1}<<=
These are lines
Of the first verse
=>>

{{ Version by ${author} }}

{Verse 1}
${verse1}

====

={disclaimer}<<=
<<<
  - $ref: "_shared.yaml#/disclaimer"
>>>
=>>
${disclaimer}

====
====
====
```
{% endraw %}

This demonstrates:
- Defining variables in the preamble (before the header)
- Using variables in the header (title and author)
- Using variables in labels and content
- Multi-line variables
- The `${disclaimer}` variable contains a literal block, which is properly expanded and parsed when the variable is used

## 8. Inline Markup

The **poem body** and **labels** use a Markdown-like inline dialect (the
"WYSIWYG" dialect): literal line breaks and indentation are preserved, and the
markup below is applied. This is distinct from the **analysis** and
**postscript** sections and `<<<markdown>>>` blocks, which are rendered as full
GitHub-Flavoured Markdown (see [Markdown Sections](#markdown-sections-analysis-postscript-and-markdown-blocks)).

Emphasis uses Markdown conventions in **every** section, so `*`/`**` mean the
same thing everywhere.

### Basic Formatting

| Syntax | Output |
|--------|--------|
| `*text*` or `_text_` | `<em>text</em>` (italic) |
| `**text**` or `__text__` | `<strong>text</strong>` (bold) |
| `~text~` | `<s>text</s>` (strikethrough; in Markdown sections use `~~text~~`) |

### Links

| Syntax | Output |
|--------|--------|
| `[text\|url]` | `<a href="https://url">text</a>` |

### Span Elements

| Syntax | Output |
|--------|--------|
| `/.classname{text}` | `<span class="classname">text</span>` |

Span elements allow you to apply custom CSS classes to inline text. The class name must match the pattern `/^\w(?:[\w\.-]*\w)?$/`, which allows:
- Single word characters: `c`, `x`, `1`
- Multiple classes: `class1.class2`, `highlight.bold`
- Hyphenated names: `text-highlight`, `my-class`

**Special cases:**
- Empty class name `/.{text}` produces `<span>text</span>` (with a warning)
- Invalid class names are left unchanged (with a warning)
- Empty content `/.class{}` produces `<span class="class"></span>`

**Examples:**
```
/.highlight{important text}
/.red.bold{multi-class styling}
/.note{This can contain *bold* and _italic_ markup}
```

### Smart Quotes and Punctuation

| Syntax | Output |
|--------|--------|
| `` `text` `` | `&#8216;text&#8217;` (smart single quotes) |
| `"text"` | `&#8220;text&#8221;` (smart double quotes) |
| `--` | `&#8211;` (en dash) |
| `---` | `&#8212;` (em dash) |
| `&` | `&#38;` (ampersand entity) |
| `'` | `&#39;` (apostrophe entity) |

### Escaped Characters

Use backslash to prevent markup conversion:

| Syntax | Output |
|--------|--------|
| `\_` | `_` |
| `\*` | `*` |
| `\~` | `~` |
| `\[` | `[` |
| `` \` `` | `` ` `` |
| `\"` | `"` |
| `\&` | `&` |
| `\'` | `'` |
| `\-` | `-` |
| `\<` | `<` |
| `\>` | `>` |
| `\=` | `=` |
| `\$` | `$` |
| `\/` | `/` |
| `\{` | `{` |
| `\}` | `}` |
| `\\` | `\` |

### Markup Rules

1. **Nesting**: Markup can be nested (e.g., `` `[**_text_**\|url]` ``, `/.c{*text*}`)
2. **Paragraph Boundaries**: Markup pairs (`_`, `*`, `~`, `` ` ``, `"`, and span elements) match across lines within a paragraph but **not** across paragraph boundaries
3. **Unmatched Pairs**: If a pair is not matched, it remains as literal text
4. **Context**: This WYSIWYG inline dialect applies in:
   - Poem segment content
   - Labels (version and segment labels)

   The **analysis** and **postscript** sections, and `<<<markdown>>>` blocks, are
   instead rendered as full GitHub-Flavoured Markdown (see
   [Markdown Sections](#markdown-sections-analysis-postscript-and-markdown-blocks)).

## Markdown Sections (Analysis, Postscript, and Markdown Blocks)

Some content is rendered as full **GitHub-Flavoured Markdown** (GFM) rather than
with the WYSIWYG inline dialect. GFM applies:

1. **By default** in the **analysis** section and **postscript** note prose.
2. **On demand** anywhere else, inside a `<<<markdown` … `>>>` block (the markers
   must be at the start of a line). This lets you embed a list, table, fenced code
   block, etc. into a poem segment while the surrounding lines stay WYSIWYG.

GFM is rendered with [markdown-it](https://github.com/markdown-it/markdown-it)
(`html: true`, `typographer: true`); the renderer lives in `src/tools/markdown.js`.
This means GFM sections support the full feature set: ATX headings, ordered and
unordered (and nested) lists, tables, fenced code, blockquotes, `~~strikethrough~~`,
`` `inline code` ``, `[links](url)`, raw HTML, and so on.

Notes:

- **Emphasis** is the same as the WYSIWYG dialect: `*`/`_` = italic, `**`/`__` = bold.
- **Typography** is automatic: `--` → en dash, `---` → em dash, `...` → ellipsis,
  and straight quotes become curly quotes.
- **Headings** are offset by +2 (`#` → `<h3>`), as described under
  [Analysis → Heading Levels](#heading-levels).
- **Variables** (`${name}`) are substituted before rendering, including inside
  `<<<markdown>>>` blocks (but **not** inside raw `<<<` literal blocks).
- The structural tokens `====`, `----`, `{Synopsis}`, `{Full}`, and postscript
  labels are still recognised and are **not** part of the Markdown content.

For a single file that exercises every feature, see
[`_example.poem`](../src/poems/poem/_example.poem).

## 9. Minimal File Structure

The absolute minimal valid poem file looks like this:

```
Title
1970-01-01

{Verse}
Some lines
```

That's it! All dividers are optional if there's no subsequent content.

You can also include variables in a preamble before the header:

```
={title_var}=My Poem Title

${title_var}
1970-01-01

{Verse}
Some lines
```

If you have audio but no postscript or analysis:

```
Title
1970-01-01

{Verse}
Some lines

====

Audiomack
Suno: s/SongLink12345678
```

If you want to add comments after all sections, you must include a final `====` delimiter before the comments:

```
Title
1970-01-01

{Verse}
Some lines

====

<<# Comment about this poem
This won't appear in the output
#>>
```

## 10. Structural Rules

### Line Anchoring

The following elements **must** appear at the start of a line (column 0):

- Dividers: `----`
- End markers: `====`
- Version labels: {% raw %}`{{ ... }}`{% endraw %}
- Segment labels: `{ ... }`
- Literal block markers: `<<<`, `>>>`
- Comment block markers: `<<#`, `#>>`
- Variable definitions: `={...}=`, `={...}<<=`, `=>>`

**Trailing Text Rule**: Any text after a line-anchored token on the same line is ignored. This allows for inline comments and notes. This applies to:
- Dividers (`----`)
- End markers (`====`)
- Version labels ({% raw %}`{{ ... }}`{% endraw %})
- Segment labels (`{ ... }`)
- Postscript labels
- Analysis labels (`{Synopsis}`, `{Full}`)
- Literal block markers (`<<<`, `>>>`)
- Comment block markers (`<<#`, `#>>`)
- Multi-line variable markers (`={...}<<=`, `=>>`)

**Exception**: Single-line variable definitions (`={...}=value`) are excluded from this rule, as everything after `}=` is the variable value (intentional content, not ignored text).

### Whitespace Handling

- **Poem segments**: All newlines and indentation (spaces/tabs) are preserved exactly
- **Postscript notes** and **analysis sections**: whitespace follows GitHub-Flavoured Markdown rules (single newlines are soft breaks; blank lines separate blocks)
- **Blank lines**: Any number of blank lines before/after dividers, markers, and labels are normalized (have no effect on output)

### Indentation and Space Preservation in Poem Segments

Indentation and multiple spaces are preserved in poem segments by automatically converting them to non-breaking space entities (`&nbsp;`):

- **Leading spaces** (indentation) are converted entirely to `&nbsp;` to maintain consistent indentation
- **Multiple consecutive spaces** (2 or more) within lines are converted using a pattern that allows text wrapping on small displays:
  - The first space remains a normal space (allows line wrapping)
  - Subsequent spaces are converted to `&nbsp;`
  - Example: `  ` (2 spaces) becomes ` &nbsp;` (space + nbsp)
- Single spaces between words are left as regular spaces

**Example:**

```
{Verse}
Line one
   Indented line two
      More indented line three
Line with  multiple  spaces
```

Converts to:

```yaml
- label: Verse
  lines: |
    Line one
    &nbsp;&nbsp;&nbsp;Indented line two
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;More indented line three
    Line with &nbsp;multiple &nbsp;spaces
```

**Note:** You can also manually use `&nbsp;` in your `.poem` files if needed, and they will be preserved as-is. The alternating pattern (normal space + `&nbsp;`) ensures that text can wrap at appropriate points on small displays while still preserving the visual spacing.

## Blockquotes and Hard Line Breaks

The Poem format supports two Markdown-like features to control presentation:

- **Blockquotes**: Any line that begins with optional indentation followed by a `>` character (that is, `/^\s*>/`) is treated as a blockquote line. Contiguous runs of such lines are grouped into a single blockquote. For each line in the quote the leading indentation and the `>` (plus one optional following space) are removed and the inner text is processed for inline markup. Lines that are only `>` (possibly surrounded by spaces) are preserved as empty quote lines inside the blockquote.

  Example:

  ```
  {Verse}
    > This is a quoted line
    >
    > This is another quoted line
  ```

  Produces a single `<blockquote>` containing the three quote lines (the empty `>` line becomes an internal blank line within the blockquote).

- **Hard line breaks (trailing double-space)**: If a line ends with two or more spaces, that trailing run of spaces is converted into a hard line break (`<br/>`). This behavior is applied in poem segments and analysis sections but is not applied inside literal blocks (delimited by `<<<`/`>>>`).

  Example:

  ```
  {Verse}
  Line one with a break.  
  Line two follows after a hard break.
  ```

  The first line will contain a `<br/>` at its end so the rendered output breaks where the two spaces were placed.

Note: To avoid accidental removal of meaningful trailing spaces, maintenance scripts that strip trailing whitespace should exclude `.poem` files. The included script `scripts/remove-trailing-spaces.sh` skips `.poem` files.

## 11. Complete Example

See `_example.poem` for a complete example file demonstrating all features.

## 12. Formal Grammar

For the complete formal specification, see `poem-syntax.ebnf`, which defines the grammar in Extended Backus-Naur Form (EBNF).
