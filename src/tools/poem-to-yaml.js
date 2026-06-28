#!/usr/bin/env node
/**
 * Convert .poem files to YAML format
 * Based on poem-syntax.ebnf specification
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderGfm } = require('./markdown');

/**
 * Parse a .poem file and convert to structured data
 */
class PoemParser {
  constructor(content) {
    this.content = content;
    this.lines = content.split('\n');
    this.index = 0;
    this.result = {};
    this.variables = new Map();
    this.usedBeforeDefined = new Set();
  }

  /**
   * Main parse method
   */
  parse() {
    // Remove comment blocks first
    this.removeCommentBlocks();

    // Process variables (extract and remove definition lines)
    this.processVariables();

    // Strip ignored trailing text after line-anchored tokens (spec section 10)
    this.normalizeTokenLines();

    this.parseHeader();
    this.parseVersions();

    // All subsequent sections and their markers are optional
    // If we hit EOF, all remaining sections are empty

    if (this.eof()) return this.result;
    this.expectMarker('====', 'end-of-poem');

    if (this.eof()) return this.result;
    this.parseAudio();

    if (this.eof()) return this.result;
    this.expectMarker('====', 'end-of-audio');

    if (this.eof()) return this.result;
    this.parsePostscript();

    if (this.eof()) return this.result;
    this.expectMarker('====', 'end-of-postscript');

    if (this.eof()) return this.result;
    this.parseAnalysis();

    // Warn about variables used before definition
    if (this.usedBeforeDefined.size > 0) {
      for (const varName of this.usedBeforeDefined) {
        console.warn(`Warning: Variable '\${${varName}}' used but not defined`);
      }
    }

    return this.result;
  }

  /**
   * Remove comment blocks (<<# ... #>>) from content
   */
  removeCommentBlocks() {
    const newLines = [];
    let inComment = false;

    for (const line of this.lines) {
      if (line.trimStart().startsWith('<<#')) {
        inComment = true;
        continue;
      }
      if (line.trimStart().startsWith('#>>')) {
        inComment = false;
        continue;
      }
      if (!inComment) {
        newLines.push(line);
      }
    }

    this.lines = newLines;
  }

