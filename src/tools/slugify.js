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

module.exports = { slugify };
