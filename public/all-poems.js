// Table sort + filter bar behaviour for all-poems.html — framework-owned, do
// not hand-edit. Requires date-utils.js (parseDateForSorting) to be loaded
// first; both scripts are added with `defer` in document order by
// build-all-poems.js, so load order is guaranteed.
//
// Sortable headers are real <button> elements nested inside each <th
// class="sortable"> (see build-all-poems.js); the browser gives buttons
// native keyboard support (Tab to focus, Enter/Space to activate), so no
// custom key handling is needed here. Click wiring uses addEventListener
// rather than inline onclick, and aria-sort is kept in sync on the <th> —
// the ARIA-correct place for it — whenever the sort changes.
let currentSort = { column: -1, direction: 'asc' };

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

    // Update header styling + aria-sort
    const headers = table.getElementsByTagName('th');
    for (let i = 0; i < headers.length; i++) {
        if (i === columnIndex) {
            headers[i].className = currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc';
            headers[i].setAttribute('aria-sort', currentSort.direction === 'asc' ? 'ascending' : 'descending');
        } else {
            headers[i].className = 'sortable';
            headers[i].setAttribute('aria-sort', 'none');
        }
    }

    // Sort rows
    rows.sort((a, b) => {
        const aVal = a.cells[columnIndex].textContent.trim();
        const bVal = b.cells[columnIndex].textContent.trim();

        let comparison = 0;

        if (sortType === 'date') {
            // parseDateForSorting is loaded globally from date-utils.js.
            const aDate = parseDateForSorting(aVal);
            const bDate = parseDateForSorting(bVal);
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

// Wire each header's sort <button> via addEventListener (not inline onclick).
function initSortButtons() {
    const table = document.getElementById('poemTable');
    if (!table) return;
    const buttons = table.querySelectorAll('thead .sort-button');
    buttons.forEach((button) => {
        const columnIndex = Number(button.dataset.column);
        const sortType = button.dataset.sortType;
        button.addEventListener('click', () => sortTable(columnIndex, sortType));
    });
}

initSortButtons();

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
