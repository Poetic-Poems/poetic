'use strict';

/**
 * Tests for the browser-safe aggregate renderers (src/browser/render-aggregate.js)
 * — renderAllPoems/renderIndex, the fs-free analogue of build-all-poems.js's
 * concatenateAllHtmlFiles/generateIndexHtml.
 *
 * Filesystem-freedom itself is already asserted end-to-end by
 * test/browser-render.test.js's graph-walking tests: those walk the require
 * graph from src/browser/render.js, which (as of this module) transitively
 * requires render-aggregate.js and aggregate-render-core.js, so a stray `fs`/
 * `path`/`__dirname` or new bare npm dependency introduced here would already
 * fail that suite. This file focuses on the rendering behaviour itself,
 * including parity against the Node build path (build-all-poems.js) for an
 * equivalent poem set.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { PoemParser } = require('../src/tools/poem-parser');
const { renderAllPoems, renderIndex } = require('../src/browser/render-aggregate');
const { renderAllPoems: renderAllPoemsFromEntry, renderIndex: renderIndexFromEntry } = require('../src/browser/render');
const { convertPoemToYaml } = require('../src/tools/poem-to-yaml');
const { concatenateAllHtmlFiles, generateIndexHtml } = require('../src/tools/build-all-poems');
const { slugFromFile } = require('../src/tools/slugify');

function tmpDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Extracts and JSON.parses the poem-data island from a generated index.html.
function poemDataFrom(html) {
  const m = html.match(/<script type="application\/json" id="poem-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'poem-data script block must be present');
  return JSON.parse(m[1]);
}

const ALPHA_POEM = `Alpha Poem
Test Author
2020-01-01

Line one of alpha
Line two of alpha
`;

const BETA_SONG = `Beta Song
Test Author
2019-06-15

{Verse}
Line one of beta
Line two of beta

====

Audiomack
Suno: s/SongLink12345678

====

{Postscript}
A short postscript note.

====

{Synopsis}

A short synopsis.

{Full}

Full analysis text.

====

#test-label
#another-label

====
`;

function parsedPoems() {
  return [
    { data: new PoemParser(ALPHA_POEM).parse(), slug: 'alpha-poem' },
    { data: new PoemParser(BETA_SONG).parse(), slug: 'beta-song' },
  ];
}

// ── renderAllPoems ───────────────────────────────────────────────────────────

test('renderAllPoems: sorts oldest-first, renders a ToC row + poem-section per poem, and reflects audio/labels', () => {
  const html = renderAllPoems(parsedPoems(), { title: 'My Test Site' });

  assert.match(html, /<title>My Test Site &#8212; Concatenated View<\/title>/);
  assert.match(html, /Concatenated view of all poems \(2 poems\)/);

  // Beta Song (2019) sorts before Alpha Poem (2020) — oldest first.
  const betaIdx = html.indexOf('Beta Song');
  const alphaIdx = html.indexOf('Alpha Poem');
  assert.ok(betaIdx > -1 && alphaIdx > -1 && betaIdx < alphaIdx, 'expected Beta Song before Alpha Poem');

  assert.match(html, /<div class="poem-section" id="poem-alpha-poem" data-date="2020-01-01">/);
  assert.match(html, /<div class="poem-section" id="poem-beta-song" data-date="2019-06-15">/);
  assert.match(html, /Line one of alpha/);
  assert.match(html, /Line one of beta/);

  // Beta Song has a resolvable song handler (Audiomack); Alpha Poem does not.
  assert.match(html, /<td class="audio-cell">🎵<\/td>[\s\S]*<td class="audio-cell"><\/td>|<td class="audio-cell"><\/td>[\s\S]*<td class="audio-cell">🎵<\/td>/);

  // Beta Song's #test-label/#another-label labels render into the fragment.
  assert.match(html, /test-label/);
});

test('renderAllPoems: an empty poem list renders the "No Poems Found" page', () => {
  const html = renderAllPoems([], { title: 'Empty Site' });
  assert.match(html, /<title>No Poems Found<\/title>/);
});

test('renderAllPoems: is re-exported from src/browser/render.js (the package entry point)', () => {
  assert.strictEqual(renderAllPoemsFromEntry, renderAllPoems);
});

// ── renderIndex ──────────────────────────────────────────────────────────────

test('renderIndex: embeds a poem-data JSON island sorted alphabetically by slug', () => {
  const html = renderIndex(parsedPoems(), { title: 'My Test Site', subtitle: 'A Subtitle' });

  assert.match(html, /<title>My Test Site<\/title>/);
  assert.match(html, /<p class="subtitle">A Subtitle<\/p>/);

  const data = poemDataFrom(html);
  assert.deepStrictEqual(data, [
    { file: 'alpha-poem/', title: 'Alpha Poem', titleHtml: 'Alpha Poem', hasAudio: false, date: '2020-01-01', labels: [] },
    { file: 'beta-song/', title: 'Beta Song', titleHtml: 'Beta Song', hasAudio: true, date: '2019-06-15', labels: ['test-label', 'another-label'] },
  ]);
});

test('renderIndex: is re-exported from src/browser/render.js (the package entry point)', () => {
  assert.strictEqual(renderIndexFromEntry, renderIndex);
});

// ── Parity against the Node build path ──────────────────────────────────────

test('renderAllPoems/renderIndex match the Node build aggregate output for an equivalent in-memory poem set', (t) => {
  const poemFilesDir = tmpDir(t, 'poetic-aggregate-poem-files-');
  const poemsYamlDir = tmpDir(t, 'poetic-aggregate-yaml-');
  const publicDir = tmpDir(t, 'poetic-aggregate-public-');

  const fixtures = [
    { file: 'alpha-poem.poem', text: ALPHA_POEM },
    { file: 'beta-song.poem', text: BETA_SONG },
  ];
  for (const f of fixtures) {
    fs.writeFileSync(path.join(poemFilesDir, f.file), f.text, 'utf8');
  }

  // Node path: .poem -> YAML on disk -> concatenateAllHtmlFiles/generateIndexHtml.
  for (const f of fixtures) {
    const yamlText = convertPoemToYaml(path.join(poemFilesDir, f.file), { sharedPoemPath: null });
    const slug = slugFromFile(f.file);
    fs.writeFileSync(path.join(poemsYamlDir, `${slug}.yaml`), yamlText, 'utf8');
  }
  const { html: nodeAllPoemsHtml, errorCount } = concatenateAllHtmlFiles(publicDir, 'poetic-logo.svg', {}, { poemsDir: poemsYamlDir });
  assert.strictEqual(errorCount, 0);
  const nodeIndexHtml = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', {}, { poemsDir: poemsYamlDir });

  // Browser path: .poem -> PoemParser -> renderAllPoems/renderIndex, no fs.
  const browserPoems = fixtures.map((f) => ({
    data: new PoemParser(f.text).parse(),
    slug: slugFromFile(f.file),
  }));
  const browserAllPoemsHtml = renderAllPoems(browserPoems, { favicon: 'poetic-logo.svg' });
  const browserIndexHtml = renderIndex(browserPoems, { favicon: 'poetic-logo.svg', subtitle: 'My Poems' });

  // The index JSON data islands must be identical: same titles/hasAudio/date/labels/order.
  assert.deepStrictEqual(poemDataFrom(browserIndexHtml), poemDataFrom(nodeIndexHtml));

  // The all-poems.html rendered poem content and ToC must be byte-identical
  // per poem (Node beautifies the file afterwards in main(), but
  // concatenateAllHtmlFiles itself returns the pre-beautify string, matching
  // renderAllPoems's own unbeautified output).
  for (const poem of browserPoems) {
    const marker = `id="poem-${poem.slug}"`;
    assert.ok(nodeAllPoemsHtml.includes(marker), `Node output missing ${marker}`);
    assert.ok(browserAllPoemsHtml.includes(marker), `browser output missing ${marker}`);
  }
  assert.strictEqual(browserAllPoemsHtml, nodeAllPoemsHtml);
});
