'use strict';

/**
 * Tests for the browser-safe renderer (src/browser/render.js) — the M0 spike.
 *
 * Two guarantees, matching the milestone's exit criteria:
 *   1. Parity — renderPoem/renderPoemPage produce byte-for-byte identical HTML
 *      to the Node build path (poem-render.js), so `.poem` behaviour has a
 *      single source. This also proves the round-trip flag: the browser path
 *      (parse → object → render) equals the build path (parse → YAML → reload →
 *      render) for the whole poem corpus.
 *   2. Browser safety — the entire dependency graph reachable from the entry
 *      loads no Node built-in (fs/path/os/...) and references no
 *      `__dirname`/`__filename`, so it can be bundled for a browser/edge runtime.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const { renderPoem, renderPoemPage } = require('../src/browser/render');
const { convertPoemToYaml } = require('../src/tools/poem-to-yaml');
const { renderFragment, renderPage } = require('../src/tools/poem-render');
const { slugFromFile } = require('../src/tools/slugify');
const { formatDateForDisplay } = require('../src/tools/date-utils');

const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');
const ENTRY = path.join(__dirname, '..', 'src', 'browser', 'render.js');

// Non-default favicon/subtitle so the page test exercises those locals rather
// than only the renderPagePage defaults.
const PAGE_OPTS = { favicon: 'my-favicon.svg', subtitle: 'A Test Subtitle' };

function corpus() {
  return fs
    .readdirSync(POEM_DIR)
    .filter((f) => f.endsWith('.poem') && f !== '.shared.poem')
    .sort();
}

/**
 * The Node build path's poem-data object for a `.poem` file: parse → dump YAML →
 * reload → augment (slug + display date), exactly as build-poems.js does. The
 * shared-poem prepend is disabled (sharedPoemPath: null) so both paths render
 * the identical source text — this isolates the render, not `.shared.poem`
 * behaviour. `.poem`-derived YAML never contains `$ref`, so no ref resolution is
 * needed here.
 */
function buildPathData(poemPath) {
  const obj = yaml.load(convertPoemToYaml(poemPath, { sharedPoemPath: null }));
  obj.slug = slugFromFile(poemPath);
  if (obj.date) obj.date = formatDateForDisplay(obj.date);
  return obj;
}

test('renderPoem matches the Node build fragment byte-for-byte across the corpus', () => {
  const files = corpus();
  assert.ok(files.length > 0, 'expected at least one .poem file');
  for (const f of files) {
    const poemPath = path.join(POEM_DIR, f);
    const text = fs.readFileSync(poemPath, 'utf8');
    const slug = slugFromFile(poemPath);

    const browser = renderPoem(text, { slug, config: {} });
    const build = renderFragment(buildPathData(poemPath), { config: {} });

    assert.strictEqual(browser, build, `renderPoem drifted from renderFragment for ${f}`);
  }
});

test('renderPoemPage matches the Node build page byte-for-byte across the corpus', () => {
  for (const f of corpus()) {
    const poemPath = path.join(POEM_DIR, f);
    const text = fs.readFileSync(poemPath, 'utf8');
    const slug = slugFromFile(poemPath);

    const browser = renderPoemPage(text, { slug, config: {}, ...PAGE_OPTS });
    const build = renderPage(buildPathData(poemPath), { config: {}, ...PAGE_OPTS });

    assert.strictEqual(browser, build, `renderPoemPage drifted from renderPage for ${f}`);
  }
});

test('the browser renderer loads and renders with zero Node built-ins in its graph', () => {
  // Run in a clean child process so module-cache state from the parity tests
  // above cannot hide a nested built-in load. Any require of a built-in
  // (fs/path/os/...) throws, failing the child (and this test).
  const script = `
    const Module = require('module');
    const builtins = new Set(require('module').builtinModules);
    const realLoad = Module._load;
    Module._load = function (request) {
      if (builtins.has(String(request).replace(/^node:/, ''))) {
        throw new Error('BUILTIN_LOADED:' + request);
      }
      return realLoad.apply(this, arguments);
    };
    const { renderPoem } = require(${JSON.stringify(ENTRY)});
    const out = renderPoem('A Title\\n2024-01-15\\n\\nline one\\n');
    if (!out.includes('line one')) throw new Error('unexpected render output');
    process.stdout.write('OK:' + out.length);
  `;
  const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.match(out, /^OK:\d+$/);
});

/**
 * Statically walk the require graph from the browser entry, following only
 * relative (`./`, `../`) requires and collecting bare (npm) specifiers. Comments
 * are stripped first so prose mentioning `fs`/`__dirname` (as this file's own
 * docs do) is not mistaken for code.
 */
function staticGraph(entry) {
  const files = new Set();
  const bareDeps = new Set();
  const stack = [entry];
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  while (stack.length) {
    const file = stack.pop();
    if (files.has(file)) continue;
    files.add(file);
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        let resolved = path.resolve(path.dirname(file), spec);
        if (!resolved.endsWith('.js')) resolved += '.js';
        stack.push(resolved);
      } else {
        bareDeps.add(spec);
      }
    }
  }
  return { files: [...files], bareDeps: [...bareDeps], stripComments };
}

test('the browser graph pulls only browser-safe npm deps and no fs/path/__dirname', () => {
  const { files, bareDeps, stripComments } = staticGraph(ENTRY);

  assert.deepStrictEqual(
    bareDeps.sort(),
    ['js-yaml', 'markdown-it'],
    'browser graph gained an unexpected bare dependency (must stay browser-bundleable)'
  );

  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(path.join(__dirname, '..'), file);
    assert.ok(!/\b__dirname\b/.test(src), `${rel} references __dirname`);
    assert.ok(!/\b__filename\b/.test(src), `${rel} references __filename`);
    assert.ok(!/require\(\s*['"](?:node:)?fs['"]\s*\)/.test(src), `${rel} requires fs`);
    assert.ok(!/require\(\s*['"](?:node:)?path['"]\s*\)/.test(src), `${rel} requires path`);
  }
});
