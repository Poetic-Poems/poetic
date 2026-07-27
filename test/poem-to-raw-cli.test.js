'use strict';

/**
 * Tests for poem-to-raw.js's CLI orchestration (convertAllPoemsToRaw): the
 * loop that writes raw/<stem> for every src/poems/poem/*.poem file plus the
 * public/raw/index.html aggregate, mirroring test/build-poems.test.js's
 * pattern for buildAllPoems(). See test/poem-to-raw.test.js for the pure
 * rendering-function tests (htmlToPlainText, renderPoemText, buildIndex, ...).
 *
 * convertAllPoemsToRaw() accepts an optional { repoTop } override (see
 * src/tools/poem-to-raw.js) — the npm run build / CLI entry point never
 * passes it and derives repoTop from `git rev-parse --show-toplevel`, but
 * tests do, so each run is isolated to its own temp directory rather than
 * this repo's own src/poems/poem, raw/, and public/raw/.
 *
 * Unlike poem-to-yaml.js's convertAllPoemsToYaml, a per-file conversion
 * failure here is logged and skipped, not counted toward a process.exit(1) —
 * that matches the CLI's existing behaviour (this change exports it for
 * testing, it does not alter it).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { convertAllPoemsToRaw } = require('../src/tools/poem-to-raw');

const FIXTURE_POEM = 'Sample Poem\n1970-01-01\n\n{Verse}\na line\n';

// A throwaway repo-shaped temp directory (just src/poems/poem/, which is all
// convertAllPoemsToRaw needs on disk up front — it creates raw/ and
// public/raw/ itself), cleaned up when the test ends.
function tmpRepo(t) {
  const repoTop = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-poem-to-raw-'));
  const poemDir = path.join(repoTop, 'src', 'poems', 'poem');
  fs.mkdirSync(poemDir, { recursive: true });
  t.after(() => fs.rmSync(repoTop, { recursive: true, force: true }));
  return { repoTop, poemDir };
}

// Capture console.log/console.error output produced while running `fn`.
function captureLogs(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { logs, errors };
}

test('convertAllPoemsToRaw is exported and is a no-op on raw/ when the poem dir is empty', (t) => {
  assert.strictEqual(typeof convertAllPoemsToRaw, 'function');
  const { repoTop } = tmpRepo(t);

  convertAllPoemsToRaw({ repoTop });

  assert.deepStrictEqual(fs.readdirSync(path.join(repoTop, 'raw')), []);
});

test('convertAllPoemsToRaw writes raw/<stem> and public/raw/index.html for a source poem', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToRaw({ repoTop });

  const rawPath = path.join(repoTop, 'raw', 'sample');
  assert.ok(fs.existsSync(rawPath), `${rawPath} should have been generated`);
  assert.match(fs.readFileSync(rawPath, 'utf8'), /^Sample Poem\n/);

  const indexPath = path.join(repoTop, 'public', 'raw', 'index.html');
  assert.ok(fs.existsSync(indexPath), `${indexPath} should have been generated`);
  assert.match(fs.readFileSync(indexPath, 'utf8'), />Sample Poem</);
});

test('convertAllPoemsToRaw skips a partial/private file (leading "_" or ".")', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  fs.writeFileSync(path.join(poemDir, '_partial.poem'), FIXTURE_POEM, 'utf8');
  fs.writeFileSync(path.join(poemDir, '.shared.poem'), '', 'utf8');

  convertAllPoemsToRaw({ repoTop });

  assert.deepStrictEqual(fs.readdirSync(path.join(repoTop, 'raw')), []);
});

test('convertAllPoemsToRaw does not rewrite an up-to-date poem\'s raw file on a second run, and reports the skip count', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToRaw({ repoTop });

  const rawPath = path.join(repoTop, 'raw', 'sample');
  const mtimeBefore = fs.statSync(rawPath).mtimeMs;

  const { logs } = captureLogs(() => convertAllPoemsToRaw({ repoTop }));

  assert.strictEqual(
    fs.statSync(rawPath).mtimeMs, mtimeBefore,
    'raw/sample should not be rewritten when the source is unchanged'
  );
  assert.ok(
    logs.some((l) => /1 poem\(s\) already up to date, skipped\./.test(l)),
    'the skip count should be reported'
  );
});

test('convertAllPoemsToRaw regenerates a poem\'s raw file once the source .poem changes', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  const poemPath = path.join(poemDir, 'sample.poem');
  fs.writeFileSync(poemPath, FIXTURE_POEM, 'utf8');

  convertAllPoemsToRaw({ repoTop });

  const rawPath = path.join(repoTop, 'raw', 'sample');
  const mtimeBefore = fs.statSync(rawPath).mtimeMs;

  // Bump the source's mtime into the future so it's unambiguously newer,
  // regardless of filesystem mtime-resolution granularity.
  const future = (Date.now() + 60_000) / 1000;
  fs.utimesSync(poemPath, future, future);

  convertAllPoemsToRaw({ repoTop });

  assert.ok(
    fs.statSync(rawPath).mtimeMs > mtimeBefore,
    'raw/sample should be regenerated once its source .poem changes'
  );
});

test('convertAllPoemsToRaw skips regenerating public/raw/index.html when the poem set is unchanged', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToRaw({ repoTop });

  const indexPath = path.join(repoTop, 'public', 'raw', 'index.html');
  const mtimeBefore = fs.statSync(indexPath).mtimeMs;

  const { logs } = captureLogs(() => convertAllPoemsToRaw({ repoTop }));

  assert.strictEqual(
    fs.statSync(indexPath).mtimeMs, mtimeBefore,
    'public/raw/index.html should not be rewritten when the poem set is unchanged'
  );
  assert.ok(
    logs.some((l) => /public\/raw\/index\.html is up to date, skipping\./.test(l)),
    'the index skip should be reported'
  );
});

test('convertAllPoemsToRaw regenerates public/raw/index.html once a poem is added to the set', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToRaw({ repoTop });

  // A poem being added changes the tracked source *set* (see the sidecar
  // manifest in needsRebuildAggregate), which is detected independent of any
  // file's mtime — so no mtime manipulation is needed here.
  fs.writeFileSync(path.join(poemDir, 'second.poem'), 'Second Poem\n1970-01-01\n\n{Verse}\nanother line\n', 'utf8');

  convertAllPoemsToRaw({ repoTop });

  const indexPath = path.join(repoTop, 'public', 'raw', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, />Sample Poem</);
  assert.match(html, />Second Poem</);
});

test('convertAllPoemsToRaw logs a per-file conversion failure and continues (no exit; matches the CLI\'s existing behaviour)', (t) => {
  const { repoTop, poemDir } = tmpRepo(t);
  // A .poem file with no title/date lines fails to parse ("Missing title").
  fs.writeFileSync(path.join(poemDir, 'broken.poem'), '', 'utf8');
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  const { errors } = captureLogs(() => convertAllPoemsToRaw({ repoTop }));

  assert.ok(
    errors.some((e) => /Error converting broken\.poem/.test(e)),
    `expected a per-file error to be logged, got: ${JSON.stringify(errors)}`
  );
  // The loop must continue past the failing file: the other poem still
  // converts, and the index build (which needs every title) still runs.
  assert.ok(fs.existsSync(path.join(repoTop, 'raw', 'sample')));
  assert.match(
    fs.readFileSync(path.join(repoTop, 'public', 'raw', 'index.html'), 'utf8'),
    />Sample Poem</
  );
});
