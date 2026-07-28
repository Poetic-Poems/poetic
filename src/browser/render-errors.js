/**
 * Classified errors for the browser-safe renderer (./render.js, ./render-aggregate.js).
 *
 * The parse chain those two files call into (`PoemParser` in
 * ../tools/poem-parser.js, shared with the Node CLI build path) throws bare
 * `Error` instances with no `.code`/`.name`, so a `poetic/browser` consumer
 * can't distinguish error kinds without matching on `.message` text. Rather
 * than touch that shared parser (used by both the CLI and browser paths),
 * `classifyingCall` wraps each exported render function here: any error that
 * escapes becomes a `PoemRenderError` carrying `.name`/`.code`, classified by
 * message where the parser's failure modes are known, and a generic code
 * otherwise.
 */

class PoemRenderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PoemRenderError';
    this.code = code;
  }
}

// Messages thrown by src/tools/poem-parser.js's parseHeader() for a mandatory
// header field that's missing or malformed.
const KNOWN_MESSAGES = {
  'Missing title': 'MISSING_TITLE',
  'Missing date': 'MISSING_DATE',
  'Invalid or missing date': 'INVALID_DATE',
};

function codeFor(err) {
  if (KNOWN_MESSAGES[err.message]) return KNOWN_MESSAGES[err.message];
  // src/tools/poem-markup.js's reservedEscapeError().
  if (/^Reserved syntax:/.test(err.message)) return 'RESERVED_ESCAPE';
  return 'RENDER_ERROR';
}

/**
 * Run `fn`, converting any thrown error into a classified `PoemRenderError`.
 * An error that is already a `PoemRenderError` (e.g. from a nested call)
 * passes through unchanged rather than being re-wrapped.
 *
 * @param {() => any} fn
 * @returns {any} fn's return value
 */
function classifyingCall(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PoemRenderError) throw err;
    throw new PoemRenderError(err.message, codeFor(err));
  }
}

module.exports = { PoemRenderError, classifyingCall };
