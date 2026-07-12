/**
 * Browser-safe aggregate renderers — index.html and all-poems.html built from
 * an in-memory list of poems rather than files on disk.
 *
 *   renderAllPoems(poems, opts) → a full all-poems.html document
 *   renderIndex(poems, opts)    → a full index.html document
 *
 * Companion to ./render.js (renderPoem/renderPoemPage): same fs-free contract
 * (no filesystem, no `__dirname`, no Pug compiler — see that file's header
 * comment and docs/RENDERER-BROWSER.md), same precompiled-template approach
 * (src/tools/poem-templates.js), reusing src/tools/render-core.js and the new
 * src/tools/aggregate-render-core.js (the aggregate analogue of render-core.js,
 * shared with the Node build path in src/tools/build-all-poems.js so the two
 * cannot silently diverge).
 *
 * `poems` is an array of `{ data, slug }`:
 *   - `data` is a poem's raw parsed poem-data, e.g. `new PoemParser(text).parse()`
 *     — the object *before* the slug/display-date augmentation `parseAndAugment`
 *     (./render.js) applies. Passing the pre-augmentation object here (rather
 *     than reusing parseAndAugment) keeps the raw ISO date available, so the
 *     all-poems.html date-range filter and the index.html JSON island's `date`
 *     field stay accurate — parseAndAugment overwrites `date` with a display
 *     string, from which the raw ISO date can no longer be recovered.
 *   - `slug` is caller-supplied per poem, exactly like renderPoem's opts.slug —
 *     an in-memory poem has no filename to derive one from.
 *
 * SECURITY — see ./render.js and docs/RENDERER-BROWSER.md: this output is
 * UNTRUSTED and unsanitised; the consumer must sanitise at the boundary.
 */

const { resolveContextVars, songsFor } = require('../tools/render-core');
const { renderFragmentTemplate } = require('../tools/poem-templates');
const { formatDateForDisplay, parseDateForSorting } = require('../tools/date-utils');
const {
  escapeAmpersand, summarizePoem, renderAllPoemsHtml, renderFreshIndexHtml,
} = require('../tools/aggregate-render-core');

/**
 * Render one poem's fragment HTML from its raw (pre-augmentation) data,
 * matching renderPoem()'s own parse → augment → resolve → render chain in
 * ./render.js, minus the initial parse (the caller already has `data`).
 */
function renderPoemDataFragment(data, slug, config) {
  const augmented = { ...data, slug, date: data.date ? formatDateForDisplay(data.date) : data.date };
  const resolved = resolveContextVars(augmented);
  const songs = songsFor(resolved, config);
  return renderFragmentTemplate({ ...resolved, songs, labelBase: '' });
}

/**
 * Render all-poems.html: every poem's fragment concatenated onto one page
 * behind a filterable/sortable table of contents, from an in-memory list —
 * matching build-all-poems.js's concatenateAllHtmlFiles() but with no `fs`
 * (no reading YAML files off disk; the caller supplies parsed poem data).
 *
 * @param {Array<{ data: object, slug: string }>} poems
 * @param {{ config?: object, title?: string, favicon?: string }} [opts]
 *   config  - the friendly subset of `.poetic-config` (drives song handlers).
 *   title   - site title (used in `<title>`/`<h1>`; default `'My Poems'`).
 *   favicon - favicon href, any leading `public/` already stripped
 *             (default `'poetic-logo.svg'`).
 * @returns {string} full HTML document — UNTRUSTED; sanitise before display
 */
function renderAllPoems(poems, opts = {}) {
  const { config = {}, title = 'My Poems', favicon = 'poetic-logo.svg' } = opts;

  const entries = poems.map(({ data, slug }) => ({
    ...summarizePoem({ data, slug }, config),
    content: renderPoemDataFragment(data, slug, config),
  }));

  // Oldest first, matching the Node build's display order.
  entries.sort((a, b) => parseDateForSorting(a.date) - parseDateForSorting(b.date));

  return renderAllPoemsHtml(entries, { siteTitle: escapeAmpersand(title), favicon });
}

/**
 * Render index.html: a JSON poem-data island consumed client-side by
 * public/index.js, from an in-memory list — matching build-all-poems.js's
 * generateIndexHtml() but always a fresh render. There is no fs-free analogue
 * of that function's self-heal/merge-into-an-existing-file step: that step is
 * specific to the Node build's incremental rewrite of a static file on disk,
 * whereas a hosted page is re-rendered fresh from current data on every
 * request.
 *
 * @param {Array<{ data: object, slug: string }>} poems
 * @param {{ config?: object, title?: string, subtitle?: string, favicon?: string }} [opts]
 *   config   - the friendly subset of `.poetic-config` (drives song handlers).
 *   title    - site title (used in `<title>`/`<h1>`; default `'My Poems'`).
 *   subtitle - nav subtitle (default `'My Poems'`).
 *   favicon  - favicon href, any leading `public/` already stripped
 *              (default `'poetic-logo.svg'`).
 * @returns {string} full HTML document — UNTRUSTED; sanitise before display
 */
function renderIndex(poems, opts = {}) {
  const {
    config = {}, title = 'My Poems', subtitle = 'My Poems', favicon = 'poetic-logo.svg',
  } = opts;

  const islandEntries = poems
    .map(({ data, slug }) => summarizePoem({ data, slug }, config))
    .sort((a, b) => a.slug.localeCompare(b.slug)) // alphabetical, matching the Node build
    .map((e) => ({
      file: `${e.slug}/`, title: e.title, hasAudio: e.hasAudio, date: e.isoDate, labels: e.labels,
    }));

  return renderFreshIndexHtml(islandEntries, { siteTitle: escapeAmpersand(title), subtitle, favicon });
}

module.exports = { renderAllPoems, renderIndex };