  /**
   * Strip the ignored trailing text after a line-anchored token (spec section
   * 10: "Any text after a line-anchored token on the same line is ignored").
   * Applies to dividers/end markers and version/segment/analysis labels; leaves
   * everything else (including single-line variable values) untouched.
   */
  stripTrailingAfterToken(line) {
    let m;
    if ((m = line.match(/^(={4})(?!=)/))) return m[1];      // end marker ====
    if ((m = line.match(/^(-{4})(?!-)/))) return m[1];      // divider ----
    if ((m = line.match(/^(\{\{.*?\}\})/))) return m[1];    // version label {{...}}
    if (/^\{(?!\{)/.test(line) && (m = line.match(/^(\{.*?\})/))) {
      return m[1];                                          // segment/analysis label {...}
    }
    return line;
  }

  /**
   * Apply stripTrailingAfterToken to every line, skipping the contents of
   * literal/markdown blocks (which are opaque). Runs after variable processing
   * so block markers reflect the expanded content.
   */
  normalizeTokenLines() {
    let inBlock = false;
    this.lines = this.lines.map((line) => {
      if (this.blockStartTag(line) !== null) { inBlock = true; return line; }
      if (this.isBlockEnd(line)) { inBlock = false; return line; }
      if (inBlock) return line;
      return this.stripTrailingAfterToken(line);
    });
  }

  /**
   * Process variables: extract definitions and expand multi-line substitutions
   */
  processVariables() {
    const newLines = [];
    let i = 0;
    let inLiteralBlock = false;

    while (i < this.lines.length) {
      const line = this.lines[i];

      // Track literal/markdown blocks (variable definitions not extracted inside
      // them; the block content is opaque to this pass).
      if (this.blockStartTag(line) !== null) {
        inLiteralBlock = true;
        newLines.push(line);
        i++;
        continue;
      }
      if (this.isBlockEnd(line)) {
        inLiteralBlock = false;
        newLines.push(line);
        i++;
        continue;
      }

      // Skip variable definition inside literal blocks
      if (inLiteralBlock) {
        newLines.push(line);
        i++;
        continue;
      }

      // Check for single-line variable: ={name}= value
      const singleLineMatch = line.match(/^=\{([^}]+)\}=(.*)$/);
      if (singleLineMatch) {
        const varName = singleLineMatch[1];
        const varValue = singleLineMatch[2];
        // Store value with nested variables unsubstituted for now
        this.variables.set(varName, varValue);
        i++;
        continue; // Don't add to newLines (remove from content)
      }

      // Check for multi-line variable start: ={name}<<= ...
      const multiLineMatch = line.match(/^=\{([^}]+)\}<<=.*$/);
      if (multiLineMatch) {
        const varName = multiLineMatch[1];
        const contentLines = [];
        i++; // Move past the start line

        // Collect lines until we find =>>
        while (i < this.lines.length) {
          const contentLine = this.lines[i];
          if (contentLine.match(/^=>>.*$/)) {
            // Found the end marker
            i++;
            break;
          }
          contentLines.push(contentLine);
          i++;
        }

        // Store content as array of lines for multi-line variables
        this.variables.set(varName, contentLines);
        continue; // Don't add to newLines (remove from content)
      }

      // Regular line - don't substitute yet, keep as-is
      newLines.push(line);
      i++;
    }

    this.lines = newLines;

    // Now substitute variables within variable definitions (for nesting)
    // and convert multi-line variables to strings
    for (const [varName, varValue] of this.variables.entries()) {
      if (Array.isArray(varValue)) {
        // Multi-line variable - substitute in each line, but NOT inside literal blocks
        const substitutedLines = [];
        let inLiteralBlock = false;
        for (const line of varValue) {
          if (line.trim() === '<<<') {
            inLiteralBlock = true;
            substitutedLines.push(line);
          } else if (line.trim() === '>>>') {
            inLiteralBlock = false;
            substitutedLines.push(line);
          } else if (inLiteralBlock) {
            // Don't substitute variables inside literal blocks
            substitutedLines.push(line);
          } else {
            // Substitute variables outside literal blocks
            substitutedLines.push(this.substituteVariables(line));
          }
        }
        this.variables.set(varName, substitutedLines);
      } else {
        // Single-line variable - just substitute
        this.variables.set(varName, this.substituteVariables(varValue));
      }
    }

    // Now expand any standalone variable references into multiple lines
    const expandedLines = [];
    for (const line of this.lines) {
      // Check if line is a standalone variable reference: ${varname}
      const standaloneMatch = line.trim().match(/^\$\{([^}]+)\}$/);
      if (standaloneMatch) {
        const varName = standaloneMatch[1];
        if (this.variables.has(varName)) {
          const varValue = this.variables.get(varName);
          if (Array.isArray(varValue)) {
            // Multi-line variable - expand to multiple lines
            expandedLines.push(...varValue);
          } else {
            // Single-line variable - substitute normally
            expandedLines.push(this.substituteVariables(line));
          }
        } else {
          // Variable not defined
          this.usedBeforeDefined.add(varName);
          expandedLines.push(line);
        }
      } else {
        // Not a standalone variable reference - keep as-is (substitution happens during parsing)
        expandedLines.push(line);
      }
    }

