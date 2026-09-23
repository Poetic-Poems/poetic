/**
 * Mandatory-header error messages shared between `poem-parser.js` (the
 * throw sites) and `src/browser/render-errors.js` (which classifies a
 * failure into a `.code` by matching these same strings as prefixes — each
 * throw site appends ` (line N)`). Keeping them as named constants means a
 * wording change can't silently desync the two.
 *
 * Keep this module browser-safe: it has no dependencies, so do NOT add
 * fs/path/__dirname or any other Node-only dependency here.
 */

const MISSING_TITLE = 'Missing title';
const MISSING_DATE = 'Missing date';
const INVALID_DATE = 'Invalid or missing date';

module.exports = { MISSING_TITLE, MISSING_DATE, INVALID_DATE };
