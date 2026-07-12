/**
 * Browser-safe `.poem` renderer — the entry point Poetic Fiddle imports.
 *
 *   renderPoem(text, opts)      → an HTML fragment for the live preview
 *   renderPoemPage(text, opts)  → a full standalone HTML document (SSR share pages)
 *   renderAllPoems(poems, opts) → an all-poems.html document from an in-memory
 *                                 list of poems (see ./render-aggregate.js)
 *   renderIndex(poems, opts)    → an index.html document from an in-memory
 *                                 list of poems (see ./render-aggregate.js)
 *
 * All four run in a plain JS runtime (browser or edge) with NO filesystem
 * access, `__dirname`, or Pug compiler. The entire dependency graph reachable
 * from here is filesystem-free — poem-parser, render-core, aggregate-render-core,
 * song-handlers (+ generated song-handlers-data), the precompiled poem-templates,
 * slugify, date-utils, and the two npm deps markdown-it and js-yaml.
 * test/browser-render.test.js asserts that no module in this graph touches
 * `fs`/`path`/`__dirname`, and asserts byte-for-byte parity with the Node build
 * path over the poem corpus (for renderPoem/renderPoemPage).
 *
 * SECURITY — poem content in Fiddle is UNTRUSTED. This renderer is built on
 * markdown-it with `html: true` and performs NO sanitisation (the framework's
 * trusted-single-author model; see src/tools/markdown.js). The consumer MUST
 * sanitise the returned HTML at the boundary (e.g. DOMPurify) and serve it under
 * a strict Content-Security-Policy, with media embeds allow-listed and
 * sandboxed, before it reaches any viewer. See docs/RENDERER-BROWSER.md.
 */

const { PoemParser } = require('../tools/poem-parser');
const { resolveContextVars, songsFor } = require('../tools/render-core');
const { renderFragmentTemplate, renderPageTemplate } = require('../tools/poem-templates');
const { slugify } = require('../tools/slugify');
const { formatDateForDisplay } = require('../tools/date-utils');
const { renderAllPoems, renderIndex } = require('./render-aggregate');

/**
 * Parse `.poem` source and augment it exactly as the Node build does before
 * rendering: attach a URL slug and format the date for display. In the build the
 * slug comes from the source filename; an in-editor poem has no filename, so it
 * defaults to a slug derived from the title (override with `opts.slug`).
 *
 * @param {string} text
 * @param {{ slug?: string }} opts
 * @returns {object} poem-data object
 */
function parseAndAugment(text, opts) {
  const data = new PoemParser(text).parse();
  data.slug = opts.slug != null ? opts.slug : slugify(data.title || '');
  if (data.date) data.date = formatDateForDisplay(data.date);
  return data;
}

/**
 * Render `.poem` source to an HTML fragment (no `<html>`/`<head>`/`<body>`),
 * matching poem-render.js's renderFragment().
 *
 * @param {string} text - raw `.poem` source
 * @param {{ config?: object, slug?: string }} [opts]
 *   config - the friendly subset of `.poetic-config` that drives song handlers
 *   slug   - override the title-derived slug
 * @returns {string} HTML fragment — UNTRUSTED; sanitise before display
 */
function renderPoem(text, opts = {}) {
  const { config = {} } = opts;
  const data = resolveContextVars(parseAndAugment(text, opts));
  const songs = songsFor(data, config);
  return renderFragmentTemplate({ ...data, songs, labelBase: '' });
}

/**
 * Render `.poem` source to a full standalone HTML document, matching
 * poem-render.js's renderPage() — for SSR share pages (correct `<title>`, etc.).
 *
 * @param {string} text - raw `.poem` source
 * @param {{ config?: object, slug?: string, favicon?: string, subtitle?: string }} [opts]
 *   favicon must already have any leading "public/" stripped.
 * @returns {string} full HTML document — UNTRUSTED; sanitise before display
 */
function renderPoemPage(text, opts = {}) {
  const { config = {}, favicon = 'poetic-logo.svg', subtitle = 'My Poems' } = opts;
  const data = resolveContextVars(parseAndAugment(text, opts));
  const songs = songsFor(data, config);
  return renderPageTemplate({ ...data, favicon, subtitle, songs, labelBase: '../' });
}

module.exports = {
  renderPoem, renderPoemPage, parseAndAugment, renderAllPoems, renderIndex,
};
