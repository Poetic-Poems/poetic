'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { convertPoemToYaml } = require('../src/tools/poem-to-yaml');

const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');

test('_example.poem matches the golden fixture', () => {
  const actual = convertPoemToYaml(path.join(POEM_DIR, '_example.poem'));
  const goldenPath = path.join(__dirname, 'golden', '_example.yaml');
  const golden = fs.readFileSync(goldenPath, 'utf8');
  assert.strictEqual(
    actual,
    golden,
    'Output drifted from test/golden/_example.yaml. If intentional, regenerate it:\n' +
      "  node -e \"process.stdout.write(require('./src/tools/poem-to-yaml').convertPoemToYaml('src/poems/poem/_example.poem'))\" > test/golden/_example.yaml"
  );
});

test('every poem in the corpus converts without throwing', () => {
  const files = fs
    .readdirSync(POEM_DIR)
    .filter((f) => f.endsWith('.poem') && f !== '.shared.poem');
  assert.ok(files.length > 0, 'expected at least one .poem file');
  for (const f of files) {
    assert.doesNotThrow(
      () => convertPoemToYaml(path.join(POEM_DIR, f)),
      `${f} should convert without error`
    );
  }
});
