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
 *
 * Both generators accept an optional trailing { poemsDir } override (see
 * src/tools/build-all-poems.js, mirroring buildAllPoems()'s { poemsDir,
 * publicDir } in src/tools/build-poems.js), so every test here runs against
 * its own throwaway temp poems directory rather than the real
 * src/poems/yaml. This isolation matters beyond this repo: test/ is synced
 * verbatim to consumer repos (see scripts/sync-framework.sh), where a fixture
 * written into the real poems directory and left behind by a crashed test
 * run would be published by the consumer's next `npm run build`.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const {
  concatenateAllHtmlFiles, generateIndexHtml, copyDateUtilsAsset,
} = require('../src/tools/build-all-poems');
const { REPO_ROOT } = require('../src/tools/repo-root');

// A throwaway poems directory, cleaned up when the test ends.
function tmpPoemsDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-build-all-poems-poems-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function tmpPublicDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-build-all-poems-public-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes a single fixture poem YAML file into poemsDir, using js-yaml's
// dump() rather than a hand-written string so titles with quotes, "&", "$"
// sequences or "</script>" are always encoded safely.
function writeFixturePoem(poemsDir, filename, {
  title,
  author = 'Test Author',
  date = '2020-05-04',
  labels = ['fixture-label'],
  lines = 'Hello world\n',
} = {}) {
  const content = yaml.dump({
    title,
    author,
    date,
    labels,
    versions: [{ segments: [{ lines }] }],
  });
  fs.writeFileSync(path.join(poemsDir, filename), content, 'utf8');
}

const FIXTURE_TITLE = 'TD Generator Test Poem';
const FIXTURE_FILE = 'test-poem.yaml';
const FIXTURE_SLUG = 'test-poem';

// Extracts and JSON.parses the poem-data island from a generated index.html.
function poemDataFrom(html) {
  const m = html.match(/<script type="application\/json" id="poem-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'poem-data script block must be present');
  return { raw: m[1], data: JSON.parse(m[1]) };
}

// ── concatenateAllHtmlFiles (all-poems.html) ────────────────────────────────

test('concatenateAllHtmlFiles: loads poetic.js, date-utils.js and all-poems.js via <script src>, not inline', (t) => {
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });

  const { html, errorCount } = concatenateAllHtmlFiles(tmpPublicDir(t), undefined, undefined, { poemsDir });
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
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });

  const { html } = concatenateAllHtmlFiles(tmpPublicDir(t), undefined, undefined, { poemsDir });

  assert.match(html, /TD Generator Test Poem/);
  assert.match(html, /data-date="2020-05-04"/);
  assert.match(html, new RegExp(`href="${FIXTURE_SLUG}/"`));
});

// ── generateIndexHtml (index.html) ──────────────────────────────────────────

test('generateIndexHtml: fresh build embeds poem data as a JSON island and loads index.js via <script src>', (t) => {
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });

  const html = generateIndexHtml(tmpPublicDir(t), 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });

  assert.match(html, /<script type="application\/json" id="poem-data">/);
  assert.match(html, /<script src="index\.js" defer><\/script>/);
  assert.doesNotMatch(html, /function renderPoems/);
  assert.doesNotMatch(html, /function formatPoemDate/);
  assert.doesNotMatch(html, /const allPoems = \[/);

  // The poems dir is a throwaway temp dir seeded with exactly one fixture,
  // so the whole array (not just one entry) can be asserted exactly.
  const { data } = poemDataFrom(html);
  assert.deepStrictEqual(data, [{
    file: `${FIXTURE_SLUG}/`,
    title: FIXTURE_TITLE,
    titleHtml: FIXTURE_TITLE,
    hasAudio: false,
    date: '2020-05-04',
    labels: ['fixture-label'],
  }]);
});

test('generateIndexHtml: self-heals a pre-refactor index.html (inline allPoems + render functions) into the external-script format', (t) => {
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });
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

  const migrated = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
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
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });
  const dir = tmpPublicDir(t);

  const first = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  fs.writeFileSync(path.join(dir, 'index.html'), first, 'utf8');

  const second = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  assert.strictEqual((second.match(/id="poem-data"/g) || []).length, 1);
  assert.strictEqual((second.match(/src="index\.js"/g) || []).length, 1);
  assert.match(second, /TD Generator Test Poem/);
});

// ── Special-character titles ─────────────────────────────────────────────────

test('a title containing quotes and "&" is HTML-escaped in the all-poems.html table row, and round-trips unescaped through the JSON island', (t) => {
  const poemsDir = tmpPoemsDir(t);
  const publicDir = tmpPublicDir(t);
  const title = 'He said "Go!" & left';
  writeFixturePoem(poemsDir, 'quotes-poem.yaml', { title });

  const { html: allPoemsHtml } = concatenateAllHtmlFiles(publicDir, undefined, undefined, { poemsDir });
  assert.ok(
    // titleHtml (renderTitleMarkup) escapes "&"/"<"/">" but not quotes — safe
    // here since both interpolation sites are text content, not an attribute.
    allPoemsHtml.includes('He said "Go!" &amp; left'),
    'all-poems.html table row should contain the HTML-escaped title text'
  );
  assert.ok(
    !allPoemsHtml.includes('He said "Go!" & left'),
    'all-poems.html should not contain the raw, unescaped "&"'
  );

  let indexHtml;
  assert.doesNotThrow(() => {
    indexHtml = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  });
  const { data } = poemDataFrom(indexHtml);
  assert.strictEqual(data[0].title, title);
});

