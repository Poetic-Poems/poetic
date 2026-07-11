#!/usr/bin/env node
/**
 * Convert .poem files to YAML format
 * Based on poem-syntax.ebnf specification
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderGfm } = require('./markdown');
const { REPO_ROOT } = require('./repo-root');
const { needsRebuild, forceRebuildRequested } = require('./needs-rebuild');

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

    // Fold trailing-backslash line continuations into logical lines, before any
    // section parsing. `<<<...>>>` block interiors are left untouched.
    this.joinContinuedLines();

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

    if (this.eof()) return this.result;
    this.expectMarker('====', 'end-of-analysis');

    if (this.eof()) return this.result;
    this.parseMetadata();

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
   * Fold trailing-backslash line continuations into logical lines.
   *
   * A physical line ending in a run of N backslashes immediately before the
   * newline — with no trailing whitespace — contributes floor(N/2) literal
   * backslashes, and the newline is nullified (the next physical line is joined
   * on) iff N is odd. So a lone `\`+newline continues the line, while `\\`+
   * newline is one literal backslash with the newline kept; the rule chains, so
   * `\\\`+newline is one literal backslash followed by a continuation. This
   * mirrors the mid-line `\\`→`\` decoding done later by convertMarkup().
   *
   * Continuation does not reach into `<<<...>>>` blocks (raw literal or
   * markdown): their content is passed through or handed to another renderer
   * verbatim, so a trailing backslash there is kept as written. A dangling
   * continuation at end of file — or one whose next physical line is a
   * structural block marker — keeps its floor(N/2) literal backslashes with
   * nothing joined (the block marker is never swallowed).
   */
  joinContinuedLines() {
    const out = [];
    let inBlock = false;
    let i = 0;

    while (i < this.lines.length) {
      let line = this.lines[i];

      // Block markers and their interiors are opaque to continuation.
      if (this.blockStartTag(line) !== null) { inBlock = true; out.push(line); i++; continue; }
      if (this.isBlockEnd(line)) { inBlock = false; out.push(line); i++; continue; }
      if (inBlock) { out.push(line); i++; continue; }

      // Fold a (possibly multi-line) chain of continuations into `line`.
      while (true) {
        // Trailing backslash run, tolerating a CR from CRLF-terminated input.
        const m = line.match(/(\\+)(\r?)$/);
        if (m === null) break;

        const run = m[1].length;
        const cr = m[2];
        const head = line.slice(0, line.length - m[0].length);
        const literal = head + '\\'.repeat(Math.floor(run / 2));

        if (run % 2 === 0) { line = literal + cr; break; } // even: newline kept

        // Odd run: a continuation. Join the next physical line, unless there is
        // none (EOF) or it is a structural block marker (never swallowed).
        const next = this.lines[i + 1];
        if (next === undefined ||
            this.blockStartTag(next) !== null || this.isBlockEnd(next)) {
          line = literal;
          break;
        }
        line = literal + next;
        i++; // the next physical line has been consumed into this logical line
      }

      out.push(line);
      i++;
    }

    this.lines = out;
  }

  /**
   * The `\?` escape prefix is reserved for a future extended-escape family and
   * is not yet implemented (see TECH-DEBT TD26071201). Until then it is a hard
   * error wherever Poetic interprets its own escapes — the WYSIWYG poem body and
   * labels (convertMarkup) and parameter values (scanShellWord). `\\?` (an
   * escaped backslash, then a literal `?`) is the way to write a literal `\?`.
   */
  reservedEscapeError() {
    return new Error(
      "Reserved syntax: '\\?' is reserved but not yet implemented " +
      "(the '\\?' escape prefix is reserved for a future extended-escape family; " +
      "see TECH-DEBT TD26071201). Write '\\\\?' for a literal backslash then '?'."
    );
  }

  /**
   * Strip the ignored trailing text after a line-anchored token (spec section
   * 10: "Any text after a line-anchored token on the same line is ignored").
   * Applies to dividers/end markers and version/segment/analysis labels; leaves
   * everything else (including single-line variable values) untouched.
   *
   * A label token (`{...}` or `{{...}}`) may be followed by optional whitespace
   * then `(` — an optional parameter list. In that case the rest of the line is
   * kept as-is (not stripped): the closing `)` cannot be located here with a
   * regex because it may be hidden inside a quoted value, so the true end is
   * found later by the quote-aware scanner in parseParamList(). If the token is
   * NOT followed by `(` (after optional whitespace), trailing text is stripped
   * as before.
   */
  stripTrailingAfterToken(line) {
    let m;
    if ((m = line.match(/^(={4})(?!=)/))) return m[1];      // end marker ====
    if ((m = line.match(/^(-{4})(?!-)/))) return m[1];      // divider ----
    if ((m = line.match(/^(\{\{.*?\}\})(\s*)\(/))) return m[1] + line.slice(m[1].length); // version label with param list
    if ((m = line.match(/^(\{\{.*?\}\})/))) return m[1];    // version label {{...}}
    if (/^\{(?!\{)/.test(line)) {
      if ((m = line.match(/^(\{.*?\})(\s*)\(/))) return m[1] + line.slice(m[1].length); // segment/analysis label with param list
      if ((m = line.match(/^(\{.*?\})/))) return m[1];      // segment/analysis label {...}
    }
    return line;
  }

  /**
   * Split a label-bearing line into its label text and an optional trailing
   * parameter list: `{Label}(key=value, ...)` or `{{Label}}(key=value, ...)`.
   * `type` is '{{' for version labels (2 braces) or '{' for segment/postscript/
   * analysis labels (1 brace). Returns `{ label, params }` where `label` is the
   * raw (unsubstituted, unconverted) text between the braces, trimmed, and
   * `params` is the object returned by parseParamList(), or null when no
   * parameter list is present or it is malformed (existing "trailing text
   * ignored" behaviour then applies to whatever follows the closing brace(s)).
   */
  parseLabelWithParams(line, type) {
    const trimmed = line.trim();
    const braceLen = type === '{{' ? 2 : 1;
    const closeBrace = type === '{{' ? '}}' : '}';
    const closeIdx = trimmed.indexOf(closeBrace, braceLen);
    if (closeIdx === -1) {
      return { label: trimmed.slice(braceLen).trim(), params: null };
    }

    const label = trimmed.slice(braceLen, closeIdx).trim();
    const rest = trimmed.slice(closeIdx + closeBrace.length);
    const afterWs = rest.match(/^\s*(\(.*)$/s);
    const params = afterWs ? this.parseParamList(afterWs[1]) : null;

    return { label, params };
  }

  /**
   * Expand a `${name}` reference found at `str[at]` (where `str[at] === '$'`
   * and `str[at + 1] === '{'`). Looks for the next `}` anywhere later in `str`
   * (variable names cannot contain `{`, `}`, `$`, `<`, `>`, so the first `}`
   * closes the reference; a `:-default` fallback likewise cannot contain `}`).
   * The isolated `${...}` token is handed to substituteVariables(), so nested
   * references and the `:-default` fallback are resolved. Returns
   * `{ text, nextIndex }` with the substituted (or, if undefined, literal) text
   * and the index just past the closing `}`, or null if there is no `}` later
   * in the string (in which case `$` is not treated as starting a `${...}`
   * token, and is instead ordinary literal text - matching substituteVariables(),
   * which likewise leaves an unterminated `${` untouched).
   */
  expandVarAt(str, at) {
    const closeIdx = str.indexOf('}', at + 2);
    if (closeIdx === -1) return null;
    const token = str.slice(at, closeIdx + 1); // "${name}"
    return { text: this.substituteVariables(token), nextIndex: closeIdx + 1 };
  }

  /**
   * Scan one shell-style "word" (a parameter_value, or a parameter key/list
   * terminator context) starting at `str[i]`, stopping at the first
   * UNquoted, UNescaped `,`, `)`, or whitespace (or end of string). Returns
   * `{ value, nextIndex }` with the fully decoded/substituted text and the
   * index of the first character not consumed, or null if a quote is left
   * unterminated (the whole list is then malformed).
   *
   * The word is built by concatenating adjacent segments with no separator:
   *   - Single-quoted `'...'`: copied verbatim to the next `'`. No escapes,
   *     no substitution.
   *   - Double-quoted `"..."`: copied to the next UNescaped `"`. Inside:
   *     `\"`, `\\`, `\$`, and `` \` `` decode to the escaped character
   *     (literal - `\$` never triggers substitution); a backslash before any
   *     other character is kept literally (e.g. `\n` stays `\n`). An
   *     unescaped `${name}` is expanded. Everything else is literal.
   *   - Unquoted run: `\<char>` decodes to a literal `<char>` for ANY char
   *     (including space, `,`, `)`, the quote characters, `\`, and `$`); an
   *     unescaped `${name}` is expanded (spaces inside the braces do not end
   *     the value); an unescaped `'` or `"` opens a quoted segment
   *     (concatenated onto the value, scanning continues after it); an
   *     unescaped whitespace, `,`, or `)` ends the word; any other character
   *     is literal.
   *
   * Substitution happens inline, once per `${name}` occurrence (via
   * expandVarAt(), itself backed by substituteVariables()), in unquoted runs
   * and double-quoted segments - never for single-quoted segments or an
   * escaped `\$`. The expanded text is appended to the value directly and is
   * not itself re-scanned for further `${...}` or list syntax (`,`/`)`), so
   * neither a fresh substitution opportunity nor a premature list terminator
   * can be manufactured by what an expansion's value happens to contain.
   */
  scanShellWord(str, i) {
    const n = str.length;
    let value = '';

    while (true) {
      const c = str[i];

      if (c === undefined || c === ',' || c === ')' || /\s/.test(c)) {
        break; // unquoted, unescaped terminator (or end of string)
      }

      if (c === "'") {
        // Single-quoted: verbatim to the next "'". No escapes, no substitution.
        i++; // consume opening quote
        const start = i;
        while (i < n && str[i] !== "'") i++;
        if (i >= n) return null; // unterminated quote
        value += str.slice(start, i);
        i++; // consume closing quote
        continue;
      }

      if (c === '"') {
        // Double-quoted: to the next UNescaped '"'. Each unescaped "${name}"
        // is expanded inline (via expandVarAt(), which itself calls
        // substituteVariables() exactly once on the isolated "${...}" token);
        // decoded literal text (including a literal '$' from "\$") is
        // appended directly and is NEVER handed to substituteVariables()
        // itself, so a literal "${...}"-shaped run produced by unescaping
        // (e.g. `\$` followed by literal `{name}`) is not mistaken for a
        // fresh substitution and re-expanded.
        i++; // consume opening quote
        while (true) {
          if (i >= n) return null; // unterminated quote
          const dc = str[i];
          if (dc === '"') { i++; break; } // closing quote
          if (dc === '\\' && str[i + 1] === '?') throw this.reservedEscapeError();
          if (dc === '\\' && i + 1 < n && '"\\$`'.includes(str[i + 1])) {
            value += str[i + 1];
            i += 2;
            continue;
          }
          if (dc === '$' && str[i + 1] === '{') {
            const expanded = this.expandVarAt(str, i);
            if (expanded) {
              value += expanded.text;
              i = expanded.nextIndex;
              continue;
            }
          }
          value += dc; // backslash before any other char, or any other char, is literal
          i++;
        }
        continue;
      }

      if (c === '\\') {
        // Unquoted backslash-escape: literal next character, whatever it is.
        if (i + 1 < n) {
          if (str[i + 1] === '?') throw this.reservedEscapeError();
          value += str[i + 1];
          i += 2;
          continue;
        }
        // Trailing lone backslash at end of string: keep it literally.
        value += c;
        i++;
        break;
      }

      if (c === '$' && str[i + 1] === '{') {
        // Expanded inline (see the double-quoted branch above for why the
        // result is appended directly rather than substituted again).
        const expanded = this.expandVarAt(str, i);
        if (expanded) {
          value += expanded.text;
          i = expanded.nextIndex;
          continue;
        }
        // No matching '}' later in the string: '$' is ordinary literal text
        // (matches substituteVariables()'s regex, which likewise leaves an
        // unterminated '${' untouched). Consume just the '$' and re-loop, so
        // the literal-run accumulator below never has to special-case it.
        value += c;
        i++;
        continue;
      }

      // Accumulate a run of plain literal characters (avoids substituting
      // one char at a time, though correctness does not depend on this).
      let start = i;
      while (i < n) {
        const pc = str[i];
        if (pc === ',' || pc === ')' || pc === "'" || pc === '"' || pc === '\\' ||
            /\s/.test(pc) || (pc === '$' && str[i + 1] === '{')) {
          break;
        }
        i++;
      }
      value += str.slice(start, i);
    }

    return { value, nextIndex: i };
  }

  /**
   * Shell-word-aware parser for a `(key=value, ...)` parameter list. `str`
   * must start with `(`. Returns an object mapping keys (as authored,
   * hyphens preserved) to string values, or null if `str` does not start
   * with a well-formed `(...)` list (unterminated quote, no matching `)`, a
   * key that isn't `[A-Za-z][A-Za-z0-9_-]*`, or a missing `=`). An empty
   * list `()` returns `{}`.
   *
   * There is no separate pre-scan to find the matching top-level `)`: the
   * single pass below both locates it and decodes values, via
   * scanShellWord() (see its docstring for the value/substitution rules),
   * so a `,`/`)` that is quoted or backslash-escaped in an unquoted context
   * is correctly treated as literal rather than as list syntax in either
   * role.
   */
  parseParamList(str) {
    if (str[0] !== '(') return null;

    const params = {};
    const keyRe = /^[A-Za-z][A-Za-z0-9_-]*/;
    let i = 1; // past the opening '('
    const n = str.length;
    const skipWs = () => { while (i < n && /[^\S\n]/.test(str[i])) i++; };

    skipWs();
    if (str[i] === ')') return params; // "()" -> no parameters

    while (true) {
      skipWs();
      const keyMatch = keyRe.exec(str.slice(i));
      if (!keyMatch) return null;
      const key = keyMatch[0];
      i += key.length;

      skipWs();
      if (str[i] !== '=') return null;
      i++; // consume '='
      skipWs();

      const scanned = this.scanShellWord(str, i);
      if (!scanned) return null; // unterminated quote
      params[key] = scanned.value;
      i = scanned.nextIndex;

      skipWs();

      if (str[i] === ',') { i++; continue; }
      if (str[i] === ')') return params;
      return null; // unexpected character (or end of string) before ')'
    }
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
        this.checkReservedName(varName);
        // Store the value raw; nested ${...} are resolved lazily, at use.
        this.variables.set(varName, varValue);
        i++;
        continue; // Don't add to newLines (remove from content)
      }

      // Check for multi-line variable start: ={name}<<= ...
      const multiLineMatch = line.match(/^=\{([^}]+)\}<<=.*$/);
      if (multiLineMatch) {
        const varName = multiLineMatch[1];
        this.checkReservedName(varName);
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

    // Expand standalone multi-line variable references (a `${name}` alone on its
    // line) into that variable's body lines, recursively. Values are kept raw:
    // every ${...} reference (nested or not) is resolved exactly once, at its
    // point of use, by substituteVariables() during the structural parse. This
    // gives nested references late (dynamic) binding. Single-line and inline
    // references are left untouched here for that later resolution.
    this.lines = this.expandStandaloneRefs(this.lines, []);
  }

  /**
   * Recursively expand standalone multi-line variable references (`${name}` on
   * its own line) into the referenced variable's raw body lines. `stack` guards
   * against reference cycles (a self-referential multi-line variable is left as
   * a literal line with a warning rather than looping forever). Lines that are
   * not standalone references to a multi-line variable are passed through
   * unchanged.
   */
  expandStandaloneRefs(lines, stack) {
    const out = [];
    for (const line of lines) {
      const m = line.trim().match(/^\$\{([^}]+)\}$/);
      if (m) {
        const name = m[1];
        const value = this.variables.get(name);
        if (Array.isArray(value)) {
          if (stack.includes(name)) {
            console.warn(`Warning: Variable reference cycle detected at '\${${name}}'; left unexpanded.`);
            out.push(line);
          } else {
            out.push(...this.expandStandaloneRefs(value, stack.concat(name)));
          }
          continue;
        }
        // Single-line variable, undefined, or a `%{...}`-style token: leave the
        // line for substituteVariables() (or the render stage) to handle.
      }
      out.push(line);
    }
    return out;
  }

  /**
   * Throw if `name` uses the reserved eager/early-binding form (a leading `!`,
   * e.g. `={!name}=`). The behaviour is reserved for a future release; parsing
   * it now is an error rather than a silently-accepted ordinary name.
   */
  checkReservedName(name) {
    if (name[0] === '!') {
      throw new Error(
        `Reserved syntax: eager/early-binding variable '={!${name.slice(1)}}=' ` +
        `is reserved but not yet implemented (a leading '!' in a variable name is reserved).`
      );
    }
  }

  /**
   * Substitute author `${...}` variable references in `text`.
   *
   *   ${name}          - the variable's value (its last definition in the file).
   *                      Nested ${...} inside that value are expanded
   *                      recursively, at use (late/dynamic binding).
   *   ${name:-default} - `default` when `name` is undefined.
   *   \${...}          - a literal `${...}` (the leading backslash is consumed).
   *
   * A reference cycle resolves to the literal `${...}` and warns (no infinite
   * loop). Context references (`%{...}`) are NOT touched here - they are left
   * for the render stage. The reserved eager form `${!name}` throws.
   */
  substituteVariables(text) {
    return this.expandVars(text, []);
  }

  /**
   * Core scanner for substituteVariables(). Walks `text` left to right so that
   * `\${...}` escaping is honoured exactly once; `stack` carries the chain of
   * variables currently being expanded, for cycle detection.
   */
  expandVars(text, stack) {
    let out = '';
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (c === '\\' && text[i + 1] === '$' && text[i + 2] === '{') {
        // Escaped reference: emit a literal "${"; the name and closing "}"
        // that follow are ordinary characters and are copied verbatim.
        out += '${';
        i += 3;
        continue;
      }
      if (c === '$' && text[i + 1] === '{') {
        const close = text.indexOf('}', i + 2);
        if (close === -1) { out += c; i++; continue; }
        const inner = text.slice(i + 2, close);
        i = close + 1;
        out += inner === '' ? '${}' : this.resolveVar(inner, stack);
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  /**
   * Resolve the interior of one `${...}` reference (`inner` is the text between
   * the braces): apply the `:-default` fallback, cycle detection, and recursive
   * expansion of the resulting value.
   */
  resolveVar(inner, stack) {
    if (inner[0] === '!') {
      throw new Error(
        `Reserved syntax: eager/early-binding reference '\${${inner}}' is reserved ` +
        `but not yet implemented (a leading '!' in a variable name is reserved).`
      );
    }
    let name = inner;
    let fallback = null;
    const sep = inner.indexOf(':-');
    if (sep !== -1) {
      name = inner.slice(0, sep);
      fallback = inner.slice(sep + 2);
    }
    if (stack.includes(name)) {
      console.warn(`Warning: Variable reference cycle detected at '\${${name}}'; left unexpanded.`);
      return '${' + inner + '}';
    }
    if (this.variables.has(name)) {
      let value = this.variables.get(name);
      if (Array.isArray(value)) value = value.join('\n');
      return this.expandVars(value, stack.concat(name));
    }
    if (fallback !== null) {
      return this.expandVars(fallback, stack);
    }
    this.usedBeforeDefined.add(name);
    return '${' + inner + '}';
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
   * Render a block's inner lines to an HTML fragment based on its tag. Author
   * `${...}` variables are substituted in every block (a block suppresses
   * Markdown rendering, not variable substitution):
   *   markdown/md -> GFM
   *   anything else -> raw passthrough (no Markdown conversion)
   */
  renderBlock(tag, lines) {
    const substituted = lines.map(l => this.substituteVariables(l));
    if (tag === 'markdown' || tag === 'md') {
      return renderGfm(substituted.join('\n'));
    }
    return substituted.join('\n');
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
  // `name` documents which marker each call site expects (e.g.
  // 'end-of-poem'); kept for call-site readability, not yet threaded into a
  // failure message.
  // eslint-disable-next-line no-unused-vars -- see comment above
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
    if (firstLine.trim().startsWith('{{') && firstLine.trim().includes('}}')) {
      const { label, params } = this.parseLabelWithParams(firstLine, '{{');
      if (label) {
        version.label = this.convertMarkup(this.substituteVariables(label));
      }
      if (params) {
        version.params = params;
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
    if (line.trim().startsWith('{') && line.trim().includes('}') && !line.trim().startsWith('{{')) {
      const { label, params } = this.parseLabelWithParams(line, '{');
      if (label && label !== 'Synopsis' && label !== 'Full') {
        segment.label = this.convertMarkup(this.substituteVariables(label));
        if (params) {
          segment.params = params;
        }
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
      if (contentLine.trim().startsWith('{') && contentLine.trim().includes('}') &&
          !contentLine.trim().startsWith('{{')) {
        const { label: possibleLabel } = this.parseLabelWithParams(contentLine, '{');
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
   * Parse the optional trailing param list on an audio (song-service) line —
   * `(audio)`, `(video)`, `(ratio=16/9)`, `(video, ratio=21:9)`, `(height=360)`.
   *
   * An optional leading bare token (an identifier NOT followed by `=`) is the
   * media type: `audio` or `video`. The remaining `key=value` pairs are parsed
   * by the shared quote-aware parseParamList(). Recognised keys are `ratio`,
   * `height`, and the reserved (not-yet-applied) `width`; unknown bare tokens
   * and unknown keys warn and are ignored. Ratio/height values are stored raw;
   * they are normalised and validated later, in song-handlers.js resolveSongs().
   *
   * @param {string} paramStr - the trailing "(...)" group, including the parens
   * @param {string} service  - the lower-cased service name (for warnings)
   * @returns {{ media?: string, ratio?: string, height?: string }}
   */
  parseAudioParams(paramStr, service) {
    const out = {};
    const inner = paramStr.slice(1); // drop the opening '('

    // Peel an optional leading bare media token (identifier not followed by '=').
    let rest = inner;
    const bare = inner.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?=[,)])/);
    if (bare) {
      const token = bare[1].toLowerCase();
      if (token === 'audio' || token === 'video') {
        out.media = token;
      } else {
        console.warn(`Warning: audio line for "${service}" has an unknown media token "${bare[1]}" — ignoring it.`);
      }
      rest = inner.slice(bare[0].length);
      if (rest[0] === ',') rest = rest.slice(1); // drop the separator after the token
    }

    // Parse any remaining key=value pairs with the shared quote-aware scanner.
    const params = this.parseParamList('(' + rest);
    if (params === null) {
      // parseParamList returns null both for a genuinely malformed list and for
      // "no pairs at all" (e.g. "(audio)"): only warn when text actually remains.
      if (rest.replace(/[\s)]/g, '') !== '') {
        console.warn(`Warning: audio line for "${service}" has a malformed parameter list "${paramStr}" — ignoring it.`);
      }
      return out;
    }

    for (const [key, val] of Object.entries(params)) {
      const k = key.toLowerCase();
      if (k === 'ratio' || k === 'height') {
        out[k] = val;
      } else if (k === 'width') {
        // reserved for future use — accepted silently, not yet applied.
      } else {
        console.warn(`Warning: audio line for "${service}" has an unknown parameter "${key}" — ignoring it.`);
      }
    }
    return out;
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
      if (trimmed === '') {
        this.next();
        continue;
      }

      // A song line names a service, either bare ("Audiomack") or with a value
      // ("Suno: s/xyz", "YouTube: dQw4…"), plus an optional trailing param list
      // ("Mega: id#key (video, ratio=21:9)"). The service becomes a lower-cased
      // key; a song handler (builtin or from .poetic-config.yaml) renders it
      // later. The trailing " (...)" group is matched separately so it is not
      // swallowed into the value (song values contain no whitespace-preceded
      // "(", so a whitespace-preceded group is unambiguous). Anything that is
      // not a service line stops the audio section, matching the behaviour for
      // stray prose before a missing ==== marker.
      const m = trimmed.match(/^([A-Za-z][\w-]*)\s*(?::\s*(.*?))?(?:\s+(\(.*\)))?$/);
      if (!m) {
        break;
      }
      const key = m[1].toLowerCase();
      const rawValue = m[2];   // undefined for a bare service line
      const paramStr = m[3];   // undefined when there is no trailing param list

      if (paramStr === undefined) {
        if (rawValue === undefined) {
          audio[key] = true;
          hasAudio = true;
        } else {
          const value = rawValue.trim();
          if (value) {
            audio[key] = value;
            hasAudio = true;
          }
        }
      } else {
        const value = (rawValue === undefined || rawValue.trim() === '') ? true : rawValue.trim();
        const parsed = this.parseAudioParams(paramStr, key);
        const entry = { value };
        if (parsed.media) entry.media = parsed.media;
        if (parsed.ratio != null) entry.ratio = parsed.ratio;
        if (parsed.height != null) entry.height = parsed.height;
        audio[key] = entry;
        hasAudio = true;
      }
      this.next();
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
    if (line.trim().startsWith('{') && line.trim().includes('}')) {
      const { label, params } = this.parseLabelWithParams(line, '{');
      if (label && label !== 'Synopsis' && label !== 'Full') {
        postscript.label = this.convertMarkup(this.substituteVariables(label));
        if (params) {
          postscript.params = params;
        }
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

    // Raw passthrough: author ${...} variables are still substituted (a block
    // suppresses Markdown, not variable substitution); renderBlock() applies it
    // for the raw tag without any Markdown conversion.
    const content = this.renderBlock(tag, lines);

    // Check if this is a $ref line
    if (content.trim().includes('$ref:')) {
      // Parse as YAML to get the reference
      try {
        const parsed = yaml.load(content.trim());
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].$ref) {
          return { '$ref': parsed[0].$ref };
        }
      } catch (_) {
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

    // Check for Synopsis. Analysis labels don't take a documented parameter
    // list, but parseLabelWithParams is still used to recognise the label
    // when one is (erroneously) present, so a trailing `(...)` can't corrupt
    // the `{Synopsis}` match; any params found are discarded.
    if (line.trim().startsWith('{') && line.trim().includes('}')) {
      const { label } = this.parseLabelWithParams(line, '{');
      if (label === 'Synopsis') {
        this.next();
        this.skipBlankLines();
        analysis.synopsis = this.parseAnalysisContent();
        this.skipBlankLines();
      }
    }

    // Check for Full
    const fullLine = this.peek();
    if (fullLine && fullLine.trim().startsWith('{') && fullLine.trim().includes('}')) {
      const { label } = this.parseLabelWithParams(fullLine, '{');
      if (label === 'Full') {
        this.next();
        this.skipBlankLines();
        analysis.full = this.parseAnalysisContent();
      }
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
   * Parse metadata section (directives and labels)
   *
   * Reads lines until the end-of-file marker (====) or EOF, without
   * consuming the marker. Recognises three line shapes (checked in this
   * order):
   *   - blank line -> skipped
   *   - `#` followed by whitespace or end-of-line -> a comment, skipped
   *   - directive line (`%name key:value ...`) -> appended to
   *     this.result.directives as { name, attributes? }
   *   - label line (`#label`) -> appended (de-duplicated, first-seen order)
   *     to this.result.labels
   * Any other line is unrecognised and produces a warning.
   */
  parseMetadata() {
    this.skipBlankLines();

    const directiveRe = /^\s*%([\w.-]+)((?:\s+[\w.]+:[\w.-]+)*)(\s+#.*)?\s*$/i;
    const labelRe = /^\s*#([^&<>\\#\s]+?)(\s+#.*)?\s*$/i;
    const seenLabels = new Set();

    while (true) {
      const line = this.peek();
      if (line === null || line.trim() === '====') {
        break;
      }

      const trimmed = line.trim();

      if (trimmed === '') {
        this.next();
        continue;
      }

      // Comment: '#' followed by whitespace or end-of-line
      if (/^\s*#(\s|$)/.test(line)) {
        this.next();
        continue;
      }

      const directiveMatch = line.match(directiveRe);
      if (directiveMatch) {
        const directive = { name: directiveMatch[1] };
        const attrsRaw = directiveMatch[2] ? directiveMatch[2].trim() : '';
        if (attrsRaw !== '') {
          const attributes = {};
          for (const token of attrsRaw.split(/\s+/)) {
            const colonIndex = token.indexOf(':');
            const key = token.slice(0, colonIndex);
            const value = token.slice(colonIndex + 1);
            attributes[key] = value;
          }
          directive.attributes = attributes;
        }
        if (!this.result.directives) {
          this.result.directives = [];
        }
        this.result.directives.push(directive);
        this.next();
        continue;
      }

      const labelMatch = line.match(labelRe);
      if (labelMatch) {
        const label = labelMatch[1];
        if (!seenLabels.has(label)) {
          seenLabels.add(label);
          if (!this.result.labels) {
            this.result.labels = [];
          }
          this.result.labels.push(label);
        }
        this.next();
        continue;
      }

      console.warn(`Warning: unrecognised metadata line: "${trimmed}"`);
      this.next();
    }

    this.skipBlankLines();
  }

  /**
   * Convert inline markup to HTML
   */
  convertMarkup(text) {
    // `\?` is reserved for a future extended-escape family (TD26071201) and is
    // an error until it is implemented. Only an ODD backslash run before `?`
    // triggers it; `\\?` (even) is a literal `\` then `?`, decoded by the escape
    // table below.
    for (const m of text.matchAll(/(\\+)\?/g)) {
      if (m[1].length % 2 === 1) throw this.reservedEscapeError();
    }

    // Process escapes first
    const escapes = new Map();
    let escapeIndex = 0;
    text = text.replace(/\\([_*~[`"&'\-<>=$\\/{}])/g, (match, char) => {
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

      // Validate class name with regex: /^\w(?:[\w.-]*\w)?$/
      const classNameRegex = /^\w(?:[\w.-]*\w)?$/;
      if (!classNameRegex.test(className)) {
        console.warn(`Warning: Invalid span class name: "${className}"`);
        return match; // Leave unchanged
      }

      // Dots separate multiple classes: `/.a.b{x}` → class="a b" (hyphens are
      // part of a single class name and are preserved).
      const classAttr = className.split('.').filter(Boolean).join(' ');
      return `<span class="${classAttr}">${content}</span>`;
    });

    // Basic formatting (Markdown-style emphasis: ** = strong, * = em)
    text = text.replace(/~([^~]+)~/g, '<s>$1</s>'); // Strikethrough
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
/**
 * Parse a .poem file into a structured poem-data object, prepending a shared
 * poem's variable definitions when present. This is the single canonical
 * parse used by both the YAML pipeline and the raw plain-text converter, so
 * variable handling stays identical across outputs.
 *
 * `options.sharedPoemPath`, when given, overrides the default lookup of
 * `<poem's directory>/.shared.poem` — pass `null` to skip the prepend
 * entirely (e.g. for hermetic tests/fixtures that must not depend on
 * whatever `.shared.poem` happens to be on disk).
 */
function parsePoemFile(poemFilePath, options = {}) {
  let content = fs.readFileSync(poemFilePath, 'utf8');

  const sharedPoemPath = 'sharedPoemPath' in options
    ? options.sharedPoemPath
    : path.join(path.dirname(poemFilePath), '.shared.poem');

  if (sharedPoemPath && fs.existsSync(sharedPoemPath)) {
    const sharedContent = fs.readFileSync(sharedPoemPath, 'utf8');
    content = sharedContent + content;
  }

  return new PoemParser(content).parse();
}

function convertPoemToYaml(poemFilePath, options = {}) {
  const data = parsePoemFile(poemFilePath, options);

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
    const poemDir = path.join(REPO_ROOT, 'src', 'poems', 'poem');
    const yamlDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml');
    const files = fs.readdirSync(poemDir);
    const force = forceRebuildRequested();

    let errorCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      // Skip partial/private files (starting with '_' or '.', e.g. .shared.poem)
      if (file.endsWith('.poem') && !file.startsWith('_') && !file.startsWith('.')) {
        const poemPath = path.join(poemDir, file);
        const yamlPath = path.join(yamlDir, file.replace('.poem', '.yaml'));
        const sharedPoemPath = path.join(poemDir, '.shared.poem');
        const inputs = [poemPath, ...(fs.existsSync(sharedPoemPath) ? [sharedPoemPath] : [])];

        if (!needsRebuild(yamlPath, inputs, { force })) {
          console.log(`⏭  Skipping ${file} (up to date)`);
          skippedCount++;
          continue;
        }

        try {
          console.log(`Converting ${file}...`);
          const yamlContent = convertPoemToYaml(poemPath);
          fs.writeFileSync(yamlPath, yamlContent, 'utf8');
          console.log(`  → ${path.basename(yamlPath)}`);
        } catch (error) {
          console.error(`Error converting ${file}:`, error.message);
          errorCount++;
        }
      }
    }

    if (skippedCount > 0) {
      console.log(`⏭  ${skippedCount} poem(s) already up to date, skipped.`);
    }

    // Warn about stale YAML artefacts that have no active source poem.
    const activePoemBases = new Set(
      files
        .filter(f => f.endsWith('.poem') && !f.startsWith('_') && !f.startsWith('.'))
        .map(f => f.replace('.poem', '.yaml'))
    );
    const existingYamls = fs.readdirSync(yamlDir).filter(
      f => f.endsWith('.yaml') && !f.startsWith('_') && !f.startsWith('.') && f !== 'YAML-SCHEMA.yaml'
    );
    for (const stale of existingYamls.filter(f => !activePoemBases.has(f))) {
      console.warn(`Warning: stale YAML artefact (no source poem): src/poems/yaml/${stale}`);
    }

    if (errorCount > 0) {
      console.error(`\n📊 ${errorCount} poem(s) failed to convert.`);
      process.exit(1);
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

module.exports = { PoemParser, convertPoemToYaml, parsePoemFile };
