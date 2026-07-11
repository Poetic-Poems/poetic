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

test('buildAllPoems does not rewrite an up-to-date poem\'s output files on a second run', (t) => {
  const { poemsDir, publicDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemsDir, 'test-poem.yaml'), FIXTURE_YAML, 'utf8');

  buildAllPoems({ poemsDir, publicDir });

  const pagePath = path.join(publicDir, 'test-poem', 'index.html');
  const redirectPath = path.join(publicDir, 'test-poem.html');
  const pageMtimeBefore = fs.statSync(pagePath).mtimeMs;
  const redirectMtimeBefore = fs.statSync(redirectPath).mtimeMs;

  buildAllPoems({ poemsDir, publicDir });

  assert.strictEqual(
    fs.statSync(pagePath).mtimeMs, pageMtimeBefore,
    'index.html should not be rewritten when the source is unchanged'
  );
  assert.strictEqual(
    fs.statSync(redirectPath).mtimeMs, redirectMtimeBefore,
    'redirect stub should not be rewritten when the source is unchanged'
  );
});

test('buildAllPoems regenerates a poem\'s output files once the source YAML changes', (t) => {
  const { poemsDir, publicDir } = tmpDirs(t);
  const yamlPath = path.join(poemsDir, 'test-poem.yaml');
  fs.writeFileSync(yamlPath, FIXTURE_YAML, 'utf8');

  buildAllPoems({ poemsDir, publicDir });

  const pagePath = path.join(publicDir, 'test-poem', 'index.html');
  const pageMtimeBefore = fs.statSync(pagePath).mtimeMs;

  // Bump the source's mtime into the future so it's unambiguously newer,
  // regardless of filesystem mtime-resolution granularity.
  const future = (Date.now() + 60_000) / 1000;
  fs.utimesSync(yamlPath, future, future);

  buildAllPoems({ poemsDir, publicDir });

  assert.ok(
    fs.statSync(pagePath).mtimeMs > pageMtimeBefore,
    'index.html should be regenerated once its source YAML changes'
  );
});

test('buildAllPoems rebuilds a poem when a non-underscore-prefixed $ref target it depends on changes (real dependency tracking)', (t) => {
  const { poemsDir, publicDir } = tmpDirs(t);

  // A $ref target that is NOT an underscore-prefixed same-directory partial:
  // it lives in a subdirectory (so it is never itself listed as a standalone
  // poem) and has no leading underscore — exactly the case the old
  // partialYamlPaths heuristic could not see.
  const sharedDir = path.join(poemsDir, 'shared');
  fs.mkdirSync(sharedDir);
  const refTarget = path.join(sharedDir, 'refs.yaml');
  fs.writeFileSync(refTarget, 'note:\n  label: Note\n  content: original note\n', 'utf8');

  const yamlPath = path.join(poemsDir, 'ref-poem.yaml');
  fs.writeFileSync(yamlPath, `title: Ref Poem
author: Test Author
date: 2021-03-09
versions:
  - segments:
      - lines: "Body line\\n"
postscript:
  - $ref: shared/refs.yaml#/note
`, 'utf8');

  buildAllPoems({ poemsDir, publicDir });

  const pagePath = path.join(publicDir, 'ref-poem', 'index.html');
  assert.ok(fs.existsSync(pagePath), `${pagePath} should have been generated`);
  assert.match(fs.readFileSync(pagePath, 'utf8'), /original note/,
    'the built page should render the referenced content');
  const pageMtimeBefore = fs.statSync(pagePath).mtimeMs;

  // Edit ONLY the $ref target (the poem's own YAML is untouched) and bump its
  // mtime into the future so it is unambiguously newer than the built page.
  fs.writeFileSync(refTarget, 'note:\n  label: Note\n  content: updated note\n', 'utf8');
  const future = (Date.now() + 60_000) / 1000;
  fs.utimesSync(refTarget, future, future);

  buildAllPoems({ poemsDir, publicDir });

  const html = fs.readFileSync(pagePath, 'utf8');
  assert.ok(
    fs.statSync(pagePath).mtimeMs > pageMtimeBefore,
    'the poem page must be regenerated when a $ref target it depends on changes'
  );
  assert.match(html, /updated note/,
    'the regenerated page must reflect the edited $ref content');
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

test('buildAllPoems rejects a source file whose stem slugifies to an empty slug (process exits non-zero)', (t) => {
  const { poemsDir } = tmpDirs(t);
  const base = path.dirname(path.dirname(poemsDir));
  fs.writeFileSync(path.join(poemsDir, '!!!.yaml'), FIXTURE_YAML, 'utf8');

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
  assert.match(result.stderr, /yields an empty slug/);
});

test('buildAllPoems rejects two source files whose stems slugify to the same slug (process exits non-zero)', (t) => {
  const { poemsDir } = tmpDirs(t);
  const base = path.dirname(path.dirname(poemsDir));
  fs.writeFileSync(path.join(poemsDir, 'my-poem.yaml'), FIXTURE_YAML, 'utf8');
  fs.writeFileSync(path.join(poemsDir, 'My Poem.yaml'), FIXTURE_YAML, 'utf8');

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
  assert.match(result.stderr, /slug collision/);
  assert.match(result.stderr, /my-poem\.yaml/);
  assert.match(result.stderr, /My Poem\.yaml/);
});
