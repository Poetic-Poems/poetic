/**
 * Slug helpers.
 *
 * Dependency-free by design so this module is safe to bundle for the browser
 * (see src/browser/render.js): do NOT add `require('path')`/`fs` or any other
 * Node-only dependency here.
 */

/**
 * Utility function to slugify text
 * This matches the logic from the Pug template
 */
function slugify(text) {
  text = text.toLowerCase().trim();
  text = text.replace(/[^a-z0-9 -]/g, '');
  text = text.replace(/ +/g, '-');
  return text;
}

/**
 * Derive a poem's URL slug from its source filename (the .poem/.yaml stem).
 * The stem is passed through slugify() so the result is always URL-safe;
 * for already-clean stems (lowercase, hyphens, alphanumerics) this is a no-op.
 *
 * The stem is computed without the `path` module (basename + last-extension
 * strip), matching `path.basename(filePath, path.extname(filePath))`: the
 * directory and a single trailing extension are removed, but a leading-dot
 * name (e.g. `.shared`) keeps its stem, since such a name has no extension.
 */
function slugFromFile(filePath) {
  let base = String(filePath).replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  if (dot > 0) base = base.slice(0, dot);
  return slugify(base);
}

module.exports = { slugify, slugFromFile };
