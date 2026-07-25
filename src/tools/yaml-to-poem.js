#!/usr/bin/env node
/**
 * Convert YAML poem files to .poem format
 * Reverse conversion of poem-to-yaml.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
          this.addLine(lines);
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
        this.addLine(lines);
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

          // Convert HTML content back to plain text
          if (note.content) {
            const plainText = this.convertHtmlToPlainText(note.content);
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
   * Convert HTML content back to plain text with markup
   */
  convertHtmlToPlainText(html) {
    // First normalize multi-line HTML tags to single lines
    html = html.replace(/<(h[2-5])[^>]*>\s*(.*?)\s*<\/\1>/gs, (match, tag, content) => {
      // Collapse whitespace in heading content
      const cleanContent = content.replace(/\s+/g, ' ').trim();
      return `<${tag}>${cleanContent}</${tag}>`;
    });

    // Split by double newlines to get blocks
    const blocks = html.trim().split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const trimmed = block.trim();

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
      } else {
        // Plain text
        result.push(this.convertEntitiesToMarkup(trimmed));
      }
    }

    return result.join('\n\n');
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
    // Convert all .yaml files in poems/ directory (except special files)
    const poemsDir = path.join(process.cwd(), 'src', 'poems');
    const files = fs.readdirSync(poemsDir);

    const skipFiles = ['_shared.yaml', '_example.yaml'];
    let converted = 0;

    for (const file of files) {
      if (file.endsWith('.yaml') && !skipFiles.includes(file)) {
        const yamlPath = path.join(poemsDir, file);
        const poemPath = path.join(poemsDir, file.replace('.yaml', '.poem'));

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

module.exports = { YamlToPoemConverter, convertYamlToPoem };

