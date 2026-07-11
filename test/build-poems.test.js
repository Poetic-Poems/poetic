'use strict';

/**
 * Tests for the build-poems.js generator (buildAllPoems): writes
 * public/<slug>/index.html (full standalone page) and public/<slug>.html
 * (redirect stub) for every source poem.
 *
 * buildAllPoems() accepts optional { poemsDir, publicDir } overrides (see
 * src/tools/build-poems.js) — the npm run build / CLI entry point never
 * passes them and uses the real REPO_ROOT-derived paths, but tests do, so
 * each test runs against its own isolated temp directories rather than the
 * real src/poems/yaml and public/ (which other test files, and a developer's
 * own local poems, may be touching at the same time).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildAllPoems } = require('../src/tools/build-poems');

const FIXTURE_YAML = `title: TD Build Poems Test Poem
author: Test Author
date: 2021-03-09
versions:
  - segments:
      - lines: "Hello from build-poems\\n"
`;

// A throwaway { poemsDir, publicDir } pair, cleaned up when the test ends.
function tmpDirs(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-build-poems-'));
  const poemsDir = path.join(base, 'src', 'poems', 'yaml');
  const publicDir = path.join(base, 'public');
  fs.mkdirSync(poemsDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { poemsDir, publicDir };
}

test('buildAllPoems is exported and is a no-op (no throw, no output) when the poems dir is empty', (t) => {
  assert.strictEqual(typeof buildAllPoems, 'function');
  const { poemsDir, publicDir } = tmpDirs(t);

  buildAllPoems({ poemsDir, publicDir });

  assert.deepStrictEqual(fs.readdirSync(publicDir), []);
});

test('buildAllPoems writes public/<slug>/index.html as a full standalone page for a source poem', (t) => {
  const { poemsDir, publicDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemsDir, 'test-poem.yaml'), FIXTURE_YAML, 'utf8');

  buildAllPoems({ poemsDir, publicDir });

  const pagePath = path.join(publicDir, 'test-poem', 'index.html');
  assert.ok(fs.existsSync(pagePath), `${pagePath} should have been generated`);
  const html = fs.readFileSync(pagePath, 'utf8');
  assert.match(html, /TD Build Poems Test Poem/);
  assert.match(html, /src="\.\.\/poetic\.js"/, 'poem pages must link the shared framework script');
  assert.match(html, /href="\.\.\/poetic\.css"/, 'poem pages must link the shared framework stylesheet');
});

test('buildAllPoems writes public/<slug>.html as a redirect stub to ./<slug>/', (t) => {
  const { poemsDir, publicDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemsDir, 'test-poem.yaml'), FIXTURE_YAML, 'utf8');

  buildAllPoems({ poemsDir, publicDir });

  const redirectPath = path.join(publicDir, 'test-poem.html');
  assert.ok(fs.existsSync(redirectPath), `${redirectPath} should have been generated`);
  const html = fs.readFileSync(redirectPath, 'utf8');
  assert.match(html, /rel="canonical" href="\.\/test-poem\/"/);
  assert.match(html, /url=\.\/test-poem\//);
});

test('buildAllPoems skips a poem missing a required field and reports it as an error (process exits non-zero)', (t) => {
  // Runs the real CLI entry point as a subprocess (rather than calling
  // buildAllPoems() in-process) because a validation error makes it call
  // process.exit(1), which would otherwise tear down the whole test worker.
  const { poemsDir } = tmpDirs(t);
  const base = path.dirname(path.dirname(poemsDir));
  fs.writeFileSync(path.join(poemsDir, 'broken.yaml'), 'title: No Author Here\n', 'utf8');

  const script = `
    const { buildAllPoems } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'tools', 'build-poems.js'))});
    buildAllPoems({
      poemsDir: ${JSON.stringify(poemsDir)},
      publicDir: ${JSON.stringify(path.join(base, 'public'))},
    });
  `;
  const { spawnSync } = require('child_process');
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Missing 'author' field/);
});
