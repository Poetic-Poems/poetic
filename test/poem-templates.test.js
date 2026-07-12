'use strict';

/**
 * Guards the precompiled Pug templates (src/tools/poem-templates.js).
 *
 *   1. Freshness — the committed file matches what build-templates.js emits, so
 *      a .pug edit that skips regeneration is caught.
 *   2. Equivalence — each precompiled template renders byte-for-byte identically
 *      to the runtime `pug.compileFile`, so the browser render path (which uses
 *      the precompiled functions) can never silently diverge from the Node build
 *      path (which compiles at runtime).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pug = require('pug');
const yaml = require('js-yaml');

const {
  generate,
  OUT_PATH,
  FRAGMENT_TEMPLATE,
  PAGE_TEMPLATE,
} = require('../src/tools/build-templates');
const { renderFragmentTemplate, renderPageTemplate } = require('../src/tools/poem-templates');
const { resolveContextVars, songsFor } = require('../src/tools/render-core');
const { convertPoemToYaml } = require('../src/tools/poem-to-yaml');
const { slugFromFile } = require('../src/tools/slugify');
const { formatDateForDisplay } = require('../src/tools/date-utils');

const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');
const PUG_RUNTIME_OPTS = { pretty: false, cache: false };

test('poem-templates.js is up to date with the .pug sources', () => {
  const committed = fs.readFileSync(OUT_PATH, 'utf8');
  assert.strictEqual(
    committed,
    generate(),
    'src/tools/poem-templates.js is stale. Regenerate it:\n  npm run build:generated'
  );
});

test('precompiled templates render identically to the runtime pug.compileFile', () => {
  const runtimeFragment = pug.compileFile(FRAGMENT_TEMPLATE, PUG_RUNTIME_OPTS);
  const runtimePage = pug.compileFile(PAGE_TEMPLATE, PUG_RUNTIME_OPTS);

  const files = fs
    .readdirSync(POEM_DIR)
    .filter((f) => f.endsWith('.poem') && f !== '.shared.poem');
  assert.ok(files.length > 0, 'expected at least one .poem file');

  for (const f of files) {
    const poemPath = path.join(POEM_DIR, f);
    const data = yaml.load(convertPoemToYaml(poemPath, { sharedPoemPath: null }));
    data.slug = slugFromFile(poemPath);
    if (data.date) data.date = formatDateForDisplay(data.date);

    const resolved = resolveContextVars(data);
    const songs = songsFor(resolved, {});

    const fragmentLocals = { ...resolved, songs, labelBase: '' };
    assert.strictEqual(
      renderFragmentTemplate(fragmentLocals),
      runtimeFragment(fragmentLocals),
      `precompiled fragment template drifted for ${f}`
    );

    const pageLocals = { ...resolved, favicon: 'poetic-logo.svg', subtitle: 'My Poems', songs, labelBase: '../' };
    assert.strictEqual(
      renderPageTemplate(pageLocals),
      runtimePage(pageLocals),
      `precompiled page template drifted for ${f}`
    );
  }
});
