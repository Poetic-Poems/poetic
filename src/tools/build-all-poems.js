#!/usr/bin/env node
/**
 * Build script to generate all-poems.html and index.html for GitHub Pages.
 * Individual poems are already built by the previous step in the npm script chain.
 *
 * Changes vs. v0.1:
 *   - Renders poem fragments in-memory via poem-render (no longer reads <slug>.html files).
 *   - Adds <script src="poetic.js" defer> to all-poems.html (shared Audiomack loader).
 *   - Index links now point to <slug>/ (clean URL) instead of <slug>.html.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { slugFromFile } = require("./slugify");
const { parseDateForSorting, formatDateForDisplay, toISODate } = require("./date-utils");
const { readPoeticConfig } = require("./poetic-config");
const { loadPoemData, renderFragment } = require("./poem-render");
const { REPO_ROOT } = require("./repo-root");
const beautify = require("js-beautify");

/**
 * Check if a poem has any active audio files
 */
function hasActiveAudio(audioData) {
  if (!audioData || typeof audioData !== "object") {
    return false;
  }

  for (const platform in audioData) {
    const entries = audioData[platform];
    if (platform === 'suno') {
      if (typeof entries === 'string' && entries.trim()) {
        return true;
      }
    } else if (platform === 'audiomack') {
      if (entries === true) {
        return true;
      }
    } else if (Array.isArray(entries)) {
      if (entries.some((entry) => entry.active === true)) {
        return true;
      }
    }
  }

  return false;
}

