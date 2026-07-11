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
6. **Metadata** (optional)

**Note:** Dividers (`----` and `====`) are only required if there is subsequent non-empty content. If the parser reaches the end of the file, all remaining sections — including Metadata — are assumed to be empty.

**Extensibility:** This section order is open to extension by Poetic's maintainers at any time, by defining a new `====`-delimited section at the bottom of the file, after Metadata. Poem authors and downstream tools should tolerate — and pass through unchanged — any trailing `====`-delimited section they do not recognise.

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

Section for song links and embedded players. The section and its markers are optional if empty.

### Structure

```
[<Service>]
[<Service>: <value>]
[<Service>: <value> (<params>)]

====
```

### Rules

- Each line names a **service** — a single identifier token (a letter, then any
  number of letters, digits, hyphens, or underscores) — either bare
  (`Audiomack`) to indicate presence with no extra value, or followed by
  `: <value>` (`Suno: s/SongLink12345678`) to supply a value such as a URL path
  or track ID. Whitespace around the colon is trimmed
- Service names are case-insensitive; the service becomes a lower-cased key in
  the poem's YAML `audio` map
- **Audiomack**, **Suno**, and **Mega** ship as builtin services, resolved by
  handlers defined in the framework's `src/song-handlers.yaml`. Any other
  service (e.g. `YouTube`, `Spotify`) is rendered once a matching handler is
  added under `song_handlers:` in `.poetic-config.yaml` — see
  [Custom song handlers](BUILD.md#custom-song-handlers) in `docs/BUILD.md`
- A service with no matching handler at build time is skipped, with a build
  warning, rather than failing the build
- Lines are optional and may appear in any order; if none are present, the
  section is empty
- A service line may end with an optional **parameter list** in parentheses
  (see [Player size and media type](#player-size-and-media-type) below). It must
  be separated from the value by whitespace so it is not read as part of the
  value
- Any line that does not match the `<Service>`, `<Service>: <value>`, or
  `<Service>: <value> (<params>)` form ends the audio section (matching the
  trailing-content rule used elsewhere when a `====` marker is missing)
- The `====` end marker is only required if there are subsequent non-empty
  sections
- Any text after the end marker on the same line is ignored

### Value overrides and pasted URLs

A bare `Audiomack` line (no value) plays the poem's own URL slug — the source
filename stem, e.g. `my-poem.poem` → `my-poem`. That is usually also the song's
Audiomack slug, but not always: if a poem's filename was disambiguated from
another poem sharing its title (see [Standalone poem pages and redirect
stubs](BUILD.md#standalone-poem-pages-and-redirect-stubs) in `docs/BUILD.md`),
the two slugs can diverge, and the bare line then plays the wrong song. Give an
explicit value to override it:

```
Audiomack: my-shepherd
```

overrides just the song slug (the configured artist is unchanged), while

```
Audiomack: my_other_account/song/my-shepherd
```

overrides both artist and slug. Either form also accepts a full pasted
Audiomack URL (`https://audiomack.com/embed/my_other_account/song/my-shepherd`)
— as much of the URL as is given is used, and the rest is inferred.

The same "paste any amount of the tail of the URL" leniency applies to the
other builtins:

- **Suno** — `Suno: s/SongLink12345678` and `Suno: song/<uuid>` both work as
  before; a bare 16-character ID (`Suno: SongLink12345678`) infers the `s/`
  form, and a bare UUID (`Suno: 8f14e45f-…`) infers the `song/` form. A full
  `https://suno.com/…` URL is also accepted
- **Mega** — a full share link
  (`Mega: https://mega.nz/file/AbC1dEfG#h1JkLmN0pQ…`) is reduced to the
  `<id>#<key>` identifier automatically, alongside the plain identifier form
  documented below

A custom handler (see [Custom song handlers](BUILD.md#custom-song-handlers) in
`docs/BUILD.md`) can define this same inference for its own service via
`value_patterns`.

### MEGA

The builtin **Mega** service embeds a [MEGA.nz](https://mega.nz) media player
directly on the page. It plays **both audio and video** files (with normal,
picture-in-picture, and full-screen playback) and works on GitHub Pages and
Blogger.

The value is the identifier from a public MEGA file link — the part after
`https://mega.nz/file/`, i.e. `<id>#<key>`:

```
Mega: AbC1dEfG#h1JkLmN0pQrStUvWxYz0123456789AbCdEfGh
```

### Player size and media type

An embed line may carry a trailing parameter list to set the player's size and
media type. It reuses the same `(key=value, …)` syntax as
[block parameters](#3b-block-parameters), plus an optional leading bare
`audio` / `video` token:

| Parameter form         | Effect                                                        |
|------------------------|---------------------------------------------------------------|
| `(audio)` / `(video)`  | Select the handler's standard audio or video size profile     |
| `(ratio=16/9)`         | Size by an explicit aspect ratio (`/` separator)              |
| `(ratio=16:9)`         | Same, `:` separator (normalised to `16 / 9`)                  |
| `(height=360)`         | Fixed pixel height (a bare number is treated as `px`; a CSS length such as `360px` is also accepted) |
| `(video, ratio=21:9)`  | A media token and a parameter together; `ratio` wins for sizing, and the media type is still recorded |

Precedence when several apply: `ratio=` → `height=` → the media type's standard
size → the handler's base size → the framework default. A malformed `ratio` or
`height` is ignored (with a build warning) and the media-type default is used.
Unknown tokens or keys are ignored with a warning. `width` is reserved.

### Example

```
Audiomack
Suno: s/SongLink12345678
YouTube: dQw4w9WgXcQ
Mega: AbC1dEfG#h1JkLmN0pQrStUvWxYz0123456789AbCdEfGh (audio)

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
- A value is a single **POSIX-shell-style word**: one or more adjacent quoted/unquoted segments, concatenated with no separator, scanned left to right until an unquoted, unescaped `,`, `)`, or whitespace character ends it (see [Value Scanning: Quotes and Backslashes](#value-scanning-quotes-and-backslashes) below)
- If the trailing `(...)` is not a valid parameter list, it is ignored (allowing `(parenthetical remarks)` after a label to pass through). Recognising the parameter list's closing `)` — and so deciding whether it is valid at all — follows the same quoting and backslash-escaping rules as value scanning, so a `)` that is quoted or backslash-escaped in an unquoted value does not close the list early

### Value Scanning: Quotes and Backslashes

Each parameter value is built by concatenating one or more adjacent segments — unquoted runs, `'single-quoted'` segments, and `"double-quoted"` segments — with no separator between them. Scanning is left to right and stops as soon as an unquoted, unescaped `,`, `)`, or whitespace character is reached (or the parameter list's content ends).

- **Single-quoted** (`'...'`): copied verbatim to the next `'`. There is no escaping and no variable substitution inside single quotes — the delimiting `'` cannot appear inside (use an adjacent double-quoted or unquoted segment for a literal `'`)
- **Double-quoted** (`"..."`): copied to the next *unescaped* `"`. Inside:
  - `\"`, `\\`, `\$`, and `` \` `` decode to the literal escaped character (`"`, `\`, `$`, or `` ` ``); a literal `\$` is never expanded, even though an unescaped `${...}` is
  - a backslash before any *other* character is kept literally (e.g. `\n` decodes to the two characters `\` and `n`, not a newline)
  - an unescaped `${variable_name}` is expanded
  - everything else — including whitespace, `,`, `)`, and `'` — is literal
- **Unquoted**: `\<char>` decodes to a literal `<char>` for *any* character at all, including a space, `,`, `)`, `'`, `"`, `\`, or `$` — escaping any of these strips its usual special meaning (so `\ ` is a literal space that does not end the value, and `\)` is a literal `)` that does not close the parameter list). An unescaped `${variable_name}` is expanded (whitespace inside the braces does not end the value, since the whole `${...}` is consumed as one unit). An unescaped `'` or `"` starts an adjacent quoted segment rather than ending the value. Any other character is literal; an unescaped whitespace, `,`, or `)` ends the value.

Variable substitution follows shell-style quoting rules, applied inline, once per `${variable_name}` occurrence, as each occurrence is decoded:

- In unquoted and double-quoted segments, `${variable_name}` is expanded
- In single-quoted segments, `${variable_name}` remains literal
- The expanded text is inserted as final, literal text and is never itself re-scanned — neither for a further `${...}` occurrence, nor for the `,`/`)` that would otherwise end the parameter or the list (e.g. a variable whose value contains a literal `)` does not end the list early)

#### Worked example: mixed adjacent quoting and backslashes

The value `START" \" \\ "unquoted\ space' \'END` decodes to `START " \ unquoted space \END`, built from five adjacent segments:

| Segment | Source | Decodes to |
|---|---|---|
| unquoted | `START` | `START` |
| double-quoted | `" \" \\ "` | ` " \ ` (space, `"`, space, `\`, space) |
| unquoted | `unquoted\ space` | `unquoted space` (the `\ ` is a literal, non-ending space) |
| single-quoted | `' \'` | ` \` (space, `\` — copied verbatim, no escaping) |
| unquoted | `END` | `END` |

Concatenated: `START` + ` " \ ` + `unquoted space` + ` \` + `END` = `START " \ unquoted space \END`.

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

## 6. Metadata Section

Section for directives and labels. The section and its markers are optional if empty.

### Structure

```
[%<directive-name> <key>:<value> ...]  [# comment]
[#<label>]  [# comment]

====
```

### Directives

A directive line has the form:

```
%name key:value key2:value2   # optional comment
```

Authoritative syntax:

```
/^ \s* %([\w.-]+) ((?:\s+[\w.]+:[\w.-]+)*) (\s+#.*)? \s*$/xi
```

- Capture group 1 is the directive name, made up of word characters, `.`, and `-`
- Capture group 2 is zero or more whitespace-separated `key:value` attribute pairs
- Capture group 3 is an optional trailing `# comment`

Directives change Poetic's behaviour. No directives are currently defined or acted upon — every directive is parsed and preserved in the poem's data for future use.

### Labels

A label line has the form:

```
#label   # optional comment
```

Authoritative syntax:

```
/^ \s* #([^&<>\\#\s]+?) (\s+#.*)? \s*$/xi
```

- Capture group 1 is the label itself: a single run of characters excluding whitespace and `& < > \ #`
- Capture group 2 is an optional trailing `# comment`, which is ignored

A `#` immediately followed by a non-space character starts a label (`#tag`); a `#` followed by whitespace starts a comment (`# words`) and is not treated as a label.

Labels are displayed with the poem on the generated site. A label is also attached as a Blogger post label when the label is acceptable to Blogger; a label containing a comma is not sent to Blogger, since Blogger uses commas to separate labels.

### Rules

- Directives and labels may be mixed within the Metadata section, one per line
- Blank lines and `# ...` comment lines are allowed between directives and labels
- The `====` end marker is only required if there are subsequent non-empty sections
- Any text after a directive, label, or the end marker on the same line is ignored

### Example

Reaching the Metadata section requires the four `====` markers that close the Versions, Audio, Postscript, and Analysis sections, even when those sections are themselves empty:

```
Title
1970-01-01

A line of verse

====  # end of versions section (no audio follows)
====  # end of audio section (no postscript follows)
====  # end of postscript section (no analysis follows)
====  # end of analysis section (metadata follows)

%some-directive key:value

#nature
#reflection
```

## 7. Comment Blocks

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

## 8. Variables

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

A `${...}` reference is resolved when the `.poem` file is converted to YAML.

#### Default values

A reference may supply a fallback for when the variable is not defined:

```
${variable_name:-default text}
```

If `variable_name` is defined, its value is used; otherwise the text after `:-`
(up to the closing `}`) is used.

#### Escaping

Write `\${...}` to emit a literal `${...}`; the leading backslash is consumed:

```
\${not a variable}   ->   ${not a variable}
```

Escaping is applied by the variable layer only. Content is then handed to its
section's markup renderer (the poem-body converter, or Markdown for postscript
and analysis), which applies its **own** backslash handling. So in those
contexts a backslash is resolved in two stages — variable substitution first
(`\${…}` → `${…}`), then markup escaping (e.g. `\\` → `\`, `\$` → `$`). Raw
`<<<...>>>` blocks are the exception: they get variable substitution but no
markup layer, so their backslashes are left as written. Author a literal
backslash accordingly for the context you are in.

#### Names are literal (not interpolated)

A variable name is never itself substituted; there is no computed-name or
indirection mechanism. A `${...}` that appears in a *name* position is not
nesting:

- In a **definition**, a name may not contain `$`, `{`, or `}` (see the name
  rules above), so a line such as `={a${x}b}=v` is not recognised as a
  definition. It is treated as ordinary content, where any `${x}` in it is
  substituted normally.
- In a **reference**, `${...}` closes at the first `}`, so `${a${x}b}` looks up
  a variable literally named `a${x` (normally undefined) and is left as literal
  text; the inner `${x}` is not resolved.

### Context (build-time) variables

Alongside author `${...}` variables, a small fixed set of **context variables**
is supplied by the build and referenced with a `%` sigil:

```
%{slug}   %{title}   %{author}   %{date}
```

Context references are resolved at the **render stage** (when HTML is generated),
*after* author variables and regardless of any enclosing literal block — so
`%{slug}` works inside a raw `<<<...>>>` block (for example, an interactive
`<script>` that needs the poem's slug). They accept the same `:-default`
fallback and a `\%{...}` escape. An unknown context name is left as literal text.

### Variable Rules

1. **Definition Location**: Variables can be defined anywhere in the file, including in the preamble before the header, except inside literal blocks or multi-line variable blocks.

2. **Namespace**: Author variables share one file-global namespace; there is no lexical scope. `.shared.poem`, when present, is prepended before processing, so its definitions join the same namespace.

3. **Undefined references**: If a variable is used without being defined, no substitution occurs and `${name}` remains as literal text (a warning is emitted, not an error) — unless a `:-default` fallback is supplied, in which case the fallback is used.

4. **Redefinition**: Variables may be redefined; a reference uses the variable's last definition in the file.

5. **Output**: Variable definition lines do not appear in the output. They do not count as content lines in their containing section.

6. **Nesting (dynamic binding)**: A variable's value may itself contain `${...}` references. These are resolved recursively each time the variable is *used* (late/dynamic binding), so redefining an inner variable changes later expansions of an outer variable that references it. Nesting may be of any depth.
   - Example: with `={a}=foo`, `={b}=${a}bar`, and `={c}=${b}baz`, then `${c}` expands to `foobarbaz`.
   - A reference cycle (e.g. `={a}=${a}`) is left as the literal `${a}` with a warning; it never loops.

7. **Processing Order**: Variables are processed for markup after substitution.

8. **Literal Blocks**: A literal block (`<<<...>>>`) suppresses Markdown rendering of its content, not variable substitution — author `${...}` variables are substituted inside literal blocks.

9. **Structural Blocks in Multi-Line Variables**: Multi-line variables may contain structural elements such as literal blocks (`<<<...>>>`), comment blocks (`<<#...#>>`), and other markers. When a standalone variable reference (e.g., `${variable}` on its own line) is expanded, these structural elements are properly recognised and parsed.

10. **Whitespace Retention**:
   - For single-line variables, everything after the second `=` is included in the variable's value.
   - For multi-line variables, everything after the newline character of the start tag line up to just before the final newline character before the close tag line is included.

11. **Usage in Labels**: Variables may be used inside labels (both {% raw %}`{{...}}`{% endraw %} and `{...}` labels).

12. **Reserved eager form**: A leading `!` in a variable name (`={!name}=` or `${!name}`) is reserved for a future eager/early-binding form and currently raises an error.

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

## 9. Inline Markup

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
- Dots separate multiple classes: `/.red.bold{x}` produces
  `<span class="red bold">x</span>`. Hyphens are part of a single class name and
  are preserved (`/.text-highlight{x}` → `<span class="text-highlight">x</span>`).

**Examples:**
```
/.highlight{important text}
/.red.bold{multi-class styling}
/.note{This can contain *bold* and _italic_ markup}
```

#### Alternatives (`poetic-alternatives`)

`poetic-alternatives` is a reserved class that marks a span as one option in a
set of alternatives. When two or more spans carrying this class are directly
adjacent — no separating characters, not even whitespace — they form an
alternatives group:

```
/.poetic-alternatives.a{first wording}/.poetic-alternatives.b{second wording}
```

All options are emitted to the HTML (add the extra class you need to target them,
e.g. `.a`/`.b`, and wire up any runtime toggle yourself). The plain-text `raw/`
output cannot toggle, so it keeps **the last** option in each group and drops the
rest. Three or more options are supported; the last always wins in plain text.

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

`\?` is **reserved** for a future extended-escape family and is not a normal
escape: wherever Poetic interprets its own escapes (the poem body and labels
above, and [parameter values](#value-scanning-quotes-and-backslashes)), a `\?`
raises a build error instead of decoding to anything. Write `\\?` for a literal
backslash followed by `?` (the escaped backslash decodes to `\`, and the `?`
is then just a plain character). This reservation does not reach inside raw
`<<<...>>>` blocks or the Markdown analysis/postscript sections, which have
their own escaping.

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

## 10. Minimal File Structure

The absolute minimal valid poem file looks like this:

```
Title
1970-01-01

A line of verse
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

## 11. Structural Rules

### Line Continuation

A physical line ending in a run of backslashes immediately before the
newline — with no trailing whitespace after the last backslash — is folded
according to the same odd/even rule used for the mid-line `\\` → `\` escape
(see [Escaped Characters](#escaped-characters)):

- A trailing run of *N* backslashes contributes `floor(N/2)` literal
  backslashes to the line.
- If *N* is **odd**, the newline is also nullified, joining the next physical
  line onto this one. A lone `\` at the end of a line is the simplest case: it
  and the newline both disappear, and the following line is joined on with no
  literal backslash left behind.
- If *N* is **even**, the newline is kept — this is not a continuation. `\\`
  at the end of a line is one literal backslash with the line break preserved.
- The rule chains: `\\\` (three backslashes) is one literal backslash,
  followed by a continuation onto the next line.
- A backslash followed by whitespace before the newline is not a continuation
  — trailing whitespace after the last backslash means the run doesn't reach
  the newline at all.

This is a lexical pre-pass that runs before section parsing, at the
logical-line level — so it can fold a long title, an author line, a label, a
poem-body line, an audio embed line, or a parameter list across several
physical lines in the source file. A continuation whose next physical line
doesn't exist (end of file) or is itself a structural block marker (`<<<`,
`>>>`, and so on) is left dangling: its `floor(N/2)` literal backslashes are
kept and nothing is joined, so a continuation can never swallow a block
marker.

**Scope:** Line continuation does not reach inside a raw `<<<...>>>` literal
block or a `<<<markdown>>>` block — their content is passed through (or
handed to the Markdown renderer) verbatim, so a trailing backslash there is
kept exactly as written.

**Continuation only removes the newline** — it does not change any other
syntax. A parameter list split across continued lines still needs its comma
separators between items:

```
Mega: \
  AbC1dEfG#h1JkLmN0pQrStUvWxYz0123456789AbCdEfGh ( \
    ratio=21:9, \
    height=400 \
  )
```

is exactly equivalent to writing it on one line:

```
Mega: AbC1dEfG#h1JkLmN0pQrStUvWxYz0123456789AbCdEfGh (ratio=21:9, height=400)
```

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

## 12. Complete Example

See `_example.poem` for a complete example file demonstrating all features.

## 13. Formal Grammar

For the complete formal specification, see `poem-syntax.ebnf`, which defines the grammar in Extended Backus-Naur Form (EBNF).
