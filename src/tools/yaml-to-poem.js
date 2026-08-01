#!/usr/bin/env node
/**
 * Convert YAML poem files to .poem format
 * Reverse conversion of poem-to-yaml.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REPO_ROOT } = require('./repo-root');

/**
 * Every entity convertEntitiesToMarkup understands, keyed by its exact
 * matched text, for the singleton (unpaired) case. Looked up by
 * ENTITY_PATTERN's replace callback -- see there for why a single lookup
 * beats ordered passes.
 */
const ENTITY_REPLACEMENTS = {
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&lsquo;': '`',
  '&rsquo;': '`',
  '&mdash;': '---',
  '&ndash;': '--',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#8220;': '"',
  '&#8221;': '"',
  '&#8216;': '`',
  '&#8217;': '`',
  '&#8212;': '---',
  '&#8211;': '--',
  '&#39;': "'",
  '&#34;': '"',
  '&#60;': '<',
  '&#62;': '>',
  '&#38;': '&',
};

/**
 * Matches, in priority order: a paired double smart quote, a paired single
 * smart quote (each accepting either the named or numeric entity as its
 * open/close marker), or any one entity from ENTITY_REPLACEMENTS. A single
 * replace() with this pattern resolves every entity -- including &#38; --
 * in one non-overlapping left-to-right scan of the original text. That
 * makes the result immune to entity-ordering by construction: a decoded
 * "&" can never recombine with neighbouring text into an entity a later
 * pass re-decodes, because the scan never revisits text it has already
 * emitted (the `js/double-escaping` fix in #38 relied on `&#38;` running
 * strictly last; this makes that ordering unnecessary rather than just
 * preserving it).
 */
const ENTITY_PATTERN = new RegExp(
  [
    '(?:&ldquo;|&#8220;)(.*?)(?:&rdquo;|&#8221;)',
    '(?:&lsquo;|&#8216;)(.*?)(?:&rsquo;|&#8217;)',
    Object.keys(ENTITY_REPLACEMENTS).join('|'),
  ].join('|'),
  'g'
);

/**
 * Convert YAML data structure to .poem format
 */
class YamlToPoemConverter {
  constructor(data) {
    this.data = data;
    this.lines = [];
  }

  /**
   * Main conversion method
   */
  convert() {
    this.writeHeader();
    this.writeVersions();
    this.writeAudio();
    this.writePostscript();
    this.writeAnalysis();
    this.writeMetadata();

    return this.lines.join('\n');
  }

  /**
   * Add a line to output
   */
  addLine(line = '') {
    this.lines.push(line);
  }

  /**
   * Add multiple blank lines
   */
  addBlankLines(count = 1) {
    for (let i = 0; i < count; i++) {
      this.addLine();
    }
  }

