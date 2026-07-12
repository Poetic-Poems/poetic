#!/usr/bin/env node
/**
 * Regenerate src/tools/song-handlers-data.js from src/song-handlers.yaml.
 *
 * song-handlers.yaml stays the human-authored source of the builtin song
 * handlers; this emits its parsed form as a plain JS data module so
 * song-handlers.js can load the builtins with no `fs` — keeping that module
 * (and the browser renderer that depends on it, src/browser/render.js)
 * filesystem-free. The two are kept in lock-step by
 * test/song-handlers-data.test.js; run `npm run build:generated` whenever
 * song-handlers.yaml changes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REPO_ROOT } = require('./repo-root');

const YAML_PATH = path.join(REPO_ROOT, 'src', 'song-handlers.yaml');
const OUT_PATH = path.join(REPO_ROOT, 'src', 'tools', 'song-handlers-data.js');

/**
 * Build the exact text of song-handlers-data.js from the YAML source. Pure
 * (reads the YAML, returns a string) so the freshness test can compare it
 * against the committed file without writing anything.
 */
function generate() {
  const parsed = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));
  const data = (parsed && typeof parsed === 'object') ? parsed : {};
  return [
    '// AUTO-GENERATED — do not edit by hand.',
    '// Source: src/song-handlers.yaml',
    '// Regenerate: npm run build:generated  (src/tools/build-song-handlers-data.js)',
    '//',
    "// Plain-data module of the framework's builtin song handlers, emitted so",
    '// song-handlers.js can load them with no `fs` (keeping it browser-safe —',
    '// see src/browser/render.js).',
    '',
    "'use strict';",
    '',
    'module.exports = ' + JSON.stringify(data, null, 2) + ';',
    '',
  ].join('\n');
}

if (require.main === module) {
  fs.writeFileSync(OUT_PATH, generate(), 'utf8');
  console.log('Wrote', path.relative(REPO_ROOT, OUT_PATH));
}

module.exports = { generate, YAML_PATH, OUT_PATH };
