'use strict';

/**
 * Tests for poem-to-yaml.js's CLI orchestration (convertAllPoemsToYaml): the
 * --all loop that converts every src/poems/poem/*.poem file to
 * src/poems/yaml/*.yaml, mirroring test/build-poems.test.js's pattern for
 * buildAllPoems().
 *
 * convertAllPoemsToYaml() accepts optional { poemDir, yamlDir } overrides
 * (see src/tools/poem-to-yaml.js) — the npm run build / CLI entry point
 * never passes them and uses the real REPO_ROOT-derived paths, but tests do,
 * so each test runs against its own isolated temp directories rather than
 * the real src/poems/poem and src/poems/yaml.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { convertAllPoemsToYaml } = require('../src/tools/poem-to-yaml');

const FIXTURE_POEM = 'Sample Poem\n1970-01-01\n\n{Verse}\na line\n';

// A throwaway { poemDir, yamlDir } pair, cleaned up when the test ends.
function tmpDirs(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-poem-to-yaml-'));
  const poemDir = path.join(base, 'src', 'poems', 'poem');
  const yamlDir = path.join(base, 'src', 'poems', 'yaml');
  fs.mkdirSync(poemDir, { recursive: true });
  fs.mkdirSync(yamlDir, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { poemDir, yamlDir };
}

// Capture console.log/console.warn output produced while running `fn`.
function captureLogs(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  const warnings = [];
  console.log = (...args) => logs.push(args.join(' '));
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  return { logs, warnings };
}

test('convertAllPoemsToYaml is exported and is a no-op (no throw, no output) when the poem dir is empty', (t) => {
  assert.strictEqual(typeof convertAllPoemsToYaml, 'function');
  const { poemDir, yamlDir } = tmpDirs(t);

  convertAllPoemsToYaml({ poemDir, yamlDir });

  assert.deepStrictEqual(fs.readdirSync(yamlDir), []);
});

test('convertAllPoemsToYaml writes src/poems/yaml/<stem>.yaml for a source poem', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToYaml({ poemDir, yamlDir });

  const yamlPath = path.join(yamlDir, 'sample.yaml');
  assert.ok(fs.existsSync(yamlPath), `${yamlPath} should have been generated`);
  assert.match(fs.readFileSync(yamlPath, 'utf8'), /title: Sample Poem/);
});

test('convertAllPoemsToYaml skips a partial/private file (leading "_" or ".")', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemDir, '_partial.poem'), FIXTURE_POEM, 'utf8');
  fs.writeFileSync(path.join(poemDir, '.shared.poem'), '', 'utf8');

  convertAllPoemsToYaml({ poemDir, yamlDir });

  assert.deepStrictEqual(fs.readdirSync(yamlDir), []);
});

test('convertAllPoemsToYaml does not rewrite an up-to-date poem\'s YAML on a second run, and reports the skip count', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  fs.writeFileSync(path.join(poemDir, 'sample.poem'), FIXTURE_POEM, 'utf8');

  convertAllPoemsToYaml({ poemDir, yamlDir });

  const yamlPath = path.join(yamlDir, 'sample.yaml');
  const mtimeBefore = fs.statSync(yamlPath).mtimeMs;

  const { logs } = captureLogs(() => convertAllPoemsToYaml({ poemDir, yamlDir }));

  assert.strictEqual(
    fs.statSync(yamlPath).mtimeMs, mtimeBefore,
    'sample.yaml should not be rewritten when the source is unchanged'
  );
  assert.ok(
    logs.some((l) => /1 poem\(s\) already up to date, skipped\./.test(l)),
    'the skip count should be reported'
  );
});

test('convertAllPoemsToYaml regenerates a poem\'s YAML once the source .poem changes', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  const poemPath = path.join(poemDir, 'sample.poem');
  fs.writeFileSync(poemPath, FIXTURE_POEM, 'utf8');

  convertAllPoemsToYaml({ poemDir, yamlDir });

  const yamlPath = path.join(yamlDir, 'sample.yaml');

  // Rewind the output's mtime into the past, then read it back as the
  // baseline, so a regenerated file's fresh mtime is unambiguously newer,
  // regardless of filesystem mtime-resolution granularity.
  const past = (Date.now() - 60_000) / 1000;
  fs.utimesSync(yamlPath, past, past);
  const mtimeBefore = fs.statSync(yamlPath).mtimeMs;

  // Bump the source's mtime into the future so it's unambiguously newer,
  // regardless of filesystem mtime-resolution granularity.
  const future = (Date.now() + 60_000) / 1000;
  fs.utimesSync(poemPath, future, future);

  convertAllPoemsToYaml({ poemDir, yamlDir });

  assert.ok(
    fs.statSync(yamlPath).mtimeMs > mtimeBefore,
    'sample.yaml should be regenerated once its source .poem changes'
  );
});

test('convertAllPoemsToYaml warns about a stale YAML artefact with no source poem', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  fs.writeFileSync(path.join(yamlDir, 'orphan.yaml'), 'title: Orphan\n', 'utf8');

  const { warnings } = captureLogs(() => convertAllPoemsToYaml({ poemDir, yamlDir }));

  assert.ok(
    warnings.some((w) => /stale YAML artefact.*orphan\.yaml/.test(w)),
    `expected a stale-artefact warning, got: ${JSON.stringify(warnings)}`
  );
});

test('convertAllPoemsToYaml does not warn about the reserved YAML-SCHEMA.yaml file', (t) => {
  const { poemDir, yamlDir } = tmpDirs(t);
  fs.writeFileSync(path.join(yamlDir, 'YAML-SCHEMA.yaml'), '', 'utf8');

  const { warnings } = captureLogs(() => convertAllPoemsToYaml({ poemDir, yamlDir }));

  assert.deepStrictEqual(warnings, []);
});

test('convertAllPoemsToYaml counts a per-file conversion failure and exits non-zero (process exits non-zero)', (t) => {
  // Runs the real CLI entry point as a subprocess (rather than calling
  // convertAllPoemsToYaml() in-process) because a conversion error makes it
  // call process.exit(1), which would otherwise tear down the whole test
  // worker.
  const { poemDir, yamlDir } = tmpDirs(t);
  // A .poem file with no title/date lines fails to parse ("Missing title").
  fs.writeFileSync(path.join(poemDir, 'broken.poem'), '', 'utf8');

  const script = `
    const { convertAllPoemsToYaml } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'tools', 'poem-to-yaml.js'))});
    convertAllPoemsToYaml({
      poemDir: ${JSON.stringify(poemDir)},
      yamlDir: ${JSON.stringify(yamlDir)},
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Error converting broken\.poem/);
  assert.match(result.stderr, /1 poem\(s\) failed to convert\./);
});
