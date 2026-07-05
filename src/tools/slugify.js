const path = require('path');

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
 */
function slugFromFile(filePath) {
  return slugify(path.basename(filePath, path.extname(filePath)));
}

module.exports = { slugify, slugFromFile };
