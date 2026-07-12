/**
 * Pure, filesystem-free helpers for building the index/all-poems aggregate
 * pages, shared by the Node build path (build-all-poems.js) and the browser
 * renderer (src/browser/render-aggregate.js) — the aggregate analogue of
 * render-core.js's single-poem sharing.
 *
 * Keep this module browser-safe: its only dependencies are date-utils.js and
 * song-handlers.js (both themselves fs-free), so do NOT add `fs`/`path`/
 * `__dirname` or any other Node-only dependency here.
 */

const { formatDateForDisplay, toISODate } = require('./date-utils');
const { hasResolvableSongs } = require('./song-handlers');

/**
 * HTML-entity-escape "&" only (matching the em-dash-style entities already
 * used in these generated pages) — used for the site title, which is
 * interpolated into <title>/<h1> outside any templating engine's own
 * escaping.
 */
function escapeAmpersand(str) {
  return str.replace(/&/g, '&#38;');
}

/**
 * Summarise a poem's raw parsed data (e.g. `new PoemParser(text).parse()`,
 * or a YAML-loaded poem-data object, in either case *before* slug/date
 * augmentation) into the flat shape both aggregate renderers need: display
 * date, ISO date (for sorting/filtering), whether it has a resolvable song
 * embed, and its labels.
 *
 * @param {{ data: object, slug: string }} poem - raw poem-data + an explicit
 *   slug (an in-memory poem has no filename to derive one from, same
 *   convention as renderPoem's opts.slug in src/browser/render.js).
 * @param {object} [config] - parsed .poetic-config.yaml (drives song handlers)
 * @returns {{ slug: string, title: string, date: string, isoDate: string,
 *   hasAudio: boolean, labels: string[] }}
 */
function summarizePoem({ data, slug }, config = {}) {
  const rawDate = data.date;
  return {
    slug,
    title: data.title,
    date: rawDate ? formatDateForDisplay(rawDate) : 'Unknown Date',
    isoDate: rawDate ? (toISODate(rawDate) || '') : '',
    hasAudio: hasResolvableSongs(data.audio, config),
    labels: Array.isArray(data.labels) ? data.labels : [],
  };
}

/**
 * Build the `<script type="application/json" id="poem-data">...</script>`
 * island consumed client-side by public/index.js. `entries` are objects
 * shaped `{ file, title, hasAudio, date, labels }` (`date` here is the raw
 * ISO yyyy-mm-dd string, or `""` — index.js formats it client-side).
 *
 * JSON.stringify does not escape "<", so a poem title containing
 * "</script>" would end the <script> element early in the browser; escape
 * every "<" as the equivalent JSON string escape (JSON.parse restores it).
 */