  /**
   * Write header section
   */
  writeHeader() {
    this.addLine(this.data.title);

    // Only add author line if it's not the default
    if (this.data.author && this.data.author !== 'A Poet') {
      this.addLine(this.data.author);
    }

    // Format date as YYYY-MM-DD
    const date = this.formatDate(this.data.date);
    this.addLine(date);
    this.addBlankLines();
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(dateInput) {
    // If it's already in YYYY-MM-DD format, return as is
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }

    // Parse date and format as YYYY-MM-DD
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Write versions section
   */
  writeVersions() {
    if (!this.data.versions || this.data.versions.length === 0) {
      throw new Error('No versions found in YAML data');
    }

    for (let i = 0; i < this.data.versions.length; i++) {
      const version = this.data.versions[i];

      // Add version label if present
      if (version.label) {
        this.addLine(this.formatLabelLine('{{', '}}', version.label, version.params));
        this.addBlankLines();
      }

      // Write segments
      if (!version.segments || version.segments.length === 0) {
        throw new Error(`Version ${i + 1} has no segments`);
      }

      for (let j = 0; j < version.segments.length; j++) {
        const segment = version.segments[j];

        // Add segment label if present
        if (segment.label) {
          this.addLine(this.formatLabelLine('{', '}', segment.label, segment.params));
        }

        // Write segment content: `parts` (mixed WYSIWYG runs and embedded
        // `<<< >>>` blocks) and `lines` (pure WYSIWYG) are mutually exclusive
        // shapes -- poem-parser.js's parseSegment() only ever sets one.
        if (segment.parts) {
          this.writeSegmentParts(segment.parts);
        } else if (segment.lines) {
          // Remove trailing newline from lines if present
          const lines = segment.lines.endsWith('\n')
            ? segment.lines.slice(0, -1)
            : segment.lines;
          this.addLine(this.convertSegmentHtmlToPlainText(lines));
        }

        // Add blank line between segments (except after last segment)
        if (j < version.segments.length - 1) {
          this.addBlankLines();
        }
      }

      // Add version divider if not the last version
      if (i < this.data.versions.length - 1) {
        this.addBlankLines(2);
        this.addLine('----');
        this.addBlankLines(2);
      }
    }

    // End of versions marker
    this.addBlankLines();
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Write a segment's `parts` -- the ordered mix of WYSIWYG line runs and
   * embedded `<<< >>>` blocks that parseSegment() produces when a segment
   * contains at least one literal/markdown block. A `lines` part is written
   * the same way as a plain `segment.lines` run; an `html` part is wrapped in
   * a raw `<<< >>>` block so it re-parses back to the identical HTML string
   * (renderBlock()'s raw passthrough only substitutes variables, and the
   * written content has none, so this is a lossless round trip). Unlike the
   * `lines` case, `html`'s own trailing newline (if any) is kept as-is rather
   * than stripped: renderBlock() joins the block's inner lines with '\n' but
   * adds no trailing newline of its own, so keeping (or omitting) it here is
   * what reproduces the original string exactly on the next parse.
   */
  writeSegmentParts(parts) {
    for (const part of parts) {
      if (part.type === 'lines') {
        const lines = part.lines.endsWith('\n') ? part.lines.slice(0, -1) : part.lines;
        this.addLine(this.convertSegmentHtmlToPlainText(lines));
      } else if (part.type === 'html') {
        if (/^\s*(?:<<<|>>>)/m.test(part.html)) {
          throw new Error(
            'Unsupported segment part: html content contains a "<<<" or ">>>" block marker, ' +
            `which cannot be represented as a raw literal block: ${JSON.stringify(part.html.slice(0, 80))}`
          );
        }
        this.addLine('<<<');
        this.addLine(part.html);
        this.addLine('>>>');
      } else {
        throw new Error(`Unsupported segment part type: ${JSON.stringify(part.type)}`);
      }
    }
  }

  /**
   * Write audio section
   */
  writeAudio() {
    if (this.data.audio) {
      // Service names are data-driven (see song-handlers.js /
      // song-handlers.yaml) -- write back whatever the YAML has, in order,
      // rather than a fixed Audiomack/Suno pair. A bare `true` value becomes
      // a bare line; a string value becomes "Service: value"; an object
      // `{ value, media?, ratio?, height? }` (a source line that carried a
      // trailing player-size parameter list) becomes "Service[: value]
      // (media, ratio=..., height=...)".
      for (const [service, value] of Object.entries(this.data.audio)) {
        const displayName = service.charAt(0).toUpperCase() + service.slice(1);
        if (value === true) {
          this.addLine(displayName);
        } else if (typeof value === 'string' && value.trim() !== '') {
          this.addLine(`${displayName}: ${value}`);
        } else if (value && typeof value === 'object') {
          this.addLine(`${displayName}${this.formatAudioParams(service, value)}`);
        } else {
          throw new Error(
            `Unsupported audio entry for "${service}": expected true, a non-empty string, ` +
            `or a { value, media?, ratio?, height? } object, got ${JSON.stringify(value)}`
          );
        }
      }
      this.addBlankLines();
    }

    // End of audio marker
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Format an object-form audio entry -- `{ value, media?, ratio?, height? }`
   * -- as the trailing text of its service line: an optional ": value" plus
   * the " (media, ratio=..., height=...)" parameter list matched by
   * poem-parser.js's parseAudioParams(). Always includes the parens (even
   * when empty) so an entry with an unrecognised/dropped parameter -- which
   * parseAudioParams() still surfaces as `{ value }` because it saw *some*
   * trailing "(...)" -- keeps its object shape on the next round trip too.
   */
  formatAudioParams(service, entry) {
    const params = [];
    if (entry.media) params.push(entry.media);
    if (entry.ratio != null) params.push(`ratio=${entry.ratio}`);
    if (entry.height != null) params.push(`height=${entry.height}`);
    const paramStr = ` (${params.join(', ')})`;

    if (entry.value === true) {
      return paramStr;
    }
    if (typeof entry.value === 'string' && entry.value.trim() !== '') {
      return `: ${entry.value}${paramStr}`;
    }
    throw new Error(
      `Unsupported audio entry for "${service}": object "value" must be true or a non-empty ` +
      `string, got ${JSON.stringify(entry.value)}`
    );
  }

  /**
   * Write postscript section
   */
  writePostscript() {
    if (this.data.postscript && this.data.postscript.length > 0) {
      for (let i = 0; i < this.data.postscript.length; i++) {
        const note = this.data.postscript[i];

        // Handle $ref (literal block)
        if (note.$ref) {
          this.addLine('<<<');
          this.addLine(`  - $ref: "${note.$ref}"`);
          this.addLine('>>>');
        } else {
          // Add label if present
          if (note.label) {
            this.addLine(this.formatLabelLine('{', '}', note.label, note.params));
          }

          // Convert HTML content back to plain text. Postscript prose may be
          // followed by one or more `<<< >>>` literal blocks (see
          // parsePostscriptNote() in poem-parser.js), which parseLiteralBlock()
          // concatenates onto `content` -- so, unlike analysis (no literal-block
          // syntax in its grammar at all), a block-shaped chunk here can safely
          // be written back as a literal block.
          if (note.content) {
            const plainText = this.convertHtmlToPlainText(note.content, { allowLiteralBlocks: true });
            this.addLine(plainText);
          }
        }

        // Add divider between postscript notes (except after last one)
        if (i < this.data.postscript.length - 1) {
          this.addBlankLines(2);
          this.addLine('----');
          this.addBlankLines();
        }
      }

      this.addBlankLines();
    }

    // End of postscript marker
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Write analysis section
   */
  writeAnalysis() {
    if (this.data.analysis) {
      // Write synopsis if present
      if (this.data.analysis.synopsis) {
        this.addLine('{Synopsis}');
        this.addBlankLines();
        const synopsis = this.convertHtmlToPlainText(this.data.analysis.synopsis);
        this.addLine(synopsis);
        this.addBlankLines(2);
      }

      // Write full analysis if present
      if (this.data.analysis.full) {
        this.addLine('{Full}');
        this.addBlankLines();
        const full = this.convertHtmlToPlainText(this.data.analysis.full);
        this.addLine(full);
        this.addBlankLines();
      }

      // End of file marker (optional, but include it)
      this.addLine('====');
    }
  }

  /**
   * Write the Metadata section: directives (in source order, `%name
   * key:value ...`), then labels (in source order, `#label`). The two are
   * parsed into separate arrays by poem-parser.js's parseMetadata() -- it
   * does not track how directive and label lines were interleaved in the
   * source -- so writing them in two grouped runs round-trips the same
   * `directives`/`labels` arrays without loss. Writes nothing when both are
   * absent, matching parseMetadata() leaving both keys off `result` for an
   * empty (or absent) Metadata section.
   */
  writeMetadata() {
    if (!this.data.directives && !this.data.labels) {
      return;
    }

    if (this.data.directives) {
      for (const directive of this.data.directives) {
        this.addLine(this.formatDirectiveLine(directive));
      }
    }

    if (this.data.labels) {
      for (const label of this.data.labels) {
        this.addLine(`#${this.validateMetadataToken(label, /^[^\s&<>\\#]+$/, 'label')}`);
      }
    }
  }

  /**
   * Format a `{ name, attributes? }` directive as a `%name key:value ...`
   * line, matching the character classes parseDirectiveLine() accepts (it
   * has no quoting mechanism, so any value outside `[\w.-]` cannot round-trip
   * and errors here instead of silently corrupting on the next parse).
   */
  formatDirectiveLine(directive) {
    const name = this.validateMetadataToken(directive.name, /^[\w.-]+$/, 'directive name');
    if (!directive.attributes) {
      return `%${name}`;
    }
    const attrs = Object.entries(directive.attributes)
      .map(([key, value]) => {
        const validKey = this.validateMetadataToken(key, /^[\w.]+$/, 'directive attribute key');
        const validValue = this.validateMetadataToken(value, /^[\w.-]+$/, 'directive attribute value');
        return `${validKey}:${validValue}`;
      })
      .join(' ');
    return `%${name} ${attrs}`;
  }

  /**
   * Validate a Metadata-section token against the character class its
   * corresponding poem-parser.js matcher accepts, throwing a clear error
   * (rather than silently emitting a line that would parse back differently)
   * when the YAML data holds something that syntax cannot represent.
   */
  validateMetadataToken(value, pattern, description) {
    const str = String(value);
    if (!pattern.test(str)) {
      throw new Error(
        `Unsupported Metadata ${description}: ${JSON.stringify(str)} does not match ${pattern} ` +
        'and cannot be written as valid .poem syntax'
      );
    }
    return str;
  }

  /**
   * Format a version/segment/postscript label line, appending its optional
   * parameter list. `open`/`close` are '{{'/'}}' for a version label or
   * '{'/'}' for a segment/postscript label, matching the spacing each
   * already uses (`{{ Label }}` vs `{Label}`).
   */
  formatLabelLine(open, close, label, params) {
    const inner = open === '{{' ? ` ${label} ` : label;
    const base = `${open}${inner}${close}`;
    return params ? base + this.formatParamList(params) : base;
  }

  /**
   * Format a `{ key: value, ... }` params object as a `(key=value, ...)`
   * parameter list. Every value is double-quoted with `\`, `"`, and `$`
   * escaped -- always, regardless of content -- so no value can accidentally
   * terminate the list early, be split by whitespace, or trigger a `${...}`
   * variable expansion on the next parse (see parseParamList()'s
   * shell-word-style value scanning in poem-parser.js).
   */
  formatParamList(params) {
    const pairs = Object.entries(params).map(([key, value]) => {
      const escaped = String(value).replace(/[\\"$]/g, (c) => `\\${c}`);
      return `${key}="${escaped}"`;
    });
    return `(${pairs.join(', ')})`;
  }

  /**
   * Convert HTML content back to plain text with markup.
   *
   * @param {string} html
   * @param {{allowLiteralBlocks?: boolean}} [options] - `allowLiteralBlocks`
   *   lets an unrecognised (non-heading, non-`<p>`) block be written back as a
   *   `<<< >>>` literal block instead of bare text -- safe only where the
   *   caller's parse path actually understands that syntax (postscript;
   *   analysis has no literal-block grammar at all, see writeAnalysis()).
   */
  convertHtmlToPlainText(html, { allowLiteralBlocks = false } = {}) {
    // First normalize multi-line HTML tags to single lines
    html = html.replace(/<(h[2-5])[^>]*>\s*(.*?)\s*<\/\1>/gs, (match, tag, content) => {
      // Collapse whitespace in heading content
      const cleanContent = content.replace(/\s+/g, ' ').trim();
      return `<${tag}>${cleanContent}</${tag}>`;
    });

    // Split on blank lines to get blocks. Unlike the old `html.trim()` up
    // front, this leaves a lone trailing '\n' on the last block intact --
    // needed below, since the raw-block fallback has to reproduce it exactly
    // (TD26072401: markdown-it's block renderers don't reliably re-add a
    // trailing newline the way a real Markdown paragraph re-render does).
    const blocks = html.split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const trimmed = block.trim();
      const peeled = blocks.length === 1 ? this.peelTrailingBlockElement(trimmed) : null;

      // Handle headings (now they're single-line after normalization)
      if (trimmed.match(/^<h5[^>]*>/) && trimmed.endsWith('</h5>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h5[^>]*>/, '').replace(/<\/h5>$/, ''));
        result.push(`### ${text}`);
      } else if (trimmed.match(/^<h4[^>]*>/) && trimmed.endsWith('</h4>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h4[^>]*>/, '').replace(/<\/h4>$/, ''));
        result.push(`## ${text}`);
      } else if (trimmed.match(/^<h3[^>]*>/) && trimmed.endsWith('</h3>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h3[^>]*>/, '').replace(/<\/h3>$/, ''));
        result.push(`# ${text}`);
      } else if (trimmed.match(/^<h2[^>]*>/) && trimmed.endsWith('</h2>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h2[^>]*>/, '').replace(/<\/h2>$/, ''));
        result.push(`# ${text}`);
      } else if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
        // Paragraph - convert HTML entities back to markup
        const text = this.stripHtmlTags(trimmed.slice(3, -4));
        result.push(this.convertEntitiesToMarkup(text));
      } else if (trimmed === '') {
        // Skip empty blocks
        continue;
      } else if (peeled) {
        // A single, un-blank-line-split run (blocks.length === 1) whose tail
        // is a recognised block-level element -- unordered/ordered list or
        // fenced code -- that the branches above can't match because they
        // only recognise a block that is *entirely* one heading/paragraph
        // (TD26072502). Reconstructing just the tail as real Markdown source
        // lets renderGfm() regenerate its own trailing '\n' on the next
        // parse; everything before it is left exactly as the plain-text
        // fallback below would have written it, since passthrough already
        // reproduces that part verbatim (see peelTrailingBlockElement()).
        if (peeled.prefix) {
          result.push(this.convertEntitiesToMarkup(peeled.prefix));
        }
        result.push(peeled.markdown);
      } else if (allowLiteralBlocks && blocks.length > 1) {
        // A whole block, on its own between two blank lines, that isn't a
        // shape convertHtmlToPlainText knows how to write back as plain
        // Markdown source -- most likely a raw `<<< >>>` block's own content
        // (see parsePostscriptNote() concatenating a literal block's content
        // onto prose with a leading '\n', which combines with renderGfm()'s
        // own trailing '\n' on the preceding prose to form the blank line
        // that isolated this block here). Writing it back as bare prose text
        // would re-enter the parser as ordinary Markdown/raw-HTML-passthrough,
        // which does not promise to reproduce the exact newlines it started
        // with (TD26072401). Wrapping it in a literal block instead reuses the
        // same read-back-verbatim mechanism writeSegmentParts() already relies
        // on for a segment's `html` part, which *is* exact.
        //
        // `blocks.length > 1` is deliberate: a lone, unsplit block (the
        // *entire* field content, not merely isolated by a blank line within
        // it) is far more likely to be one multi-element Markdown render
        // markdown-it joined with single '\n's throughout -- rewrapping *that*
        // in `<<< >>>` would misrepresent genuine prose as a literal block and
        // corrupt it on the next parse (it re-enters as a *second* literal
        // block appended after empty prose, gaining a spurious leading '\n').
        if (/^\s*(?:<<<|>>>)/m.test(block)) {
          throw new Error(
            'Unsupported content: contains a "<<<" or ">>>" block marker, which cannot be ' +
            `represented as a raw literal block: ${JSON.stringify(block.slice(0, 80))}`
          );
        }
        result.push(`<<<\n${block}\n>>>`);
      } else {
        // Plain text. A block's own trailing '\n' can't be preserved by
        // writing an extra trailing blank line here the way the literal-block
        // case above does: both parsePostscriptNote() and
        // parseAnalysisContent() unconditionally trim trailing blank lines
        // before rendering, so that blank line would just be discarded again
        // on the next parse.
        result.push(this.convertEntitiesToMarkup(trimmed));
      }
    }

    return result.join('\n\n');
  }

  /**
   * Peel a single recognised trailing element -- an unordered list, ordered
   * list, or fenced code block -- off the end of a single-block,
   * multi-element HTML run (markdown-it always joins sibling block-level
   * elements with one '\n', never a blank line, so such a run is always
   * `blocks.length === 1` in convertHtmlToPlainText() however many elements
   * it holds). Reconstructing just the tail as real Markdown source is
   * enough: only the *last* element in a field's content ever loses its
   * trailing '\n' on round-trip (raw-HTML passthrough reproduces everything
   * else verbatim, including shapes this method doesn't understand, such as
   * tables, blockquotes, or nested/loose lists -- TD26072502), because only a
   * genuinely re-parsed trailing element leads markdown-it's own renderer to
   * re-add that '\n'.
   *
   * Returns null if the run's tail isn't one of the recognised shapes --
   * including a nested or "loose" (paragraph-wrapped `<li>`) list, which the
   * strict single-line-per-`<li>` pattern below deliberately fails to match
   * -- in which case the caller falls through to the existing plain-text
   * fallback for the whole run, unchanged.
   *
   * @param {string} html
   * @returns {{prefix: string, markdown: string}|null}
   */
  peelTrailingBlockElement(html) {
    const candidates = [
      { openTag: /<ul>\n/g, whole: /^<ul>\n((?:<li>[^\n]*<\/li>\n)+)<\/ul>$/, build: (m) => this.listItemsToMarkdown(m[1], false) },
      { openTag: /<ol>\n/g, whole: /^<ol>\n((?:<li>[^\n]*<\/li>\n)+)<\/ol>$/, build: (m) => this.listItemsToMarkdown(m[1], true) },
      {
        openTag: /<pre><code(?: class="language-[\w-]+")?>/g,
        whole: /^<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>$/,
        build: (m) => this.fencedCodeMarkdown(m[1], m[2]),
      },
    ];

    for (const { openTag, whole, build } of candidates) {
      const idx = this.lastTagBoundary(html, openTag);
      if (idx === -1) {
        continue;
      }
      const match = html.slice(idx).match(whole);
      if (!match) {
        continue;
      }
      let prefix = html.slice(0, idx);
      if (prefix.endsWith('\n')) {
        prefix = prefix.slice(0, -1);
      }
      return { prefix, markdown: build(match) };
    }
    return null;
  }

  /**
   * The last index in `html` at which `openTag` matches and the match is
   * itself at a sibling-block boundary (the very start of `html`, or
   * immediately after a '\n') -- i.e. the last plausible start of a
   * top-level element of this tag, as opposed to a tag of the same name
   * nested inside another element (e.g. a sub-list's own `<ul>\n`). Returns
   * -1 if no such boundary exists.
   */
  lastTagBoundary(html, openTag) {
    let lastIdx = -1;
    let match;
    openTag.lastIndex = 0;
    while ((match = openTag.exec(html))) {
      if (match.index === 0 || html[match.index - 1] === '\n') {
        lastIdx = match.index;
      }
    }
    return lastIdx;
  }

  /**
   * Convert a run of `<li>...</li>\n` lines (captured from a flat, non-loose
   * `<ul>`/`<ol>`) back to `- `/`1. ` Markdown list syntax.
   */
  listItemsToMarkdown(liLines, ordered) {
    const items = [];
    const liPattern = /<li>([^\n]*)<\/li>\n/g;
    let match;
    let n = 1;
    while ((match = liPattern.exec(liLines))) {
      const text = this.stripHtmlTags(match[1]);
      items.push(ordered ? `${n}. ${text}` : `- ${text}`);
      n++;
    }
    return items.join('\n');
  }

  /**
   * Convert a `<pre><code>`/`<pre><code class="language-X">` fenced code
   * block's inner HTML back to a ` ``` ` fenced Markdown block. `content`
   * already carries markdown-it's own trailing '\n' before `</code>`, which
   * is reused directly as the newline before the closing fence.
   */
  fencedCodeMarkdown(lang, content) {
    return '```' + (lang || '') + '\n' + this.unescapeCodeEntities(content) + '```';
  }

  /**
   * Reverse markdown-it's plain HTML-escaping of fenced code content (as
   * opposed to convertEntitiesToMarkup()'s typographic entities, which code
   * content never receives). `&amp;` is unescaped last so a doubly-escaped
   * literal (e.g. an author-typed `&amp;`, rendered as `&amp;amp;`) decodes
   * back to exactly one `&`, not zero -- mirroring ENTITY_PATTERN's own
   * ordering rationale above.
   */
  unescapeCodeEntities(text) {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  }

  /**
   * Strip HTML tags and convert inline markup
   */
  stripHtmlTags(text) {
    // Convert inline HTML tags back to markup
    text = text.replace(/<em>(.*?)<\/em>/g, '_$1_');
    text = text.replace(/<strong>(.*?)<\/strong>/g, '*$1*');
    text = text.replace(/<s>(.*?)<\/s>/g, '~~$1~~');
    text = text.replace(/<a href="https?:\/\/(.*?)">(.*?)<\/a>/g, '[$2|$1]');

    return this.convertEntitiesToMarkup(text);
  }

  /**
   * Convert HTML entities back to markup
   */
  convertEntitiesToMarkup(text) {
    return text.replace(ENTITY_PATTERN, (match, doubleQuoted, singleQuoted) => {
      if (doubleQuoted !== undefined) {
        return `"${this.convertEntitiesToMarkup(doubleQuoted)}"`;
      }
      if (singleQuoted !== undefined) {
        return `\`${this.convertEntitiesToMarkup(singleQuoted)}\``;
      }
      return ENTITY_REPLACEMENTS[match];
    });
  }

  /**
   * Convert a segment's WYSIWYG HTML (`segment.lines`, or a `parts` entry's
   * `lines`) back to `.poem` markup -- the reverse of poem-parser.js's
   * processWysiwygLines(). Unlike postscript/analysis content, this HTML is
   * never blank-line-block-structured: parseSegment() ends a segment (and so
   * flushes its `run`) on the first blank line, so `html` here is always one
   * `\n`-joined run of physical WYSIWYG lines, each either a
   * `<blockquote>`-wrapped quote run (its `<br/>`-joined inner lines each
   * become one `> ` quote line) or an inline-markup line (a trailing `<br/>`
   * -- convertMarkup()'s hard-line-break marker for a source line ending in
   * 2+ spaces -- becomes that trailing whitespace again).
   *
   * @param {string} html
   * @returns {string}
   */
  convertSegmentHtmlToPlainText(html) {
    if (html === '') {
      return '';
    }

    const outputLines = [];
    for (const line of html.split('\n')) {
      const quoteMatch = line.match(/^<blockquote>([\s\S]*)<\/blockquote>$/);
      if (quoteMatch) {
        for (const quoteLine of quoteMatch[1].split('<br/>')) {
          outputLines.push(`> ${this.stripSegmentHtmlTags(quoteLine)}`);
        }
        continue;
      }

      const hasBreak = line.endsWith('<br/>');
      const text = hasBreak ? line.slice(0, -'<br/>'.length) : line;
      outputLines.push(this.stripSegmentHtmlTags(text) + (hasBreak ? '  ' : ''));
    }

    return outputLines.join('\n');
  }

  /**
   * Reverse convertMarkup()'s inline markup for one WYSIWYG line: `<span
   * class="...">` (segment-only span syntax, `/.class{...}` -- postscript/
   * analysis prose has no equivalent, so this is not folded into the shared
   * stripHtmlTags()) plus everything stripHtmlTags() already understands.
   *
   * Every character convertMarkup() treats as markup syntax (`*_~`[/{}"&'`
   * and `\` itself) is always fully consumed into a tag or entity when it
   * forms real markup -- none of them survive as bare text in the rendered
   * HTML: an unescaped `&` or `'` is unconditionally turned into `&#38;`/
   * `&#39;`, and an unescaped `"` either pairs into smart-quote entities or
   * (if unpaired) is left alone either way, so escaping it back is always
   * safe. So any of these characters still present in decoded text can only be
   * literal (originally `\`-escaped) content, and escaping them again --
   * unconditionally, before restoring any tags -- is always correct; it is
   * what makes an escaped `\*literal\*` round-trip back to itself instead of
   * becoming `<em>literal</em>` on the next parse (TD26072401). This walks
   * the text with a single tokenising pass, rather than escaping first and
   * matching tags second, because escaping first would also mangle the "/"
   * inside an `<a href="https://...">`'s own markup before it can be matched.
   *
   * @param {string} text
   * @returns {string}
   */
  stripSegmentHtmlTags(text) {
    const tagPattern =
      /<span class="([^"]*)">([\s\S]*?)<\/span>|<em>([\s\S]*?)<\/em>|<strong>([\s\S]*?)<\/strong>|<s>([\s\S]*?)<\/s>|<a href="https?:\/\/(.*?)">([\s\S]*?)<\/a>/g;

    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = tagPattern.exec(text)) !== null) {
      result += this.escapeSegmentLiteral(text.slice(lastIndex, match.index));

      const [, spanClass, spanInner, emInner, strongInner, sInner, aUrl, aInner] = match;
      if (spanClass !== undefined) {
        const classes = spanClass.split(' ').filter(Boolean).join('.');
        result += `/.${classes}{${this.escapeSegmentLiteral(spanInner)}}`;
      } else if (emInner !== undefined) {
        result += `_${this.escapeSegmentLiteral(emInner)}_`;
      } else if (strongInner !== undefined) {
        result += `**${this.escapeSegmentLiteral(strongInner)}**`;
      } else if (sInner !== undefined) {
        result += `~~${this.escapeSegmentLiteral(sInner)}~~`;
      } else {
        result += `[${this.escapeSegmentLiteral(aInner)}|${aUrl}]`;
      }

      lastIndex = tagPattern.lastIndex;
    }
    result += this.escapeSegmentLiteral(text.slice(lastIndex));

    return this.convertEntitiesToMarkup(result);
  }

  /**
   * Backslash-escape the characters convertMarkup() treats as markup syntax,
   * so literal occurrences left over after decoding (see stripSegmentHtmlTags()
   * above) survive the next parse unchanged instead of being mistaken for new
   * markup. Runs of 2+ literal hyphens get the same treatment as the other
   * escapable characters -- convertMarkup() turns an unescaped "--"/"---" run
   * into an en/em-dash entity, so a literal run left bare here would be
   * mistaken for one on the next parse -- but single hyphens are left alone
   * since convertMarkup() never touches them. A hyphen adjacent to another
   * hyphen (the lookahead matches every hyphen but the last in a run, the
   * lookbehind matches every hyphen but the first) is matched individually,
   * one character at a time, by the same alternation and callback as every
   * other escapable character -- including "\\" itself -- rather than by a
   * nested replace() over a whole matched run. A single flat pass with one
   * per-character callback keeps backslash handling uniform and explicit,
   * rather than reading as incomplete when a run is escaped as one unit.
   *
   * `&` gets the same not-if-it's-already-an-entity treatment as convertMarkup()'s
   * own forward encoding (`&(?!#\d+;|[a-z]+;)`): this runs BEFORE
   * stripSegmentHtmlTags()'s final convertEntitiesToMarkup() pass decodes
   * `&nbsp;`/`&#8220;`/etc. back to plain characters, so an `&` that starts one
   * of those still-encoded entities must be left alone here, or the following
   * decode pass would never see a whole entity to match.
   *
   * @param {string} text
   * @returns {string}
   */
  escapeSegmentLiteral(text) {
    return text.replace(/-(?=-)|(?<=-)-|&(?!#\d+;|[a-zA-Z]+;)|[\\_*~`["'/{}]/g, (c) => `\\${c}`);
  }
}

/**
 * Convert a YAML file to .poem format
 */
function convertYamlToPoem(yamlFilePath) {
  const content = fs.readFileSync(yamlFilePath, 'utf8');
  const data = yaml.load(content);

  const converter = new YamlToPoemConverter(data);
  return converter.convert();
}

/**
 * Convert every non-partial .yaml file in `yamlDir` to a .poem file in
 * `poemDir`, mirroring poem-to-yaml.js's convertAllPoemsToYaml() and
 * poem-to-raw.js's convertAllPoemsToRaw(): a partial/private file (leading
 * '_' or '.', e.g. `_example.yaml`/`_shared.yaml`) is skipped, and a
 * per-file conversion failure is logged and skipped rather than aborting
 * the run.
 *
 * @param {object} [options]
 * @param {string} [options.yamlDir] - Override the default `src/poems/yaml`
 *   directory (tests only; the `--all` CLI entry point below always uses the
 *   default — this tool is not part of `npm run build`).
 * @param {string} [options.poemDir] - Override the default `src/poems/poem`
 *   directory (tests only).
 * @returns {number} the number of files converted
 */
function convertAllYamlToPoem({
  yamlDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml'),
  poemDir = path.join(REPO_ROOT, 'src', 'poems', 'poem'),
} = {}) {
  const files = fs.readdirSync(yamlDir);

  let converted = 0;
  for (const file of files) {
    if (file.endsWith('.yaml') && !file.startsWith('_') && !file.startsWith('.')) {
      const yamlPath = path.join(yamlDir, file);
      const poemPath = path.join(poemDir, file.replace('.yaml', '.poem'));

      try {
        console.log(`Converting ${file}...`);
        const poemContent = convertYamlToPoem(yamlPath);
        fs.writeFileSync(poemPath, poemContent, 'utf8');
        console.log(`  → ${path.basename(poemPath)}`);
        converted++;
      } catch (error) {
        console.error(`Error converting ${file}:`, error.message);
      }
    }
  }

  console.log(`\nConverted ${converted} YAML files to .poem format`);
  return converted;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: yaml-to-poem.js <file.yaml> [output.poem]');
    console.error('   or: yaml-to-poem.js --all');
    process.exit(1);
  }

  if (args[0] === '--all') {
    convertAllYamlToPoem();
  } else {
    // Convert single file
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace('.yaml', '.poem');

    try {
      const poemContent = convertYamlToPoem(inputFile);
      fs.writeFileSync(outputFile, poemContent, 'utf8');
      console.log(`Converted ${inputFile} → ${outputFile}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { YamlToPoemConverter, convertYamlToPoem, convertAllYamlToPoem };

