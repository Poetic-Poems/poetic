/**
 * Metadata-line recognition for the `.poem` grammar: the pure line-matchers
 * behind the Metadata section and the Preamble directive pre-pass
 * (`parseDirectiveLine`, `matchLabelLine`, and the `matchesTrailingComment`
 * helper they share). These functions carry no parser state of their own —
 * each is a pure function of the line text (and, for the trailing-comment
 * helper, a start index) — so they extract standalone, following the
 * pure-function, browser-safe pattern poem-markup.js and poem-variables.js
 * establish. The parser-cursor-driven loop that walks `this.lines` and
 * appends to `this.result.directives`/`this.result.labels` (parseMetadata,
 * extractPreambleDirectives, pushDirective) stays on PoemParser: it is
 * inherently stateful, not a candidate for this kind of extraction.
 *
 * Keep this module browser-safe: it has no dependencies, so do NOT add
 * fs/path/__dirname or any other Node-only dependency here.
 */

/**
 * Consume the optional trailing `#comment` (which requires at least one
 * whitespace character before the `#`) and any trailing whitespace, from
 * `start` to end of `line`. Returns `true` if the remainder of the line is
 * exhausted this way, `false` if unconsumed non-whitespace content remains.
 * Shared by parseDirectiveLine() and matchLabelLine(), whose PCRE
 * equivalents both end in `(\s+#.*)?\s*$`.
 *
 * @param {string} line
 * @param {number} start - index to begin scanning from
 * @returns {boolean}
 */
function matchesTrailingComment(line, start) {
  const len = line.length;
  let i = start;
  while (i < len && /\s/.test(line[i])) i++;
  if (i > start && line[i] === '#') return true;
  return i === len;
}

/**
 * Recognise a directive line (`%name key:value ...`, with an optional trailing
 * `# comment`) and build its structured form. Returns `{ name, attributes? }`
 * — where `attributes` maps each `key:value` token (split on its first `:`)
 * and is omitted entirely when the directive has no attributes — or `null`
 * when `line` is not a directive.
 *
 * Shared by the Metadata section (parseMetadata) and the Preamble pre-pass
 * (extractPreambleDirectives), so a directive parses identically wherever it
 * is declared.
 *
 * Scanned by hand rather than with
 * /^\s*%([\w.-]+)((?:\s+[\w.]+:[\w.-]+)*)(\s+#.*)?\s*$/i: CodeQL
 * (js/polynomial-redos) flags that pattern's repeated `key:value` group as
 * vulnerable to polynomial backtracking on adversarial input.
 *
 * @param {string} line
 * @returns {{name: string, attributes?: object}|null}
 */
function parseDirectiveLine(line) {
  const len = line.length;
  let i = 0;
  while (i < len && /\s/.test(line[i])) i++;
  if (line[i] !== '%') return null;
  i++;

  const nameStart = i;
  while (i < len && /[\w.-]/.test(line[i])) i++;
  if (i === nameStart) return null;
  const name = line.slice(nameStart, i);

  const attributes = {};
  let hasAttributes = false;

  while (true) {
    let j = i;
    while (j < len && /\s/.test(line[j])) j++;
    if (j === i) break;

    const keyStart = j;
    while (j < len && /[\w.]/.test(line[j])) j++;
    if (j === keyStart || line[j] !== ':') break;
    const key = line.slice(keyStart, j);
    j++;

    const valueStart = j;
    while (j < len && /[\w.-]/.test(line[j])) j++;
    if (j === valueStart) break;

    attributes[key] = line.slice(valueStart, j);
    hasAttributes = true;
    i = j;
  }

  if (!matchesTrailingComment(line, i)) return null;

  const directive = { name };
  if (hasAttributes) directive.attributes = attributes;
  return directive;
}

/**
 * Recognise a label line (`#label`, with an optional trailing `# comment`)
 * and return the label text, or `null` when `line` is not a label.
 *
 * Scanned by hand rather than with
 * /^\s*#([^&<>\\#\s]+?)(\s+#.*)?\s*$/i: CodeQL (js/polynomial-redos) flags
 * that pattern's lazy label capture as vulnerable to polynomial
 * backtracking on adversarial input.
 *
 * @param {string} line
 * @returns {string|null}
 */
function matchLabelLine(line) {
  const len = line.length;
  let i = 0;
  while (i < len && /\s/.test(line[i])) i++;
  if (line[i] !== '#') return null;
  i++;

  const labelStart = i;
  while (i < len && !/[\s&<>\\#]/.test(line[i])) i++;
  if (i === labelStart) return null;
  const label = line.slice(labelStart, i);

  if (!matchesTrailingComment(line, i)) return null;

  return label;
}

module.exports = {
  matchesTrailingComment,
  parseDirectiveLine,
  matchLabelLine,
};
