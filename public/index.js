// Poem grid rendering + title filter for index.html — framework-owned, do
// not hand-edit. Poem data is supplied by build-all-poems.js as a JSON data
// island (<script type="application/json" id="poem-data">) rather than being
// interpolated into this file, so this script never needs to be regenerated
// or patched — only the JSON island's content changes across builds.
const allPoems = JSON.parse(document.getElementById('poem-data').textContent);

// poem.file is always a slugified relative path (see slugFromFile in
// slugify.js — lowercase alphanumerics and hyphens only), but it reaches
// this script via a JSON island read from the DOM, so nothing here can
// assume it's safe to use as a navigation target as-is. Reject anything
// that isn't a plain relative path before it's ever assigned to href, so a
// scheme (e.g. "javascript:") or a protocol-relative "//host" can't slip
// through as a poem's file.
function safePoemHref(file) {
    return typeof file === 'string' && /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*\/?$/.test(file) ? file : '#';
}

function formatPoemDate(dateStr) {
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

        const titleDiv = document.createElement('div');
        titleDiv.className = 'poem-title';

        const link = document.createElement('a');
        link.href = safePoemHref(poem.file);
        link.textContent = poem.title;
        titleDiv.appendChild(link);

        if (poem.hasAudio) {
            const audio = document.createElement('span');
            audio.className = 'audio-indicator';
            audio.textContent = '🎵';
            titleDiv.appendChild(audio);
        }

        card.appendChild(titleDiv);

        if (poem.date) {
            const dateDiv = document.createElement('div');
            dateDiv.className = 'poem-date';
            dateDiv.textContent = formatPoemDate(poem.date);
            card.appendChild(dateDiv);
        }

        if (poem.labels && poem.labels.length) {
            const labelsDiv = document.createElement('div');
            labelsDiv.className = 'poem-card-labels';
            poem.labels.forEach(label => {
                const labelLink = document.createElement('a');
                labelLink.className = 'poem-card-label';
                labelLink.href = 'all-poems.html?scope=labels&q=' + encodeURIComponent(label);
                labelLink.textContent = label;
                labelLink.addEventListener('click', event => event.stopPropagation());
                labelsDiv.appendChild(labelLink);
            });
            card.appendChild(labelsDiv);
        }

        card.addEventListener('click', () => {
            window.location.href = safePoemHref(poem.file);
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
renderPoems();
