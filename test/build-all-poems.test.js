'use strict';

/**
 * Tests for the build-all-poems.js generators: concatenateAllHtmlFiles
 * (all-poems.html) and generateIndexHtml (index.html).
 *
 * The client-side JS these functions emit lives in public/all-poems.js and
 * public/index.js, loaded via <script src> — not inlined as string template
 * literals. Poem data reaches index.js as a JSON data island
 * (<script type="application/json" id="poem-data">) rather than an
 * interpolated `const allPoems = [...]` literal.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  concatenateAllHtmlFiles, generateIndexHtml, copyDateUtilsAsset,
} = require('../src/tools/build-all-poems');
const { REPO_ROOT } = require('../src/tools/repo-root');

// concatenateAllHtmlFiles/generateIndexHtml always read poem sources from
// REPO_ROOT's real src/poems/yaml (not parameterised — see footer.test.js
// for the same pattern), so exercising the "has poems" code path means
// dropping a real fixture there and removing it afterwards.
const POEMS_DIR = path.join(REPO_ROOT, 'src', 'poems', 'yaml');
const FIXTURE_NAME = 'zz-td105-fixture.yaml';
const FIXTURE_SLUG = 'zz-td105-fixture';

const FIXTURE_YAML = `title: TD Generator Test Poem
author: Test Author
date: 2020-05-04
labels:
  - fixture-label
versions:
  - segments:
      - lines: "Hello world\\n"
`;

function withFixturePoem(t) {
  const yamlPath = path.join(POEMS_DIR, FIXTURE_NAME);
  fs.writeFileSync(yamlPath, FIXTURE_YAML, 'utf8');
  t.after(() => fs.rmSync(yamlPath, { force: true }));
}

function tmpPublicDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-build-all-poems-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ── concatenateAllHtmlFiles (all-poems.html) ────────────────────────────────

test('concatenateAllHtmlFiles: loads poetic.js, date-utils.js and all-poems.js via <script src>, not inline', (t) => {
  withFixturePoem(t);
  const { html, errorCount } = concatenateAllHtmlFiles(tmpPublicDir(t));
  assert.strictEqual(errorCount, 0);

  assert.match(html, /<script src="poetic\.js" defer><\/script>/);
  assert.match(html, /<script src="date-utils\.js" defer><\/script>/);
  assert.match(html, /<script src="all-poems\.js" defer><\/script>/);

  // The sort/filter logic must not be duplicated inline any more.
  assert.doesNotMatch(html, /function sortTable/);
  assert.doesNotMatch(html, /function initFilterBar/);
  assert.doesNotMatch(html, /function parseDate\(/);
});

test('concatenateAllHtmlFiles: table row + poem section reflect the source poem', (t) => {
  withFixturePoem(t);
  const { html } = concatenateAllHtmlFiles(tmpPublicDir(t));

  assert.match(html, /TD Generator Test Poem/);
  assert.match(html, /data-date="2020-05-04"/);
  assert.match(html, new RegExp(`href="${FIXTURE_SLUG}/"`));
});

// ── generateIndexHtml (index.html) ──────────────────────────────────────────

test('generateIndexHtml: fresh build embeds poem data as a JSON island and loads index.js via <script src>', (t) => {
  withFixturePoem(t);
  const html = generateIndexHtml(tmpPublicDir(t), 'poetic-logo.svg', 'My Poems');

  assert.match(html, /<script type="application\/json" id="poem-data">/);
  assert.match(html, /<script src="index\.js" defer><\/script>/);
  assert.doesNotMatch(html, /function renderPoems/);
  assert.doesNotMatch(html, /function formatPoemDate/);
  assert.doesNotMatch(html, /const allPoems = \[/);

  const m = html.match(/<script type="application\/json" id="poem-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'poem-data script block must be present');
  const data = JSON.parse(m[1]);
  // Not a deepStrictEqual on the whole array: other test files may drop
  // their own fixture poems into the same shared src/poems/yaml directory
  // concurrently (see the file header comment), so only assert that OUR
  // fixture's entry is present and shaped correctly.
  const entry = data.find((p) => p.file === `${FIXTURE_SLUG}/`);
  assert.deepStrictEqual(entry, {
    file: `${FIXTURE_SLUG}/`,
    title: 'TD Generator Test Poem',
    hasAudio: false,
    date: '2020-05-04',
    labels: ['fixture-label'],
  });
});

test('generateIndexHtml: self-heals a pre-refactor index.html (inline allPoems + render functions) into the external-script format', (t) => {
  withFixturePoem(t);
  const dir = tmpPublicDir(t);
  const oldFormat = `<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="icon" href="poetic-logo.svg" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="poem-grid" id="poemGrid"></div>
    </div>

    <script>
        const allPoems = [
        {
          file: "old/",
          title: "Old",
          hasAudio: false,
          date: "2019-01-01",
          labels: [],
        }
        ];

        function formatPoemDate(dateStr) { return dateStr; }
        function renderPoems() { /* old logic */ }
        renderPoems();
    </script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), oldFormat, 'utf8');

  const migrated = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems');
  assert.match(migrated, /<script type="application\/json" id="poem-data">/);
  assert.match(migrated, /<script src="index\.js" defer><\/script>/);
  assert.doesNotMatch(migrated, /const allPoems = \[/);
  assert.doesNotMatch(migrated, /function renderPoems/);
  assert.doesNotMatch(migrated, /function formatPoemDate/);
  assert.match(
    migrated,
    /TD Generator Test Poem/,
    'the migrated JSON island should carry current poem data, not the stale "Old" entry'
  );
});

test('generateIndexHtml: rebuilding an already-migrated index.html refreshes the JSON payload without duplicating script tags', (t) => {
  withFixturePoem(t);
  const dir = tmpPublicDir(t);

  const first = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems');
  fs.writeFileSync(path.join(dir, 'index.html'), first, 'utf8');

  const second = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems');
  assert.strictEqual((second.match(/id="poem-data"/g) || []).length, 1);
  assert.strictEqual((second.match(/src="index\.js"/g) || []).length, 1);
  assert.match(second, /TD Generator Test Poem/);
});

// ── copyDateUtilsAsset ───────────────────────────────────────────────────────

test('copyDateUtilsAsset: copies src/tools/date-utils.js verbatim into publicDir', (t) => {
  const dir = tmpPublicDir(t);
  copyDateUtilsAsset(dir);
  const copied = fs.readFileSync(path.join(dir, 'date-utils.js'), 'utf8');
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'tools', 'date-utils.js'), 'utf8');
  assert.strictEqual(copied, source, 'public/date-utils.js must stay byte-identical to src/tools/date-utils.js');
});

test('date-utils.js guards module.exports so it is safe to load as a plain browser <script>', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'tools', 'date-utils.js'), 'utf8');
  assert.match(
    source,
    /typeof module !== ['"]undefined['"]/,
    'module.exports must be guarded — `module` is undefined in a classic (non-module) browser script'
  );
});
