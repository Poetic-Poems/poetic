/**
 * Inline-markup conversion for the WYSIWYG poem-body dialect: the grammar
 * section of poem-parser.js that turns already-variable-substituted plain
 * text into HTML (smart quotes, em/en dashes, emphasis/strong/strikethrough,
 * links, span elements, entity escaping, hard line breaks). These functions
 * carry no parser state of their own — each is a pure function of its text
 * argument — so they are extracted standalone rather than as class methods.
 *
 * Keep this module browser-safe: its only dependency is render-core.js
 * (itself fs-free), so do NOT add fs/path/__dirname or any other Node-only
 * dependency here.
 */

const { createEscapeProtector } = require('./render-core');

/**
 * The `\?` escape prefix is reserved for a future extended-escape family and
 * is not yet implemented (see docs/POEM-SYNTAX.md). Until then it is a hard
 * error wherever Poetic interprets its own escapes — the WYSIWYG poem body and
 * labels (convertMarkup) and parameter values (scanShellWord in
 * poem-parser.js). `\\?` (an escaped backslash, then a literal `?`) is the way
 * to write a literal `\?`.
 *
 * @returns {Error}
 */
function reservedEscapeError() {
  return new Error(
    "Reserved syntax: '\\?' is reserved but not yet implemented " +
    "(the '\\?' escape prefix is reserved for a future extended-escape family; " +
    "see docs/POEM-SYNTAX.md). Write '\\\\?' for a literal backslash then '?'."
  );
}

/**
 * `\?` is reserved for a future extended-escape family (see
 * docs/POEM-SYNTAX.md) and is an error until it is implemented. Only an
 * ODD backslash run before `?` triggers it; `\\?` (even) is a literal `\`
 * then `?`, decoded by the escape table in convertMarkup().
 *
 * Scanned by hand rather than with /(\\+)\?/g: that pattern is unanchored,
 * so CodeQL (js/polynomial-redos) flags it as vulnerable to polynomial
 * backtracking on a long backslash run not followed by `?` anywhere (same
 * root cause as poem-parser.js's joinContinuedLines()).
 *
 * @param {string} text
 */
function checkReservedEscape(text) {
  for (let searchIndex = 0; ;) {
    const qIndex = text.indexOf('?', searchIndex);
    if (qIndex === -1) break;
    let runStart = qIndex;
    while (runStart > 0 && text[runStart - 1] === '\\') runStart--;
    if ((qIndex - runStart) % 2 === 1) throw reservedEscapeError();
    searchIndex = qIndex + 1;
  }
}

/**
 * Convert spaces to non-breaking spaces in poem lines
 * - Leading spaces (indentation) are converted to &nbsp;
 * - Multiple consecutive spaces within lines are converted to alternating
 *   space + &nbsp; pattern (e.g., "  " becomes " &nbsp;") to allow wrapping
 *   on small displays while preserving visual spacing
 *
 * @param {string} line
 * @returns {string}
 */
function convertSpacesToNbsp(line) {
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
 * Convert inline markup to HTML
 *
 * @param {string} text
 * @returns {string}
 */
function convertMarkup(text) {
  checkReservedEscape(text);

  // Process escapes first. The escape class also decodes `\%` → `%`, but NOT
  // `\%{`: `\%{name}` is the render-time context-variable literal escape and
  // must survive this stage (it is decoded later by substituteContextVars()
  // in poem-render.js). The `%(?!\{)` alternative — a `%` not followed by `{`
  // — is what carves `\%{` out; every other class character is unconditional.
  const escapeProtector = createEscapeProtector();
  text = escapeProtector.protect(text, /\\(%(?!\{)|[_*~[`"&'\-<>=$\\/{}])/g);

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
  // Strikethrough is a two-character delimiter pair, like ** for strong: a
  // single ~ is deliberately left unassigned (plain literal text), reserved
  // for a possible future subscript syntax.
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>'); // Strikethrough
  // Strong (double markers) must run before emphasis (single markers)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // Strong
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>'); // Strong (underscore)
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Emphasis
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>'); // Emphasis (underscore)

  // Entities - convert & to &#38; but NOT if it's already part of an entity (&#...;)
  text = text.replace(/&(?!#\d+;|[a-z]+;)/gi, '&#38;');
  text = text.replace(/'/g, '&#39;');

  // Restore escapes in a single pass over the text, rather than one
  // replace() (and full rescan) per escape.
  text = escapeProtector.restore(text);

  // Hard line break: trailing two-or-more spaces before a newline (or end-of-string)
  // are converted to a hard line break <br/>. This applies outside literal blocks
  // and is intended to match the common Markdown behaviour for two-space line breaks.
  text = text.replace(/ {2,}(\r?\n|$)/g, '<br/>$1');

  return text;
}

module.exports = {
  reservedEscapeError,
  checkReservedEscape,
  convertSpacesToNbsp,
  convertMarkup,
};