function buildPoemDataIsland(entries) {
  const json = JSON.stringify(entries, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/json" id="poem-data">\n${json}\n    </script>\n` +
    '    <script src="index.js" defer></script>';
}

/**
 * Build a fresh index.html document from already-built poem-data island
 * entries (see buildPoemDataIsland above). This is the "no existing file"
 * shape only — merging into/self-healing an existing index.html is specific
 * to the Node build's incremental rewrite of a static file
 * (build-all-poems.js's generateIndexHtml) and has no fs-free analogue: a
 * from-scratch render always produces this shape.
 *
 * @param {Array<{file, title, hasAudio, date, labels}>} islandEntries
 * @param {{ siteTitle: string, subtitle: string, favicon: string }} opts
 * @returns {string} full HTML document
 */
function renderFreshIndexHtml(islandEntries, { siteTitle, subtitle, favicon }) {
  const poemDataIsland = buildPoemDataIsland(islandEntries);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle}</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${siteTitle}</h1>
            <p class="subtitle">${subtitle}</p>
        </div>

        <!-- The title filter bar is inserted here by renderPoems()/setupHomeFilter() in index.js. -->
        <div class="poem-grid" id="poemGrid">
            <!-- Poems will be populated by JavaScript -->
        </div>

        <div class="links">
            <a href="all-poems.html">View All Poems</a>
        </div>
    </div>

    ${poemDataIsland}
</body>
</html>`;
}

/**
 * Build all-poems.html from already-summarised + already-rendered poem
 * entries (see summarizePoem above); `entries[i].content` is the poem's
 * rendered fragment HTML (see render-core.js / poem-templates.js), and
 * `entries` must already be sorted into display order (oldest first,
 * matching the Node build).
 *
 * @param {Array<{slug, title, date, isoDate, hasAudio, content}>} entries
 * @param {{ siteTitle: string, favicon: string }} opts
 * @returns {string} full HTML document
 */
function renderAllPoemsHtml(entries, { siteTitle, favicon }) {
  if (entries.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No Poems Found</title>
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
</head>
<body>
    <div class="container">
        <div class="poem-section text-center">
            <h1>No Poems Found</h1>
            <p>No YAML files were found in the poems directory.</p>
        </div>
    </div>
</body>
</html>`;
  }

  const isoDates = entries.map((e) => e.isoDate).filter(Boolean);
  const minIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a < b ? a : b)) : '';
  const maxIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a > b ? a : b)) : '';
  const dateBoundsAttrs = isoDates.length ? ` min="${minIsoDate}" max="${maxIsoDate}"` : '';

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle} &#8212; Concatenated View</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
    <script src="date-utils.js" defer></script>
    <script src="all-poems.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${siteTitle}</h1>
            <p class="subtitle">Concatenated view of all poems (${entries.length} poems)</p>
            <a href="index.html" class="back-link">← Back to Main Page</a>
        </div>

        <div class="filter-bar" id="filterBar">
            <label class="filter-field">
                <span class="filter-icon" aria-hidden="true">🔍</span>
                <input type="search" id="poemFilter" class="filter-input" placeholder="Filter poems…" aria-label="Filter poems by text" autocomplete="off">
            </label>
            <div class="scope-toggle" role="group" aria-label="Search scope">
                <button type="button" class="scope-led is-on" id="scopeTitles" aria-pressed="true"><span class="led" aria-hidden="true"></span>Titles</button>
                <button type="button" class="scope-led is-on" id="scopeLyrics" aria-pressed="true"><span class="led" aria-hidden="true"></span>Lyrics</button>
                <button type="button" class="scope-led is-on" id="scopeLabels" aria-pressed="true"><span class="led" aria-hidden="true"></span>Labels</button>
            </div>
            <div class="date-range">
                <label class="date-field">From <input type="date" id="dateFrom" class="filter-date"${dateBoundsAttrs}></label>
                <label class="date-field">To <input type="date" id="dateTo" class="filter-date"${dateBoundsAttrs}></label>
            </div>
            <button type="button" class="filter-reset" id="filterReset">Clear</button>
            <span class="filter-count" id="filterCount" aria-live="polite"></span>
        </div>

        <div class="toc">
            <h2>Table of Contents</h2>
            <table class="toc-table" id="poemTable">
                <thead>
                    <tr>
                        <th class="sortable" aria-sort="none"><button type="button" class="sort-button" data-column="0" data-sort-type="title">Poem Title</button></th>
                        <th class="sortable" aria-sort="none"><button type="button" class="sort-button" data-column="1" data-sort-type="date">Poem Date</button></th>
                        <th class="sortable" aria-sort="none"><button type="button" class="sort-button" data-column="2" data-sort-type="audio">🎵 Audio</button></th>
                    </tr>
                </thead>
                <tbody id="poemTableBody">`;

  entries.forEach((poem) => {
    const audioIcon = poem.hasAudio ? '🎵' : '';
    html += `<tr>
                        <td><a href="#poem-${poem.slug}">${poem.title}</a></td>
                        <td>${poem.date}</td>
                        <td class="audio-cell">${audioIcon}</td>
                    </tr>`;
  });

  html += `</tbody>
            </table>
        </div>`;

  entries.forEach((poem) => {
    html += `
        <div class="poem-section" id="poem-${poem.slug}" data-date="${poem.isoDate || ''}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content">${poem.content}</div>
        </div>`;
  });

  html += `
    </div>
</body>
</html>`;

  return html;
}

module.exports = {
  escapeAmpersand,
  summarizePoem,
  buildPoemDataIsland,
  renderFreshIndexHtml,
  renderAllPoemsHtml,
};