    this.lines = expandedLines;
  }

  /**
   * Substitute variables in text
   */
  substituteVariables(text) {
    // Match ${variable_name} patterns
    return text.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      if (this.variables.has(varName)) {
        const varValue = this.variables.get(varName);
        // If it's an array (multi-line variable), join with newlines
        if (Array.isArray(varValue)) {
          return varValue.join('\n');
        }
        return varValue;
      } else {
        // Variable not defined - track it and leave as literal
        this.usedBeforeDefined.add(varName);
        return match;
      }
    });
  }

  /**
   * Get current line without advancing
   */
  peek() {
    return this.index < this.lines.length ? this.lines[this.index] : null;
  }

  /**
   * Get current line and advance
   */
  next() {
    return this.index < this.lines.length ? this.lines[this.index++] : null;
  }

  /**
   * Check if we're at end of file
   */
  eof() {
    return this.index >= this.lines.length;
  }

  /**
   * If `line` starts a literal/markdown block (`<<<`, optionally followed by a
   * tag word and ignored trailing text), return the tag (possibly ''); else null.
   *   <<<            -> ''        (raw passthrough)
   *   <<<markdown    -> 'markdown'(rendered as GFM)
   *   <<<yaml  # ... -> 'yaml'    (unknown tag -> raw passthrough)
   */
  blockStartTag(line) {
    if (line === null) return null;
    const m = line.trim().match(/^<<<(\w*)(?:\s.*)?$/);
    return m ? m[1] : null;
  }

  /**
   * True if `line` is a block end marker (`>>>`, ignoring trailing text).
   */
  isBlockEnd(line) {
    return line !== null && /^>>>(?:\s.*)?$/.test(line.trim());
  }

  /**
   * Read a `<<< ... >>>` block starting at the current line. Consumes the start
   * and end markers and returns { tag, lines } with the raw inner lines.
   */
  readBlock() {
    const tag = this.blockStartTag(this.peek()) || '';
    this.next(); // consume start marker
    const lines = [];
    while (this.peek() !== null && !this.isBlockEnd(this.peek())) {
      lines.push(this.next());
    }
    if (this.isBlockEnd(this.peek())) {
      this.next(); // consume end marker
    }
    return { tag, lines };
  }

  /**
   * Render a block's inner lines to an HTML fragment based on its tag:
   *   markdown/md -> GFM (with variable substitution)
   *   anything else -> raw passthrough (no substitution, no conversion)
   */
  renderBlock(tag, lines) {
    if (tag === 'markdown' || tag === 'md') {
      return renderGfm(lines.map(l => this.substituteVariables(l)).join('\n'));
    }
    return lines.join('\n');
  }

  /**
   * Skip blank lines
   */
  skipBlankLines() {
    while (this.peek() !== null && this.peek().trim() === '') {
      this.next();
    }
  }

  /**
   * Expect a specific marker (e.g., ==== or ----)
   */
  expectMarker(marker, name) {
    this.skipBlankLines();
    const line = this.peek();
    if (line !== null && line.trim() === marker) {
      this.next();
      this.skipBlankLines();
      return true;
    }
    return false;
  }

  /**
   * Parse header section (title, author, date)
   */
  parseHeader() {
    this.skipBlankLines();

    // Title (mandatory)
    const title = this.next();
    if (!title) {
      throw new Error('Missing title');
    }
    this.result.title = this.substituteVariables(title.trim());

    // Author (optional) or Date
    let line = this.next();
    if (!line) {
      throw new Error('Missing date');
    }

    // Check if this is a date (YYYY-MM-DD format) after variable substitution
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const substitutedLine = this.substituteVariables(line.trim());
    if (datePattern.test(substitutedLine)) {
      // No author, this is the date - default to ${author}
      this.result.author = this.substituteVariables('${author}');
      this.result.date = substitutedLine;
    } else {
      // This is the author
      this.result.author = substitutedLine;
      // Next line must be date
      line = this.next();
      if (!line) {
        throw new Error('Missing date');
      }
      const substitutedDateLine = this.substituteVariables(line.trim());
      if (!datePattern.test(substitutedDateLine)) {
        throw new Error('Invalid or missing date');
      }
      this.result.date = substitutedDateLine;
    }

    this.skipBlankLines();
  }

  /**
   * Parse versions section
   */
  parseVersions() {
    this.result.versions = [];

    do {
      const version = this.parseVersion();
      if (version) {
        this.result.versions.push(version);
      }

      this.skipBlankLines();

      // Check for version divider (not end marker)
      // Divider is optional - only required if there's another version
      const line = this.peek();
      if (line && line.trim() === '----') {
        this.next();
        this.skipBlankLines();
        // Continue to parse next version
      } else {
        // No divider found - check if there might be another version
        // (i.e., a version label or segment label)
        if (line && (line.trim().startsWith('{{') || line.trim().startsWith('{'))) {
          // There's another version without a divider separator - continue parsing
        } else {
          // No more versions
          break;
        }
      }
    } while (true);
  }

  /**
   * Parse a single version
   */
  parseVersion() {
    this.skipBlankLines();

    // Check if we've hit the end-of-poem marker
    const firstLine = this.peek();
    if (!firstLine || firstLine.trim() === '====') {
      return null;
    }

    const version = {};

    // Check for version label
    if (firstLine.trim().startsWith('{{') && firstLine.trim().endsWith('}}')) {
      const label = firstLine.trim().slice(2, -2).trim();
      if (label) {
        version.label = this.convertMarkup(this.substituteVariables(label));
      }
      this.next();
      this.skipBlankLines();
    }

    // Parse segments
    version.segments = [];
    while (true) {
      this.skipBlankLines();

      // Check if we've hit a divider or end marker
      const line = this.peek();
      if (!line || line.trim() === '----' || line.trim() === '====') {
        break;
      }

      const segment = this.parseSegment();
      if (!segment) {
        break;
      }
      version.segments.push(segment);
    }

    return version.segments.length > 0 ? version : null;
  }

  /**
   * Convert spaces to non-breaking spaces in poem lines
   * - Leading spaces (indentation) are converted to &nbsp;
   * - Multiple consecutive spaces within lines are converted to alternating
   *   space + &nbsp; pattern (e.g., "  " becomes " &nbsp;") to allow wrapping
   *   on small displays while preserving visual spacing
   */
  convertSpacesToNbsp(line) {
    // Convert leading spaces to &nbsp;
    const leadingSpaces = line.match(/^( +)/);
    if (leadingSpaces) {
      const nbspLeading = '&nbsp;'.repeat(leadingSpaces[1].length);
      line = nbspLeading + line.substring(leadingSpaces[1].length);
    }

    // Convert multiple consecutive spaces (2 or more) within the line
    // Pattern: first space is normal (allows wrapping), rest are &nbsp;
    line = line.replace(/( {2,})/g, (match) => ' ' + '&nbsp;'.repeat(match.length - 1));

    return line;
  }

  /**
   * Parse a segment within a version
   */
  parseSegment() {
    this.skipBlankLines();

    const line = this.peek();
    if (!line || line.trim() === '----' || line.trim() === '====') {
      return null;
    }

    const segment = {};

    // Check for segment label
    if (line.trim().startsWith('{') && line.trim().endsWith('}') && !line.trim().startsWith('{{')) {
      const label = line.trim().slice(1, -1).trim();
      if (label && label !== 'Synopsis' && label !== 'Full') {
        segment.label = this.convertMarkup(this.substituteVariables(label));
        this.next();
        this.skipBlankLines();
      }
    }

    // Parse segment content. WYSIWYG poem lines are accumulated into runs; any
    // `<<< ... >>>` block (raw or markdown) is emitted as a separate HTML part
    // so it is rendered verbatim rather than <br/>-joined like poem lines.
    const parts = [];
    let run = [];
    let hasBlock = false;

    const flushRun = () => {
      const linesHtml = this.processWysiwygLines(run);
      if (linesHtml) parts.push({ type: 'lines', lines: linesHtml });
      run = [];
    };

    while (true) {
      const contentLine = this.peek();
      // A blank line ('') separates segments (the template renders a <br/>
      // between them), so it ends this segment without being consumed.
      if (contentLine === null ||
          contentLine === '' ||
          contentLine.trim() === '----' ||
          contentLine.trim() === '====') {
        break;
      }

      // Check if this is the start of a new segment (has a label)
      if (contentLine.trim().startsWith('{') && contentLine.trim().endsWith('}') &&
          !contentLine.trim().startsWith('{{')) {
        const possibleLabel = contentLine.trim().slice(1, -1).trim();
        if (possibleLabel && possibleLabel !== 'Synopsis' && possibleLabel !== 'Full') {
          // This is a new segment, stop here
          break;
        }
      }

      // Embedded literal/markdown block
      if (this.blockStartTag(contentLine) !== null) {
        hasBlock = true;
        flushRun();
        const { tag, lines } = this.readBlock();
        const html = this.renderBlock(tag, lines);
        if (html) parts.push({ type: 'html', html });
        continue;
      }

      // Substitute variables only (markup processing happens after joining lines)
      run.push(this.substituteVariables(this.next()));
    }
    flushRun();

    if (hasBlock) {
      // Mixed content: keep the ordered parts for the template to render.
      if (parts.length > 0) {
        segment.parts = parts;
      }
    } else {
      // Pure WYSIWYG: keep the simple `lines` shape (unchanged YAML output).
      if (parts.length > 0) {
        segment.lines = parts[0].lines;
      }
    }

    return (segment.lines || segment.parts) ? segment : null;
  }

  /**
   * Process a run of WYSIWYG poem lines (blockquotes + inline markup + nbsp)
   * into a single newline-joined HTML string with a trailing newline, or '' if
   * the run is empty after trimming surrounding blank lines.
   */
  processWysiwygLines(contentLines) {
    const lines = contentLines.slice();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    if (lines.length === 0) {
      return '';
    }

    // Handle blockquotes (lines starting with optional indentation followed by
    // '>') as a single block. Non-quote text is processed with markup
    // conversion which may span lines.
    const processedParts = [];
    let i = 0;
    while (i < lines.length) {
      const cur = lines[i];

      // Blockquote run
      if (/^\s*>/.test(cur)) {
        const quoteLines = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          // Strip leading indentation + '>' and an optional single space
          const inner = lines[i].replace(/^\s*>\s?/, '');
          quoteLines.push(inner);
          i++;
        }

        // Convert each inner line, strip any trailing <br/> introduced by
        // trailing spaces, then join with a single <br/> between lines.
        const processedLines = quoteLines.map(l => {
          let s = this.convertMarkup(l);
          s = s.replace(/\r?\n/g, '');
          s = s.replace(/(?:<br\/>)+$/g, '');
          return s;
        });

        processedParts.push(`<blockquote>${processedLines.join('<br/>')}</blockquote>`);
        continue;
      }

      // Non-quote block: gather contiguous non-quote lines and process
      const normalLines = [];
      while (i < lines.length && !/^\s*>/.test(lines[i])) {
        normalLines.push(lines[i]);
        i++;
      }

      const withMarkup = this.convertMarkup(normalLines.join('\n'));
      for (const l of withMarkup.split('\n')) {
        processedParts.push(l);
      }
    }

    return processedParts.map(line => this.convertSpacesToNbsp(line)).join('\n') + '\n';
  }

  /**
   * Parse audio section
   */
  parseAudio() {
    this.skipBlankLines();
    const audio = {};
    let hasAudio = false;

    while (true) {
      const line = this.peek();
      if (!line || line.trim() === '====') {
        break;
      }

      const trimmed = this.substituteVariables(line.trim());
      if (trimmed === 'Audiomack') {
        audio.audiomack = true;
        hasAudio = true;
        this.next();
      } else if (trimmed.startsWith('Suno:')) {
        const sunoPath = trimmed.substring(5).trim();
        if (sunoPath) {
          audio.suno = sunoPath;
          hasAudio = true;
        }
        this.next();
      } else if (trimmed === '') {
        this.next();
      } else {
        break;
      }
    }

    if (hasAudio) {
      this.result.audio = audio;
    }

    this.skipBlankLines();
  }

  /**
   * Parse postscript section
   */
  parsePostscript() {
    this.skipBlankLines();
    const postscripts = [];

    while (true) {
      this.skipBlankLines();

      // Check if we've hit the end marker or EOF
      const line = this.peek();
      if (!line || line.trim() === '====') {
        break;
      }

      const postscript = this.parsePostscriptNote();
      if (!postscript) {
        break;
      }
      postscripts.push(postscript);

      this.skipBlankLines();

      // Check for divider (optional - only required if there's another note)
      const divLine = this.peek();
      if (divLine && divLine.trim() === '----') {
        this.next();
        // Continue to parse next postscript note
      } else if (!divLine || divLine.trim() === '====') {
        break;
      } else {
        // Check if there might be another postscript note
        // (i.e., a label or content that's not a marker)
        if (divLine.trim().startsWith('{') || divLine.trim().startsWith('<<<')) {
          // There's another note without a divider - continue parsing
        } else {
          // Could be more content, let parsePostscriptNote decide
          break;
        }
      }
    }

    if (postscripts.length > 0) {
      this.result.postscript = postscripts;
    }

    this.skipBlankLines();
  }

  /**
   * Parse a single postscript note
   */
  parsePostscriptNote() {
    this.skipBlankLines();

    const line = this.peek();
    if (!line || line.trim() === '====') {
      return null;
    }

    // Check for literal block or reference
    if (this.blockStartTag(line) !== null) {
      return this.parseLiteralBlock();
    }

    const postscript = {};

    // Check for label
    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
      const label = line.trim().slice(1, -1).trim();
      if (label && label !== 'Synopsis' && label !== 'Full') {
        postscript.label = this.convertMarkup(this.substituteVariables(label));
        this.next();
        this.skipBlankLines();
      }
    }

    // Parse prose content as GitHub-Flavoured Markdown. Read raw lines (with
    // variable substitution) until a divider, end marker, or block marker, then
    // render the run as GFM. Single newlines are significant to Markdown, so the
    // lines are preserved rather than collapsed.
    const proseLines = [];
    while (true) {
      const contentLine = this.peek();

      // Stop at end of file or structural markers
      if (contentLine === null ||
          contentLine.trim() === '----' ||
          contentLine.trim() === '====' ||
          this.blockStartTag(contentLine) !== null) {
        break;
      }

      proseLines.push(this.substituteVariables(this.next()));
    }

    // Trim surrounding blank lines, then render
    while (proseLines.length > 0 && proseLines[0].trim() === '') {
      proseLines.shift();
    }
    while (proseLines.length > 0 && proseLines[proseLines.length - 1].trim() === '') {
      proseLines.pop();
    }
    if (proseLines.length > 0) {
      postscript.content = renderGfm(proseLines.join('\n'));
    }

    // Parse any literal blocks that follow
    const literalBlocks = [];
    while (true) {
      this.skipBlankLines();
      const nextLine = this.peek();

      // Stop at end of file or structural markers
      if (!nextLine || nextLine.trim() === '----' || nextLine.trim() === '====') {
        break;
      }

      // Check for literal block
      if (this.blockStartTag(nextLine) !== null) {
        const literalBlock = this.parseLiteralBlock();
        if (literalBlock) {
          literalBlocks.push(literalBlock);
        }
      } else {
        // Not a literal block, stop
        break;
      }
    }

    // Append literal blocks to content
    if (literalBlocks.length > 0) {
      for (const block of literalBlocks) {
        if (block.$ref) {
          // It's a $ref block, return just the reference
          return block;
        } else if (block.content) {
          // It's a literal content block, append to postscript content
          if (!postscript.content) {
            postscript.content = '';
          }
          postscript.content += '\n' + block.content;
        }
      }
    }

    return postscript.content || postscript.label ? postscript : null;
  }

  /**
   * Parse a `<<< ... >>>` block in a postscript context.
   *  - `<<<markdown` / `<<<md` -> rendered as GFM (with variable substitution)
   *  - bare `<<<` (or unknown tag) -> raw passthrough; a `$ref:` payload is
   *    returned as a reference object.
   */
  parseLiteralBlock() {
    const { tag, lines } = this.readBlock();

    if (tag === 'markdown' || tag === 'md') {
      return { content: this.renderBlock(tag, lines) };
    }

    // Raw passthrough
    const content = lines.join('\n');

    // Check if this is a $ref line
    if (content.trim().includes('$ref:')) {
      // Parse as YAML to get the reference
      try {
        const parsed = yaml.load(content.trim());
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].$ref) {
          return { '$ref': parsed[0].$ref };
        }
      } catch (e) {
        // If not valid YAML, fall through to return as literal content
      }
    }

    // Return the literal content as-is (no markup conversion)
    return { content: content };
  }

  /**
   * Parse analysis section
   */
  parseAnalysis() {
    this.skipBlankLines();

    const line = this.peek();
    if (!line || line.trim() === '====') {
      return;
    }

    const analysis = {};

    // Check for Synopsis
    if (line.trim() === '{Synopsis}') {
      this.next();
      this.skipBlankLines();
      analysis.synopsis = this.parseAnalysisContent();
      this.skipBlankLines();
    }

    // Check for Full
    const fullLine = this.peek();
    if (fullLine && fullLine.trim() === '{Full}') {
      this.next();
      this.skipBlankLines();
      analysis.full = this.parseAnalysisContent();
    }

    if (Object.keys(analysis).length > 0) {
      this.result.analysis = analysis;
    }
  }

  /**
   * Parse analysis content (synopsis or full) as GitHub-Flavoured Markdown.
   *
   * Collects the raw lines of the block (with variable substitution), then hands
   * them to the shared GFM renderer. Headings, lists, tables, fenced code and
   * blockquotes are all handled by markdown-it (see src/tools/markdown.js).
   */
  parseAnalysisContent() {
    const contentLines = [];

    while (true) {
      const line = this.peek();

      // Stop at end of file, end marker, or the next analysis label
      if (line === null ||
          line.trim() === '====' ||
          line.trim() === '{Synopsis}' ||
          line.trim() === '{Full}') {
        break;
      }

      contentLines.push(this.substituteVariables(this.next()));
    }

    // Trim leading/trailing blank lines before rendering
    while (contentLines.length > 0 && contentLines[0].trim() === '') {
      contentLines.shift();
    }
    while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
      contentLines.pop();
    }

    if (contentLines.length === 0) {
      return '';
    }

    return renderGfm(contentLines.join('\n'));
  }

  /**
   * Convert inline markup to HTML
   */
  convertMarkup(text) {
    // Process escapes first
    const escapes = new Map();
    let escapeIndex = 0;
    text = text.replace(/\\([_*~\[`"&'\-<>=$\\/{}])/g, (match, char) => {
      const placeholder = `\x00ESCAPE${escapeIndex++}\x00`;
      escapes.set(placeholder, char);
      return placeholder;
    });

    // Convert markup (process longer patterns first)
    text = text.replace(/---/g, '&#8212;'); // Em dash
    text = text.replace(/--/g, '&#8211;'); // En dash

    // Smart quotes (process BEFORE links and spans to avoid converting HTML attribute quotes)
    text = text.replace(/`([^`]+)`/g, '&#8216;$1&#8217;'); // Single quotes
    text = text.replace(/"([^"]+)"/g, '&#8220;$1&#8221;'); // Double quotes

    // Links: [text|url]
    text = text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="https://$2">$1</a>');

    // Span elements: /.classname{content}
    text = text.replace(/\/\.([^{]*)\{([^}]*)\}/g, (match, className, content) => {
      if (className === '') {
        console.warn('Warning: Span element with empty class name');
        return `<span>${content}</span>`;
      }

      // Validate class name with regex: /^\w(?:[\w\.-]*\w)?$/
      const classNameRegex = /^\w(?:[\w\.-]*\w)?$/;
      if (!classNameRegex.test(className)) {
        console.warn(`Warning: Invalid span class name: "${className}"`);
        return match; // Leave unchanged
      }

      return `<span class="${className}">${content}</span>`;
    });

    // Basic formatting (Markdown-style emphasis: ** = strong, * = em)
    text = text.replace(/\~([^~]+)\~/g, '<s>$1</s>'); // Strikethrough
    // Strong (double markers) must run before emphasis (single markers)
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // Strong
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>'); // Strong (underscore)
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Emphasis
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>'); // Emphasis (underscore)

    // Entities - convert & to &#38; but NOT if it's already part of an entity (&#...;)
    text = text.replace(/&(?!#\d+;|[a-z]+;)/gi, '&#38;');
    text = text.replace(/'/g, '&#39;');

    // Restore escapes
    for (const [placeholder, char] of escapes.entries()) {
      text = text.replace(placeholder, char);
    }

    // Hard line break: trailing two-or-more spaces before a newline (or end-of-string)
    // are converted to a hard line break <br/>. This applies outside literal blocks
    // and is intended to match the common Markdown behaviour for two-space line breaks.
    text = text.replace(/ {2,}(\r?\n|$)/g, '<br/>$1');

    return text;
  }
}

/**
 * Convert a .poem file to YAML
 */
function convertPoemToYaml(poemFilePath) {
  let content = fs.readFileSync(poemFilePath, 'utf8');

  // Prepend .shared.poem if it exists in the same directory
  const poemDir = path.dirname(poemFilePath);
  const sharedPoemPath = path.join(poemDir, '.shared.poem');

  if (fs.existsSync(sharedPoemPath)) {
    const sharedContent = fs.readFileSync(sharedPoemPath, 'utf8');
    content = sharedContent + content;
  }

  const parser = new PoemParser(content);
  const data = parser.parse();

  return yaml.dump(data, {
    lineWidth: -1, // Don't wrap lines
    noRefs: true,  // Don't use YAML references
  });
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: poem-to-yaml.js <file.poem> [output.yaml]');
    console.error('   or: poem-to-yaml.js --all');
    process.exit(1);
  }

  if (args[0] === '--all') {
    // Convert all .poem files in src/poems/poem/ directory
    const poemDir = path.join(process.cwd(), 'src', 'poems', 'poem');
    const yamlDir = path.join(process.cwd(), 'src', 'poems', 'yaml');
    const files = fs.readdirSync(poemDir);

    for (const file of files) {
      // Skip .shared.poem (it's included by other files)
      if (file.endsWith('.poem') && file !== '.shared.poem') {
        const poemPath = path.join(poemDir, file);
        const yamlPath = path.join(yamlDir, file.replace('.poem', '.yaml'));

        try {
          console.log(`Converting ${file}...`);
          const yamlContent = convertPoemToYaml(poemPath);
          fs.writeFileSync(yamlPath, yamlContent, 'utf8');
          console.log(`  → ${path.basename(yamlPath)}`);
        } catch (error) {
          console.error(`Error converting ${file}:`, error.message);
        }
      }
    }
  } else {
    // Convert single file
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace('.poem', '.yaml');

    try {
      const yamlContent = convertPoemToYaml(inputFile);
      fs.writeFileSync(outputFile, yamlContent, 'utf8');
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

module.exports = { PoemParser, convertPoemToYaml };
