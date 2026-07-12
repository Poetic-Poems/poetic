'use strict';

/**
 * Guards the generated builtin-song-handler data module against drift from its
 * YAML source. song-handlers.yaml stays the human-authored source; song-handlers.js
 * loads the generated ./song-handlers-data.js so it needs no `fs` (browser-safe).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const yaml = require('js-yaml');

const { generate, OUT_PATH, YAML_PATH } = require('../src/tools/build-song-handlers-data');

test('song-handlers-data.js is up to date with song-handlers.yaml', () => {
  const committed = fs.readFileSync(OUT_PATH, 'utf8');
  assert.strictEqual(
    committed,
    generate(),
    'src/tools/song-handlers-data.js is stale. Regenerate it:\n  npm run build:generated'
  );
});

test('the generated data equals the parsed YAML source', () => {
  const data = require('../src/tools/song-handlers-data');
  const parsed = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));
  assert.deepStrictEqual(data, parsed);
});
