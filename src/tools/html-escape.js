/**
 * Escapes text for safe interpolation into HTML (as element content or
 * inside a double-quoted or single-quoted attribute value).
 *
 * Dependency-free by design: this module is required by both plain Node
 * CLI tools and aggregate-render-core.js (which must stay browser-safe), so
 * do NOT add `fs`/`path`/`__dirname` or any other Node-only dependency here.
 */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
