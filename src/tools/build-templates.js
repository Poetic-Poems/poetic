#!/usr/bin/env node
/**
 * Regenerate src/tools/poem-templates.js — the Pug templates precompiled to
 * standalone JS functions.
 *
 * The runtime build path (poem-render.js) compiles src/templates/*.pug on the
 * fly with `pug.compileFile`, which needs both the Pug compiler and the
 * filesystem. The browser renderer (src/browser/render.js) can afford neither,
 * so this emits the same templates as plain functions with the Pug runtime
 * inlined — no `pug`, no `fs`, no `__dirname`. `inlineRuntimeFunctions` makes
 * each function fully self-contained; wrapping each in an IIFE keeps the two
 * inlined runtimes from colliding.
 *
 * The precompiled output is byte-identical to the runtime compile (asserted by
 * test/poem-templates.test.js over the whole poem corpus), so the two render
 * paths can never silently diverge. Run `npm run build:generated` whenever a
 * .pug template changes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const pug = require('pug');
const { REPO_ROOT } = require('./repo-root');

const TEMPLATES_DIR = path.join(REPO_ROOT, 'src', 'templates');
const FRAGMENT_TEMPLATE = path.join(TEMPLATES_DIR, 'poem.pug');
const PAGE_TEMPLATE = path.join(TEMPLATES_DIR, 'poem-page.pug');
const OUT_PATH = path.join(REPO_ROOT, 'src', 'tools', 'poem-templates.js');

// Match poem-render.js's runtime options (pretty:false) so the precompiled
// output is byte-identical. inlineRuntimeFunctions makes the output standalone;
// compileDebug:false drops source-mapping scaffolding from the emitted code.
const PUG_OPTS = {
  name: 'template',
  inlineRuntimeFunctions: true,
  compileDebug: false,
  pretty: false,
};

/**
 * Build the exact text of poem-templates.js. Pure (reads the .pug sources,
 * returns a string) so the freshness test can compare it against the committed
 * file without writing anything.
 */
function generate() {
  const fragment = pug.compileFileClient(FRAGMENT_TEMPLATE, PUG_OPTS);
  const page = pug.compileFileClient(PAGE_TEMPLATE, PUG_OPTS);
  // Pug's client output indents its blank separator lines, leaving trailing
  // whitespace that would fail `npm run check`. Those lines carry no code (a JS
  // string literal can't span a line, so this only ever trims after a line's
  // last non-space character), so stripping them is safe and semantics-neutral.
  const out = [
    '// AUTO-GENERATED — do not edit by hand.',
    '// Source: src/templates/poem.pug, src/templates/poem-page.pug (+ _poem-content.pug)',
    '// Regenerate: npm run build:generated  (src/tools/build-templates.js)',
    '//',
    '// Pug templates precompiled to standalone JS functions (no `pug`, no `fs`),',
    '// so the browser renderer (src/browser/render.js) can render without the Pug',
    '// compiler or the filesystem. Each takes the same locals object the',
    '// runtime-compiled template does, and is kept byte-identical to the runtime',
    '// compile by test/poem-templates.test.js.',
    '',
    "'use strict';",
    '',
    'const renderFragmentTemplate = (function () {',
    fragment,
    'return template;',
    '})();',
    '',
    'const renderPageTemplate = (function () {',
    page,
    'return template;',
    '})();',
    '',
    'module.exports = { renderFragmentTemplate, renderPageTemplate };',
    '',
  ].join('\n');
  return out.replace(/[ \t]+$/gm, '');
}

if (require.main === module) {
  fs.writeFileSync(OUT_PATH, generate(), 'utf8');
  console.log('Wrote', path.relative(REPO_ROOT, OUT_PATH));
}

module.exports = { generate, OUT_PATH, FRAGMENT_TEMPLATE, PAGE_TEMPLATE };
