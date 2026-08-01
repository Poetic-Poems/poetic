'use strict';

/**
 * Tests for yaml-to-poem.js's CLI orchestration (convertAllYamlToPoem): the
 * --all loop that converts every src/poems/yaml/*.yaml file to
 * src/poems/poem/*.poem, mirroring test/poem-to-yaml.test.js's pattern for
 * convertAllPoemsToYaml(). See test/yaml-to-poem.test.js and
 * test/yaml-to-poem-roundtrip.test.js for the pure converter-class tests.
 *
 * convertAllYamlToPoem() accepts optional { yamlDir, poemDir } overrides
 * (see src/tools/yaml-to-poem.js) — the `--all` CLI entry point never passes
 * them and uses the real REPO_ROOT-derived paths, but tests do,
 * so each test runs against its own isolated temp directories rather than
 * the real src/poems/yaml and src/poems/poem.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const { convertAllYamlToPoem } = require('../src/tools/yaml-to-poem');

const FIXTURE_DATA = {
  title: 'Sample Poem',
  date: '1970-01-01',
  versions: [{ segments: [{ lines: 'a line\n' }] }],
};

// A throwaway { yamlDir, poemDir } pair, cleaned up when the test ends.
function tmpDirs(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-yaml-to-poem-'));
  const yamlDir = path.join(base, 'src', 'poems', 'yaml');
  const poemDir = path.join(base, 'src', 'poems', 'poem');
  fs.mkdirSync(yamlDir, { recursive: true });
  fs.mkdirSync(poemDir, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { yamlDir, poemDir };
}

test('convertAllYamlToPoem is exported and is a no-op (no throw, nothing written) when the yaml dir is empty', (t) => {
  assert.strictEqual(typeof convertAllYamlToPoem, 'function');
  const { yamlDir, poemDir } = tmpDirs(t);

  const converted = convertAllYamlToPoem({ yamlDir, poemDir });

  assert.strictEqual(converted, 0);
  assert.deepStrictEqual(fs.readdirSync(poemDir), []);
});

test('convertAllYamlToPoem writes src/poems/poem/<stem>.poem for a source yaml file', (t) => {
  const { yamlDir, poemDir } = tmpDirs(t);
  fs.writeFileSync(path.join(yamlDir, 'sample.yaml'), yaml.dump(FIXTURE_DATA), 'utf8');

  const converted = convertAllYamlToPoem({ yamlDir, poemDir });

  assert.strictEqual(converted, 1);
  const poemPath = path.join(poemDir, 'sample.poem');
  assert.ok(fs.existsSync(poemPath), `${poemPath} should have been generated`);
  assert.match(fs.readFileSync(poemPath, 'utf8'), /^Sample Poem\n1970-01-01\n/);
});

test('convertAllYamlToPoem skips a partial/private file (leading "_" or ".")', (t) => {
  const { yamlDir, poemDir } = tmpDirs(t);
  fs.writeFileSync(path.join(yamlDir, '_example.yaml'), yaml.dump(FIXTURE_DATA), 'utf8');
  fs.writeFileSync(path.join(yamlDir, '.shared.yaml'), yaml.dump(FIXTURE_DATA), 'utf8');

  const converted = convertAllYamlToPoem({ yamlDir, poemDir });

  assert.strictEqual(converted, 0);
  assert.deepStrictEqual(fs.readdirSync(poemDir), []);
});

test('convertAllYamlToPoem logs and skips a per-file conversion failure rather than throwing', (t) => {
  const { yamlDir, poemDir } = tmpDirs(t);
  // A YAML file with no `versions` key fails conversion ("No versions found").
  fs.writeFileSync(path.join(yamlDir, 'broken.yaml'), yaml.dump({ title: 'Broken', date: '1970-01-01' }), 'utf8');
  fs.writeFileSync(path.join(yamlDir, 'sample.yaml'), yaml.dump(FIXTURE_DATA), 'utf8');

  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  let converted;
  try {
    converted = convertAllYamlToPoem({ yamlDir, poemDir });
  } finally {
    console.error = originalError;
  }

  assert.strictEqual(converted, 1);
  assert.ok(fs.existsSync(path.join(poemDir, 'sample.poem')));
  assert.ok(!fs.existsSync(path.join(poemDir, 'broken.poem')));
  assert.ok(
    errors.some((e) => /Error converting broken\.yaml/.test(e)),
    `expected an error to be logged for broken.yaml, got: ${JSON.stringify(errors)}`
  );
});