test('regression (Fix 1): a title containing "$$" and "$&" survives byte-exact across a second (refresh) build', (t) => {
  const poemsDir = tmpPoemsDir(t);
  const publicDir = tmpPublicDir(t);
  const title = 'Big $$ Deal $&';
  writeFixturePoem(poemsDir, 'dollar-poem.yaml', { title });

  const first = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  fs.writeFileSync(path.join(publicDir, 'index.html'), first, 'utf8');

  // Second call exercises the already-migrated refresh branch, whose
  // replacement must be a function (not a string) or "$$"/"$&" in the title
  // would be reinterpreted as String.replace() replacement patterns.
  const second = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  const { data } = poemDataFrom(second);
  assert.strictEqual(data[0].title, title);
});

test('regression (Fix 2): a title containing "</script>" does not terminate the JSON data island early', (t) => {
  const poemsDir = tmpPoemsDir(t);
  const publicDir = tmpPublicDir(t);
  const title = 'Sneaky </script> Title';
  writeFixturePoem(poemsDir, 'script-poem.yaml', { title });

  const first = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  const { raw: raw1, data: data1 } = poemDataFrom(first);
  assert.doesNotMatch(raw1, /<\/script>/, 'the raw "</script>" substring must not appear inside the island');
  assert.strictEqual(data1[0].title, title);

  // Refresh branch: write the built file back and build again.
  fs.writeFileSync(path.join(publicDir, 'index.html'), first, 'utf8');
  const second = generateIndexHtml(publicDir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  const { raw: raw2, data: data2 } = poemDataFrom(second);
  assert.doesNotMatch(raw2, /<\/script>/);
  assert.strictEqual(data2[0].title, title);
});

// ── Syncing an existing index.html ──────────────────────────────────────────

test('generateIndexHtml: syncs favicon/title/subtitle onto an existing index.html only when explicitly passed', (t) => {
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });

  const existingIndexHtml = (favicon) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Old Title</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Old Title</h1>
            <p class="subtitle">Old subtitle</p>
        </div>
        <div class="poem-grid" id="poemGrid"></div>
    </div>

    <script type="application/json" id="poem-data">
[]
    </script>
    <script src="index.js" defer></script>
</body>
</html>`;

  // New favicon/subtitle/title explicitly passed: all three sync.
  const dirA = tmpPublicDir(t);
  fs.writeFileSync(path.join(dirA, 'index.html'), existingIndexHtml('old-icon.svg'), 'utf8');
  const updated = generateIndexHtml(dirA, 'new-icon.svg', 'New subtitle', { title: 'Fresh & Shiny' }, { poemsDir });
  assert.match(updated, /<link rel="icon" href="new-icon\.svg"/);
  assert.match(updated, /<title>Fresh &#38; Shiny<\/title>/);
  assert.match(updated, /<h1>Fresh &#38; Shiny<\/h1>/);
  assert.match(updated, /<p class="subtitle">New subtitle<\/p>/);

  // subtitle/config.title NOT passed: the existing title/h1/subtitle are
  // left alone (favicon is always synced, since it always has a value —
  // the caller's default or an explicit one).
  const dirB = tmpPublicDir(t);
  fs.writeFileSync(path.join(dirB, 'index.html'), existingIndexHtml('poetic-logo.svg'), 'utf8');
  const unchanged = generateIndexHtml(dirB, 'poetic-logo.svg', undefined, undefined, { poemsDir });
  assert.match(unchanged, /<title>Old Title<\/title>/);
  assert.match(unchanged, /<h1>Old Title<\/h1>/);
  assert.match(unchanged, /<p class="subtitle">Old subtitle<\/p>/);
});

test('generateIndexHtml: injects missing poetic.css/custom.css/poetic.js links into an existing head without duplicating any already present', (t) => {
  const poemsDir = tmpPoemsDir(t);
  writeFixturePoem(poemsDir, FIXTURE_FILE, { title: FIXTURE_TITLE });
  const dir = tmpPublicDir(t);

  const existing = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Poems</title>
    <link rel="icon" href="poetic-logo.svg" type="image/svg+xml">
</head>
<body>
    <div class="container">
        <div class="poem-grid" id="poemGrid"></div>
    </div>

    <script type="application/json" id="poem-data">
[]
    </script>
    <script src="index.js" defer></script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), existing, 'utf8');

  const updated = generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems', undefined, { poemsDir });
  assert.strictEqual((updated.match(/href="poetic\.css"/g) || []).length, 1);
  assert.strictEqual((updated.match(/href="custom\.css"/g) || []).length, 1);
  assert.strictEqual((updated.match(/src="poetic\.js"/g) || []).length, 1);
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
