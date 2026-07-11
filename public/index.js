// Poem grid rendering + title filter for index.html — framework-owned, do
// not hand-edit. Poem data is supplied by build-all-poems.js as a JSON data
// island (<script type="application/json" id="poem-data">) rather than being
// interpolated into this file, so this script never needs to be regenerated
// or patched — only the JSON island's content changes across builds.
const allPoems = JSON.parse(document.getElementById('poem-data').textContent);

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
        card.innerHTML = `
            <div class="poem-title">
                <a href="${poem.file}">${poem.title}</a>
                ${poem.hasAudio ? '<span class="audio-indicator">🎵</span>' : ''}
            </div>
            ${poem.date ? `<div class="poem-date">${formatPoemDate(poem.date)}</div>` : ''}
            ${poem.labels && poem.labels.length ? '<div class="poem-card-labels">' + poem.labels.map(function (label) { return '<a class="poem-card-label" href="all-poems.html?scope=labels&q=' + encodeURIComponent(label) + '" onclick="event.stopPropagation()">' + label + '</a>'; }).join('') + '</div>' : ''}
        `;

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
renderPoems();