function concatenateAllHtmlFiles(dirPath, favicon = "poetic-logo.svg", audiomackArtist = "") {
  try {
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml");
    const yamlFiles = fs
      .readdirSync(poemsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .filter((file) => !file.startsWith("YAML-SCHEMA"))
      .filter((file) => !file.startsWith("_")); // Skip files beginning with underscore

    if (yamlFiles.length === 0) {
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

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((file) => {
      const yamlPath = path.join(poemsDir, file);

      try {
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const data = yaml.load(yamlContent);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${file}, skipping`);
          return;
        }

        const slug = slugFromFile(file);
        const fileName = slug;

        // Skip index.html and all-poems.html
        if (fileName === "index" || fileName === "all-poems") {
          return;
        }

        const anchor = `poem-${fileName}`;
        const date = data.date ? formatDateForDisplay(data.date) : "Unknown Date";
        const isoDate = data.date ? toISODate(data.date) : "";
        const hasSongLink = hasActiveAudio(data.audio);
        const labels = Array.isArray(data.labels) ? data.labels : [];

        poemData.push({
          fileName,
          slug,
          title,
          date,
          isoDate,
          anchor,
          yamlPath,
          hasSongLink,
          labels,
        });
      } catch (err) {
        console.warn(`Warning: Could not read ${file}:`, err.message);
      }
    });

    // Sort poems by date (oldest first) for display order
    poemData.sort((a, b) => {
      const aDate = parseDateForSorting(a.date);
      const bDate = parseDateForSorting(b.date);
      return aDate - bDate; // oldest first
    });

    // Regenerate anchors based on sorted order
    poemData.forEach((poem) => {
      poem.anchor = `poem-${poem.fileName}`;
    });

    // Compute the corpus min/max ISO dates (ignoring poems without a date) so
    // the filter bar's date-range inputs can be bounded to the actual data.
    const isoDates = poemData.map((poem) => poem.isoDate).filter(Boolean);
    const minIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a < b ? a : b)) : "";
    const maxIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a > b ? a : b)) : "";
    const dateBoundsAttrs = isoDates.length ? ` min="${minIsoDate}" max="${maxIsoDate}"` : "";

    let concatenatedContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity &#8212; Concatenated View</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fragments &#38; Unity</h1>
            <p class="subtitle">Concatenated view of all poems (${poemData.length} poems)</p>
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
                        <th class="sortable" onclick="sortTable(0, 'title')">Poem Title</th>
                        <th class="sortable" onclick="sortTable(1, 'date')">Poem Date</th>
                        <th class="sortable" onclick="sortTable(2, 'audio')">🎵 Audio</th>
                    </tr>
                </thead>
                <tbody id="poemTableBody">`;

    // Add table rows with poem data
    poemData.forEach((poem) => {
      const audioIcon = poem.hasSongLink ? "🎵" : "";
      concatenatedContent += `<tr>
                        <td><a href="#${poem.anchor}">${poem.title}</a></td>
                        <td>${poem.date}</td>
                        <td class="audio-cell">${audioIcon}</td>
                    </tr>`;
    });

    concatenatedContent += `</tbody>
            </table>
        </div>`;

    // Render each poem fragment in-memory (no file reads)
    poemData.forEach((poem) => {
      try {
        const poemDataObj = loadPoemData(poem.yamlPath);
        if (!poemDataObj) {
          throw new Error(`Failed to load poem data from ${poem.yamlPath}`);
        }
        const poemContent = renderFragment(poemDataObj, { audiomackArtist });

        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}" data-date="${poem.isoDate || ''}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content">${poemContent}</div>
        </div>`;
      } catch (err) {
        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}" data-date="${poem.isoDate || ''}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content"><p class="no-content">Error rendering poem: ${err.message}</p></div>
        </div>`;
      }
    });

    concatenatedContent += `
    </div>

    <script>
        let currentSort = { column: -1, direction: 'asc' };

        function parseDate(dateStr) {
            if (dateStr === "Unknown Date") return new Date(0);

            // Ensure dateStr is a string
            if (typeof dateStr !== 'string') {
                dateStr = String(dateStr);
            }

            // Handle both yyyy-mm-dd and "DayOfWeek, DD Month YYYY" formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                const date = new Date(dateStr + 'T00:00:00');
                return isNaN(date.getTime()) ? new Date(0) : date;
            }

            // Handle display format: "Monday, 4 May 2015" or "Friday, 1 August 1997"
            const months = {
                'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
                'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
            };

            const parts = dateStr.split(', ');
            if (parts.length >= 2) {
                const datePart = parts[1].split(' ');
                if (datePart.length >= 3) {
                    const day = parseInt(datePart[0]);
                    const month = months[datePart[1]];
                    const year = parseInt(datePart[2]);
                    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                        return new Date(year, month, day);
                    }
                }
            }
            return new Date(0); // fallback for invalid dates
        }

        function sortTable(columnIndex, sortType) {
            const table = document.getElementById('poemTable');
            const tbody = document.getElementById('poemTableBody');
            const rows = Array.from(tbody.getElementsByTagName('tr'));

            // Determine sort direction
            if (currentSort.column === columnIndex) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.direction = 'asc';
            }
            currentSort.column = columnIndex;

            // Update header styling
            const headers = table.getElementsByTagName('th');
            for (let i = 0; i < headers.length; i++) {
                headers[i].className = 'sortable';
                if (i === columnIndex) {
                    headers[i].className = currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc';
                }
            }

            // Sort rows
            rows.sort((a, b) => {
                const aVal = a.cells[columnIndex].textContent.trim();
                const bVal = b.cells[columnIndex].textContent.trim();

                let comparison = 0;

                if (sortType === 'date') {
                    const aDate = parseDate(aVal);
                    const bDate = parseDate(bVal);
                    comparison = aDate - bDate;
                } else if (sortType === 'audio') {
                    // Audio sorting: songs first (🎵), then no audio
                    const aHasAudio = aVal.includes('🎵');
                    const bHasAudio = bVal.includes('🎵');
                    comparison = bHasAudio - aHasAudio; // Songs first (1-0 = 1, 0-1 = -1)
                } else {
                    // String comparison (for titles)
                    comparison = aVal.localeCompare(bVal);
                }

                return currentSort.direction === 'asc' ? comparison : -comparison;
            });

            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
        }

        // Back to Top functionality
        const backToTopButton = document.createElement('button');
        backToTopButton.className = 'back-to-top';
        backToTopButton.innerHTML = '↑';
        backToTopButton.setAttribute('aria-label', 'Back to top');
        backToTopButton.onclick = () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        };
        document.body.appendChild(backToTopButton);

        // Show/hide button based on scroll position
        function toggleBackToTop() {
            if (window.pageYOffset > 300) {
                backToTopButton.classList.add('visible');
            } else {
                backToTopButton.classList.remove('visible');
            }
        }

        // Listen for scroll events
        window.addEventListener('scroll', toggleBackToTop);
        // Check on page load
        toggleBackToTop();

        // Filter bar: live text search (titles/lyrics) + date range
        function initFilterBar() {
            const filterInput = document.getElementById('poemFilter');
            const dateFrom = document.getElementById('dateFrom');
            const dateTo = document.getElementById('dateTo');
            const scopeTitlesBtn = document.getElementById('scopeTitles');
            const scopeLyricsBtn = document.getElementById('scopeLyrics');
            const scopeLabelsBtn = document.getElementById('scopeLabels');
            const resetBtn = document.getElementById('filterReset');
            const countEl = document.getElementById('filterCount');

            const sections = Array.from(document.querySelectorAll('.poem-section'));
            const scope = { titles: true, lyrics: true, labels: true };

            // textContent ignores <br> entirely (unlike innerText, it inserts no
            // whitespace), so adjacent lines can fuse into one word at a <br>
            // boundary (e.g. "cavernous<br>Now" -> "cavernousNow", which
            // spuriously contains "snow"). Replace <br> with a space on a clone
            // before reading textContent so line boundaries can't fuse words.
            function textOf(el) {
                if (!el) return '';
                const clone = el.cloneNode(true);
                clone.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
                return clone.textContent;
            }

            const index = sections.map((section) => {
                const titleEl = section.querySelector('.poem-title a');
                const bodyEl = section.querySelector('.poem-body');
                const link = document.querySelector('#poemTableBody a[href="#' + section.id + '"]');
                return {
                    section: section,
                    title: textOf(titleEl).toLowerCase(),
                    body: textOf(bodyEl).toLowerCase(),
                    labels: Array.from(section.querySelectorAll('.poem-label')).map((el) => textOf(el).toLowerCase()),
                    date: section.getAttribute('data-date') || '',
                    row: link ? link.closest('tr') : null
                };
            });

            function updateScopeButton(btn, on) {
                if (!btn) return;
                if (on) {
                    btn.classList.add('is-on');
                } else {
                    btn.classList.remove('is-on');
                }
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }

            function toggleScope(key, btn) {
                const next = !scope[key];
                if (!next) {
                    const othersOn = ['titles', 'lyrics', 'labels'].some((k) => k !== key && scope[k]);
                    if (!othersOn) {
                        // Refuse to turn off the last remaining active scope
                        return;
                    }
                }
                scope[key] = next;
                updateScopeButton(btn, next);
                applyFilters();
            }

            function applyFilters() {
                const q = (filterInput ? filterInput.value : '').trim().toLowerCase();
                const from = dateFrom ? dateFrom.value : '';
                const to = dateTo ? dateTo.value : '';
                let visibleCount = 0;

                index.forEach((entry) => {
                    const textMatch = q === ''
                        || (scope.titles && entry.title.includes(q))
                        || (scope.lyrics && entry.body.includes(q))
                        || (scope.labels && entry.labels.some((l) => l.includes(q)));
                    const dateMatch = (!from || entry.date === '' || entry.date >= from)
                        && (!to || entry.date === '' || entry.date <= to);
                    const visible = textMatch && dateMatch;

                    if (visible) {
                        entry.section.classList.remove('hidden');
                        if (entry.row) entry.row.classList.remove('hidden');
                        visibleCount++;
                    } else {
                        entry.section.classList.add('hidden');
                        if (entry.row) entry.row.classList.add('hidden');
                    }
                });

                if (countEl) {
                    const filterActive = q !== '' || !!from || !!to || !scope.titles || !scope.lyrics || !scope.labels;
                    countEl.textContent = filterActive
                        ? ('Showing ' + visibleCount + ' of ' + index.length)
                        : '';
                }
                syncUrl();
            }

            function syncUrl() {
                const params = new URLSearchParams();
                const q = filterInput ? filterInput.value.trim() : '';
                if (q) params.set('q', q);
                const activeScopes = ['titles', 'lyrics', 'labels'].filter((k) => scope[k]);
                if (activeScopes.length < 3) params.set('scope', activeScopes.join(','));
                if (dateFrom && dateFrom.value) params.set('from', dateFrom.value);
                if (dateTo && dateTo.value) params.set('to', dateTo.value);
                const qs = params.toString();
                history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
            }

            function readUrl() {
                const params = new URLSearchParams(location.search);
                if (filterInput && params.has('q')) filterInput.value = params.get('q');
                if (params.has('scope')) {
                    const wanted = params.get('scope').split(',').map((s) => s.trim().toLowerCase());
                    const next = {
                        titles: wanted.includes('titles'),
                        lyrics: wanted.includes('lyrics'),
                        labels: wanted.includes('labels')
                    };
                    if (next.titles || next.lyrics || next.labels) {
                        scope.titles = next.titles;
                        scope.lyrics = next.lyrics;
                        scope.labels = next.labels;
                    }
                }
                if (dateFrom && params.has('from')) dateFrom.value = params.get('from');
                if (dateTo && params.has('to')) dateTo.value = params.get('to');
                updateScopeButton(scopeTitlesBtn, scope.titles);
                updateScopeButton(scopeLyricsBtn, scope.lyrics);
                updateScopeButton(scopeLabelsBtn, scope.labels);
            }

            if (scopeTitlesBtn) {
                scopeTitlesBtn.addEventListener('click', () => toggleScope('titles', scopeTitlesBtn));
            }
            if (scopeLyricsBtn) {
                scopeLyricsBtn.addEventListener('click', () => toggleScope('lyrics', scopeLyricsBtn));
            }
            if (scopeLabelsBtn) {
                scopeLabelsBtn.addEventListener('click', () => toggleScope('labels', scopeLabelsBtn));
            }
            if (filterInput) filterInput.addEventListener('input', applyFilters);
            if (dateFrom) dateFrom.addEventListener('change', applyFilters);
            if (dateTo) dateTo.addEventListener('change', applyFilters);

            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    if (filterInput) filterInput.value = '';
                    if (dateFrom) dateFrom.value = '';
                    if (dateTo) dateTo.value = '';
                    scope.titles = true;
                    scope.lyrics = true;
                    scope.labels = true;
                    updateScopeButton(scopeTitlesBtn, true);
                    updateScopeButton(scopeLyricsBtn, true);
                    updateScopeButton(scopeLabelsBtn, true);
                    applyFilters();
                });
            }

            readUrl();
            applyFilters();
        }

        initFilterBar();
    </script>
</body>
</html>`;

    return concatenatedContent;
  } catch (err) {
    return `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`;
  }
}

// Canonical rendering logic for the poem grid on index.html. Kept as a single
// source of truth so it can both seed a fresh index.html and self-heal an
// existing one on every build (see the `indexContent.replace` call below).
const RENDER_POEMS_SCRIPT = `        function formatPoemDate(dateStr) {
            const parts = dateStr.split('-').map(Number);
            if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        }

        function homeFilterQuery() {
            const input = document.getElementById('poemFilter');
            return input ? input.value.trim().toLowerCase() : '';
        }

        function setupHomeFilter() {
            const grid = document.getElementById('poemGrid');
            if (!grid || !grid.parentNode) return;
            // Create the filter bar if it isn't already in the page (a
            // previously-built index.html may already carry static markup).
            if (!document.getElementById('filterBar')) {
                const bar = document.createElement('div');
                bar.className = 'filter-bar';
                bar.id = 'filterBar';
                bar.innerHTML = '<label class="filter-field"><span class="filter-icon" aria-hidden="true">🔍</span>'
                    + '<input type="search" id="poemFilter" class="filter-input" placeholder="Filter by title…" aria-label="Filter poems by title" autocomplete="off"></label>'
                    + '<span class="filter-count" id="filterCount" aria-live="polite"></span>';
                grid.parentNode.insertBefore(bar, grid);
            }
            // Wire the input once, whether the bar was just created or already
            // present statically — otherwise a static bar has no listener.
            const input = document.getElementById('poemFilter');
            if (input && !input.dataset.filterWired) {
                input.dataset.filterWired = '1';
                input.addEventListener('input', renderPoems);
            }
        }

        function renderPoems() {
            setupHomeFilter();
            const grid = document.getElementById('poemGrid');
            grid.innerHTML = '';
            const q = homeFilterQuery();
            const matches = q ? allPoems.filter(function (p) { return p.title.toLowerCase().includes(q); }) : allPoems;

            matches.forEach(poem => {
                const card = document.createElement('div');
                card.className = 'poem-card';
                card.innerHTML = \`
                    <div class="poem-title">
                        <a href="\${poem.file}">\${poem.title}</a>
                        \${poem.hasAudio ? '<span class="audio-indicator">🎵</span>' : ''}
                    </div>
                    \${poem.date ? \`<div class="poem-date">\${formatPoemDate(poem.date)}</div>\` : ''}
                    \${poem.labels && poem.labels.length ? '<div class="poem-card-labels">' + poem.labels.map(function (label) { return '<a class="poem-card-label" href="all-poems.html?scope=labels&q=' + encodeURIComponent(label) + '" onclick="event.stopPropagation()">' + label + '</a>'; }).join('') + '</div>' : ''}
                \`;

                card.addEventListener('click', () => {
                    window.location.href = poem.file;
                });

                grid.appendChild(card);
            });

            const count = document.getElementById('filterCount');
            if (count) count.textContent = q ? ('Showing ' + matches.length + ' of ' + allPoems.length) : '';
            if (!matches.length) {
                const empty = document.createElement('p');
                empty.className = 'filter-empty';
                empty.textContent = 'No poems match “' + q + '”.';
                grid.appendChild(empty);
            }
        }

        // Initial render
        renderPoems();`;

function generateIndexHtml(publicDir, favicon = "poetic-logo.svg", subtitle = undefined) {
  try {
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml");
    const yamlFiles = fs
      .readdirSync(poemsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .filter((file) => !file.startsWith("YAML-SCHEMA"))
      .filter((file) => !file.startsWith("_")) // Skip files beginning with underscore
      .sort(); // Sort alphabetically for consistent ordering

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((yamlFile) => {
      const yamlPath = path.join(poemsDir, yamlFile);

      try {
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const data = yaml.load(yamlContent);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${yamlFile}, skipping`);
          return;
        }

        const slug = slugFromFile(yamlFile);

        // Skip index and all-poems
        if (slug === "index" || slug === "all-poems") {
          return;
        }

        // Clean URL: point to slug/ directory instead of slug.html
        const file = `${slug}/`;
        const hasAudio = hasActiveAudio(data.audio);
        const date = toISODate(data.date);
        const labels = Array.isArray(data.labels) ? data.labels : [];

        poemData.push({
          file: file,
          title: title,
          hasAudio: hasAudio,
          date: date,
          labels: labels,
        });
      } catch (err) {
        console.warn(`Warning: Could not read ${yamlFile}:`, err.message);
      }
    });

    // Generate the JavaScript array for the poems
    const poemArrayString = poemData
      .map((poem) => {
        const labelsArrayString = poem.labels
          .map((label) => `"${String(label).replace(/"/g, '\\"')}"`)
          .join(", ");
        return `        {
          file: "${poem.file}",
          title: "${poem.title.replace(/"/g, '\\"')}",
          hasAudio: ${poem.hasAudio},
          date: ${poem.date ? `"${poem.date}"` : "null"},
          labels: [${labelsArrayString}],
        }`;
      })
      .join(",\n");

    const indexPath = path.join(publicDir, "index.html");

    // Check if index.html exists, if not create a default template
    let indexContent;
    if (fs.existsSync(indexPath)) {
      // Read the existing index.html file
      indexContent = fs.readFileSync(indexPath, "utf8");

      // Replace the existing poem array in the JavaScript
      indexContent = indexContent.replace(
        /const allPoems = \[[\s\S]*?\];/,
        `const allPoems = [\n${poemArrayString}\n      ];`
      );
      // Keep the favicon in sync with config
      indexContent = indexContent.replace(
        /<link rel="icon" href="[^"]*"/,
        `<link rel="icon" href="${favicon}"`
      );
      // Keep the subtitle in sync with config (only if explicitly set)
      if (subtitle) {
        indexContent = indexContent.replace(
          /<p class="subtitle">[^<]*<\/p>/,
          `<p class="subtitle">${subtitle}</p>`
        );
      }

      // Strip the legacy inline <style> block now that its rules live in poetic.css
      indexContent = indexContent.replace(/\n?\s*<style>[\s\S]*?<\/style>/, "");

      // Ensure CSS/JS links are present (inject after favicon if missing)
      const needsCss = !indexContent.includes('href="poetic.css"');
      const needsCustomCss = !indexContent.includes('href="custom.css"');
      const needsJs = !indexContent.includes('src="poetic.js"');
      if (needsCss || needsCustomCss || needsJs) {
        const linksToAdd = [
          needsCss ? '<link rel="stylesheet" href="poetic.css">' : '',
          needsCustomCss ? '<link rel="stylesheet" href="custom.css">' : '',
          needsJs ? '<script src="poetic.js" defer></script>' : '',
        ].filter(Boolean).join('\n    ');
        indexContent = indexContent.replace(
          /(<link rel="icon"[^>]*>)/,
          `$1\n    ${linksToAdd}`
        );
      }

      // Self-heal the poem-grid rendering logic by replacing the ENTIRE
      // managed block — from the first managed helper (either
      // `formatPoemDate`, added in 2.1.0, or the older `renderPoems`,
      // whichever a previously-built file starts with) through the last
      // `renderPoems();` call — in one shot. Matching the whole block
      // greedily (rather than just `renderPoems`/its call) is idempotent:
      // it avoids duplicate-helper accumulation across builds and lets newly
      // added helpers (e.g. the title filter) self-heal into any
      // previously-built index.html regardless of the version that built it.
      indexContent = indexContent.replace(
        /function (?:formatPoemDate|renderPoems)[\s\S]*renderPoems\(\);/,
        () => RENDER_POEMS_SCRIPT
      );
    } else {
      // Create a default index.html template
      indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fragments &#38; Unity</h1>
            <p class="subtitle">${subtitle || "My Poems"}</p>
        </div>

        <!-- The title filter bar is inserted here by renderPoems()/setupHomeFilter(). -->
        <div class="poem-grid" id="poemGrid">
            <!-- Poems will be populated by JavaScript -->
        </div>

        <div class="links">
            <a href="all-poems.html">View All Poems</a>
        </div>
    </div>

    <script>
        const allPoems = [
${poemArrayString}
        ];

${RENDER_POEMS_SCRIPT}
    </script>
</body>
</html>`;
    }

    return indexContent;
  } catch (err) {
    console.warn("Warning: Could not update index.html:", err.message);
    return null;
  }
}

// Main execution
function main() {
  const publicDir = path.join(REPO_ROOT, "public");

  if (!fs.existsSync(publicDir)) {
    console.error(`Error: Public directory not found: ${publicDir}`);
    process.exit(1);
  }

  const config = readPoeticConfig(REPO_ROOT);
  // Strip a leading "public/" so the href resolves correctly when public/ is
  // served as the web root (both locally and once GitHub Pages deploys its
  // contents to the site root) — see build-poems.js for the same rule.
  const rawFavicon = config.favicon || "poetic-logo.svg";
  const favicon = rawFavicon.replace(/^public\//, '');
  if (config.favicon) {
    console.log(`Using favicon from .poetic-config: ${favicon}`);
  }
  const subtitle = config.subtitle;
  if (subtitle) {
    console.log(`Using subtitle from .poetic-config: ${subtitle}`);
  }
  const audiomackArtist = config.audiomack_artist || '';
  if (audiomackArtist) {
    console.log(`Using audiomack_artist from .poetic-config: ${audiomackArtist}`);
  }

  console.log("Step 1: Building all-poems.html...");

  const concatenatedContent = concatenateAllHtmlFiles(publicDir, favicon, audiomackArtist);
  const allPoemsOutputPath = path.join(publicDir, "all-poems.html");

  const prettifiedContent = beautify.html(concatenatedContent, {
    indent_size: 2,
    wrap_line_length: 80,
    preserve_newlines: false,
    max_preserve_newlines: 1,
    wrap_attributes: "auto"
  });
  fs.writeFileSync(allPoemsOutputPath, prettifiedContent, "utf8");

  console.log(`✅ Successfully generated ${allPoemsOutputPath}`);

  console.log("\nStep 2: Updating index.html...");

  const updatedIndexContent = generateIndexHtml(publicDir, favicon, subtitle);
  if (updatedIndexContent) {
    const indexPath = path.join(publicDir, "index.html");
    const prettifiedIndexContent = beautify.html(updatedIndexContent, {
      indent_size: 2,
      wrap_line_length: 80,
      preserve_newlines: false,
      max_preserve_newlines: 1,
      wrap_attributes: "auto"
    });
    fs.writeFileSync(indexPath, prettifiedIndexContent, "utf8");
    console.log(`✅ Successfully updated ${indexPath}`);
  } else {
    console.log("⚠️  Skipped index.html update due to errors");
  }

  console.log(
    `\n📊 Processed ${
      fs.readdirSync(publicDir).filter((f) => f.endsWith(".html")).length
    } HTML files`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  concatenateAllHtmlFiles,
  generateIndexHtml,
};
